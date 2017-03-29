/* @flow */

// Reducers needed for main application

import { combineReducers } from 'redux';

import commonReducers from "./reducers-common";

/* admin */
import adminReducers from "./reducers-admin";

/* setup */
import * as setup from "metabase/setup/reducers";

/* user settings */
import * as user from "metabase/user/reducers";

/* dashboards */
import dashboard from "metabase/dashboard/dashboard";
import * as home from "metabase/home/reducers";

/* questions / query builder */
import questions from "metabase/questions/questions";
import labels from "metabase/questions/labels";
import collections from "metabase/questions/collections";
import * as qb from "metabase/query_builder/reducers";

import newQuestion from "metabase/new_question/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

export default {
    ...commonReducers,

    // main app reducers
    dashboard,
    home: combineReducers(home),
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    newQuestion,
    questions,
    collections,
    labels,
    reference,
    setup: combineReducers(setup),
    user: combineReducers(user),

    ...adminReducers
};
