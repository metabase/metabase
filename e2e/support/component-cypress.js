import "./cypress";
import { renameConflictingCljsGlobals } from "metabase/embedding-sdk/test/rename-conflicting-cljs-globals";

beforeEach(() => {
  renameConflictingCljsGlobals();
});
