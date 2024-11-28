import { capitalize } from "inflection";

import { nativeEditor } from "./e2e-native-editor-helpers";

export function setActionsEnabledForDB(dbId, enabled = true) {
  return cy.request("PUT", `/api/database/${dbId}`, {
    settings: {
      "database-enable-actions": enabled,
    },
  });
}

export function fillActionQuery(query) {
  // Without this wait, content tends to drop from the beginning of the string. TODO: Fix
  nativeEditor().wait(500).type(query, {
    parseSpecialCharSequences: false,
    delay: 50,
  });
}
/**
 *
 * @param {import("metabase/entities/actions/actions").CreateQueryActionParams} actionDetails
 */
export function createAction(actionDetails) {
  return cy.request("POST", "/api/action", actionDetails);
}

/**
 * create a single implicit action of the given kind for the given model
 *
 * @param {Object} actionParams
 * @param {"create" | "update" | "delete "} actionParams.kind
 * @param {number} actionParams.model_id
 */
export function createImplicitAction({ model_id, kind }) {
  return createAction({
    kind: `row/${kind}`,
    name: capitalize(kind),
    type: "implicit",
    model_id,
  });
}

/**
 * create all implicit actions for the given model
 *
 * @param {object} actionParams
 * @param {number} actionParams.model_id
 */
export function createImplicitActions({ modelId }) {
  createImplicitAction({ model_id: modelId, kind: "create" });
  createImplicitAction({ model_id: modelId, kind: "update" });
  createImplicitAction({ model_id: modelId, kind: "delete" });
}
