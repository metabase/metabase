// Reducers needed for admin section (only used in "main" app)

import { appReducer as app } from "metabase/admin/app/reducers";
import { databasesReducer as databases } from "metabase/admin/databases/database";
import { datamodel } from "metabase/admin/datamodel/datamodel";
import { people } from "metabase/admin/people/people";
import { permissions } from "metabase/admin/permissions/permissions";
import { settings } from "metabase/admin/settings/settings";
import { combineReducers } from "metabase/lib/redux";

export const admin = combineReducers({
  app,
  databases,
  datamodel,
  people,
  permissions,
  settings,
});
