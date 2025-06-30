import "./cypress";
import { renameConflictingCljsGlobals } from "embedding-sdk/sdk-wrapper/test/rename-conflicting-cljs-globals";

beforeEach(function () {
  renameConflictingCljsGlobals();
});
