import reducers from 'metabase/reducers-main';
import { combineReducers, createStore, applyMiddleware} from 'redux'

import thunk from "redux-thunk";
import promise from "redux-promise";
import logger from "redux-logger";

const createTestStore = (initialState) =>
    createStore(combineReducers(reducers), initialState, applyMiddleware(thunk, promise, logger()))

export const noDashboardsStore = createTestStore({dashboards: {dashboardListing: []}});

// Dumped from redux state tree 4/10/17
export const twoDashboardsStore = createTestStore({
    dashboards: {
        dashboardListing: [
            {
                description: 'For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response',
                creator: {
                    email: 'atte@metabase.com',
                    first_name: 'Atte',
                    last_login: '2017-04-10T23:56:12.562Z',
                    is_qbnewb: false,
                    is_superuser: false,
                    id: 1,
                    last_name: 'Keinänen',
                    date_joined: '2017-03-17T03:37:27.396Z',
                    common_name: 'Atte Keinänen'
                },
                enable_embedding: false,
                show_in_getting_started: false,
                name: 'Customer Feedback Analysis',
                caveats: null,
                creator_id: 1,
                updated_at: '2017-04-05T00:23:20.991Z',
                made_public_by_id: null,
                embedding_params: null,
                id: 3,
                parameters: [
                    {
                        name: 'Date Range',
                        slug: 'date_range',
                        id: 'fc68dfa5',
                        type: 'date/range',
                        'default': '2017-03-07~2017-03-14'
                    }
                ],
                created_at: '2017-03-28T23:24:16.891Z',
                public_uuid: null,
                points_of_interest: null
            },
            {
                description: 'For seeing our progress over time, and if there are bottlenecks in our product development process',
                creator: {
                    email: 'atte@metabase.com',
                    first_name: 'Atte',
                    last_login: '2017-04-10T23:56:12.562Z',
                    is_qbnewb: false,
                    is_superuser: false,
                    id: 1,
                    last_name: 'Keinänen',
                    date_joined: '2017-03-17T03:37:27.396Z',
                    common_name: 'Atte Keinänen'
                },
                enable_embedding: false,
                show_in_getting_started: false,
                name: 'Kanban Breakdown Chart',
                caveats: null,
                creator_id: 1,
                updated_at: '2017-04-04T20:41:50.616Z',
                made_public_by_id: null,
                embedding_params: null,
                id: 7,
                parameters: [],
                created_at: '2017-04-04T20:39:01.263Z',
                public_uuid: null,
                points_of_interest: null
            }
        ]
    }
});
