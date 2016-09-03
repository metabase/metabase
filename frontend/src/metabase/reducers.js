
import { combineReducers } from 'redux';

import auth from "metabase/auth/auth";

/* ducks */
import metadata from "metabase/redux/metadata";
import requests from "metabase/redux/requests";

/* admin */
import settings from "metabase/admin/settings/settings";
import * as people from "metabase/admin/people/reducers";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/metadata";
import permissions from "metabase/admin/permissions/permissions";

/* dashboards */
import dashboard from "metabase/dashboard/dashboard";
import * as home from "metabase/home/reducers";

/* questions / query builder */
import questions from "metabase/questions/questions";
import labels from "metabase/questions/labels";
import undo from "metabase/questions/undo";
import * as qb from "metabase/query_builder/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

/* setup */
import * as setup from "metabase/setup/reducers";

/* user */
import * as user from "metabase/user/reducers";
import { currentUser } from "metabase/user";

const reducers = {
    // global reducers
    auth,
    currentUser,
    metadata,
    requests,

    // main app reducers
    dashboard,
    home: combineReducers(home),
    labels,
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    questions,
    reference,
    setup: combineReducers(setup),
    undo,
    user: combineReducers(user),

    // admin reducers
    databases,
    datamodel: datamodel,
    people: combineReducers(people),
    settings,
    permissions,
};

export default reducers;
