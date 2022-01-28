// Reducers needed for admin section (only used in "main" app)

import app from "metabase/admin/app/reducers";
import people from "metabase/admin/people/people";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/datamodel";
import permissions from "metabase/admin/permissions/permissions";
import settings from "metabase/admin/settings/settings";

import { combineReducers } from "metabase/lib/redux";

export default combineReducers({
  app,
  databases,
  datamodel,
  people,
  permissions,
  settings,
});
