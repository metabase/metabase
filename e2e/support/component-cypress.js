import "./cypress";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

import { METABASE_INSTANCE_URL } from "./helpers";

beforeEach(() => {
  deleteConflictingCljsGlobals();

  // Cypress doesn't allow setting the baseUrl in the component config
  // but all of our helpers expect it to be set.
  Cypress.config("baseUrl", METABASE_INSTANCE_URL);
});
