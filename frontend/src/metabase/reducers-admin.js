/* @flow */

// Reducers needed for admin section (only used in "main" app)

import people from "metabase/admin/people/people";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/datamodel";
import permissions from "metabase/admin/permissions/permissions";

export default {
    databases,
    datamodel: datamodel,
    people,
    permissions,
};
