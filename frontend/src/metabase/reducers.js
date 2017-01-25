/* @flow weak */

import { combineReducers } from 'redux';

import auth from "metabase/auth/auth";

/* ducks */
import metadata from "metabase/redux/metadata";
import requests from "metabase/redux/requests";
import undo from "metabase/redux/undo";

/* admin */
import settings from "metabase/admin/settings/settings";
import people from "metabase/admin/people/people";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/datamodel";
import permissions from "metabase/admin/permissions/permissions";

/* dashboards */
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

/* setup */
import * as setup from "metabase/setup/reducers";

/* user */
import * as user from "metabase/user/reducers";
import { currentUser } from "metabase/redux/user";

const reducers = {
    // global reducers
    auth,
    currentUser,
    metadata,
    requests,
    undo,

    // main app reducers
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

    // admin reducers
    databases,
    datamodel: datamodel,
    people,
    settings,
    permissions,
};

export default reducers;
