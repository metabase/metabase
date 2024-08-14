import { parseVersionString } from "e2e/test/scenarios/cross-version/helpers/cross-version-helpers.js";

export const version = parseVersionString(Cypress.env("TARGET_VERSION"));
