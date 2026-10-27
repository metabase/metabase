import {
  ORDERS_COUNT_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ENTITY_ID,
} from "e2e/support/cypress_sample_instance_data";
import { type DataAppTestEnv, updateSetting } from "e2e/support/helpers";

/** The `testEnv` the fixture's Overview page reads (Orders count + question). */
export const DATA_APP_TEST_ENV: DataAppTestEnv = {
  scalarQuery: {
    source: { type: "card", entityId: ORDERS_COUNT_QUESTION_ENTITY_ID },
  },
  questionQuery: {
    source: { type: "card", entityId: ORDERS_QUESTION_ENTITY_ID },
  },
};

/**
 * The address a spec serves data apps from: the backend under its other loopback
 * name. The session cookie is host-only, so it doesn't reach this address.
 */
export function getIsolatedOrigin(): string {
  const url = new URL(getSiteUrl());
  url.hostname = url.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
  return url.origin;
}

/** The instance's own address, which `enableIsolatedOrigin` makes the site URL. */
export function getSiteUrl(): string {
  const baseUrl = Cypress.config("baseUrl");
  if (!baseUrl) {
    throw new Error(
      "baseUrl must be set to serve data apps from an isolated origin",
    );
  }
  return new URL(baseUrl).origin;
}

/**
 * Sets `MB_ISOLATED_ORIGIN` until the next snapshot restore. It is environment-only, and
 * every spec shares one backend, so a testing endpoint sets it.
 */
export function setIsolatedOrigin(value: string | null) {
  return cy.request("PUT", "/api/testing/isolated-origin", { value });
}

/** Serves data apps from `getIsolatedOrigin()` until the next snapshot restore. */
export function enableIsolatedOrigin() {
  updateSetting("site-url", getSiteUrl());
  return setIsolatedOrigin(getIsolatedOrigin());
}

/**
 * The fixture's sandbox probes for method and constructor calls the sandbox distortion
 * replaces with a throwing shim. (Getter-only reads like `localStorage` aren't
 * intercepted, so they aren't probed.)
 */
export const SANDBOX_BLOCKED_PROBE_IDS = [
  "script",
  "window-open",
  "alert",
  "history",
  "keydown-listener",
  "websocket",
  "sendbeacon",
];
