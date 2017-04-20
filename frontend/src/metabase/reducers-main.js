/* @flow */

// Reducers needed for main application

import { combineReducers } from 'redux';

import commonReducers from "./reducers-common";

/* admin */
import admin from "metabase/admin/admin";

/* setup */
import * as setup from "metabase/setup/reducers";

/* user settings */
import * as user from "metabase/user/reducers";

/* dashboards */
import dashboards from "metabase/dashboards/dashboards";
import dashboard from "metabase/dashboard/dashboard";
import * as home from "metabase/home/reducers";

/* questions / query builder */
import questions from "metabase/questions/questions";
import labels from "metabase/questions/labels";
import collections from "metabase/questions/collections";
import * as qb from "metabase/query_builder/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

export default {
    ...commonReducers,

    // main app reducers
    dashboards,
    dashboard,
    home: combineReducers(home),
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    questions,
    collections,
    labels,
    reference,
    setup: combineReducers(setup),
    user: combineReducers(user),
    admin
};
