import "./cypress";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

import { METABASE_INSTANCE_URL } from "./helpers";

beforeEach(() => {
  deleteConflictingCljsGlobals();

  // Cypress doesn't allow setting the baseUrl in the component config
  // but all of our helpers expect it to be set.
  Cypress.config("baseUrl", METABASE_INSTANCE_URL);
});

// TEMPORARY (EMB-2490): the hang watchdog prints these lines to the job log.
Cypress.on("command:start", (command) => {
  // Only primitives are printed: other args can be circular (DOM, jQuery).
  const args = (command.attributes.args ?? [])
    .map((arg) =>
      ["string", "number", "boolean"].includes(typeof arg)
        ? String(arg).slice(0, 80)
        : `<${typeof arg}>`,
    )
    .join(", ");
  console.log("[cy-cmd]", command.attributes.name, args);
});
