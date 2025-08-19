import "./cypress";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

beforeEach(() => {
  deleteConflictingCljsGlobals();
});
