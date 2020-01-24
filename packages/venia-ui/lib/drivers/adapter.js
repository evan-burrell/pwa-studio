import React, { useMemo } from 'react';
import { func, shape, string } from 'prop-types';
import { ApolloProvider } from '@apollo/react-hooks';
import { ApolloClient } from 'apollo-client';
import { persistCache } from 'apollo-cache-persist';
import { createHttpLink } from 'apollo-link-http';
import {
    InMemoryCache,
    IntrospectionFragmentMatcher
} from 'apollo-cache-inmemory';
import { Provider as ReduxProvider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import { cacheKeyFromType } from '../util/apolloCache';
import gql from 'graphql-tag';

// window.gql = gql;

/**
 * To improve initial load time, create an apollo cache object as soon as
 * this module is executed, since it doesn't depend on any component props.
 * The tradeoff is that we may be creating an instance we don't end up needing.
 */
const fragmentMatcher = new IntrospectionFragmentMatcher({
    // UNION_AND_INTERFACE_TYPES is injected into the bundle by webpack at build time.
    introspectionQueryResultData: UNION_AND_INTERFACE_TYPES
});
const preInstantiatedCache = new InMemoryCache({
    dataIdFromObject: cacheKeyFromType,
    fragmentMatcher
});

/**
 * We intentionally do not wait for the async function persistCache to complete
 * because that would negatively affect the initial page load.
 *
 * The tradeoff is that any queries that run before the cache is persisted may not be persisted.
 */
persistCache({
    cache: preInstantiatedCache,
    storage: window.localStorage
});

const initialData = {
    cart: {
        __typename: 'Cart',
        gift_options: {
            __typename: 'GiftOptions',
            include_gift_receipt: false,
            include_printed_card: false,
            gift_message: ''
        }
    }
};

const GET_GIFT_OPTIONS_QUERY = gql`
    query getGiftOptions {
        gift_options @client {
            __typename
            include_gift_receipt
            include_printed_card
            gift_message
        }
    }
`;

const resolvers = {
    Query: {
        gift_options: (_, __, { cache }) => {
            console.log('Hey here dude...', _);
            const {
                gift_options: {
                    __typename,
                    include_gift_receipt,
                    include_printed_card,
                    gift_message
                }
            } = cache.readQuery({
                query: GET_GIFT_OPTIONS_QUERY
            });
            return {
                __typename,
                include_gift_receipt,
                include_printed_card,
                gift_message
            };
        }
    },
    Mutation: {
        set_gift_options: (_, variables, { cache }) => {
            const prevData = cache.readQuery({ query: GET_GIFT_OPTIONS_QUERY });
            cache.writeData({
                data: {
                    gift_options: {
                        __typename: 'GiftOptions',
                        ...prevData,
                        ...variables
                    }
                }
            });
            return null;
        }
    }
};

/**
 * The counterpart to `@magento/venia-drivers` is an adapter that provides
 * context objects to the driver dependencies. The default implementation in
 * `@magento/venia-drivers` uses modules such as `react-redux`, which
 * have implicit external dependencies. This adapter provides all of them at
 * once.
 *
 * Consumers of Venia components can either implement a similar adapter and
 * wrap their Venia component trees with it, or they can override `src/drivers`
 * so its components don't depend on context and IO.
 */
const VeniaAdapter = props => {
    const { apiBase, apollo = {}, children, store } = props;

    const apolloClient = useMemo(() => {
        // If we already have a client instance, use that.
        if (apollo.client) {
            return apollo.client;
        }

        // We need to instantiate an ApolloClient.
        const link = apollo.link
            ? apollo.link
            : VeniaAdapter.apolloLink(apiBase);

        const cache = apollo.cache ? apollo.cache : preInstantiatedCache;
        const client = new ApolloClient({ cache, link, resolvers });

        client.apiBase = apiBase;

        cache.writeData({ data: initialData });

        return client;
    }, [apiBase, apollo]);

    return (
        <ApolloProvider client={apolloClient}>
            <ReduxProvider store={store}>
                <BrowserRouter>{children}</BrowserRouter>
            </ReduxProvider>
        </ApolloProvider>
    );
};

/**
 * We attach this Link as a static method on VeniaAdapter because
 * other modules in the codebase need access to it.
 */
VeniaAdapter.apolloLink = apiBase => {
    return createHttpLink({
        uri: apiBase
    });
};

VeniaAdapter.propTypes = {
    apiBase: string.isRequired,
    apollo: shape({
        client: shape({
            query: func.isRequired
        }),
        link: shape({
            request: func.isRequired
        }),
        cache: shape({
            readQuery: func.isRequired
        })
    }),
    store: shape({
        dispatch: func.isRequired,
        getState: func.isRequired,
        subscribe: func.isRequired
    }).isRequired
};

export default VeniaAdapter;
