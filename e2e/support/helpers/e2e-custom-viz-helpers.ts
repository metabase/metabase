import type { CustomVizPlugin } from "metabase-types/api";

import { addCustomVizPlugin } from "./api";

export const CUSTOM_VIZ_REPO_PATH =
  Cypress.config("projectRoot") + "/e2e/tmp/custom-viz-repo";

export const CUSTOM_VIZ_REPO_URL = "file://" + CUSTOM_VIZ_REPO_PATH + "/.git";

export const CUSTOM_VIZ_FIXTURE_PATH =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_custom_viz_plugin";

// Backend derives identifier from the last URL path segment
export const CUSTOM_VIZ_IDENTIFIER = "custom-viz-repo";

// Frontend display type: "custom:{identifier}"
export const CUSTOM_VIZ_DISPLAY = "custom:" + CUSTOM_VIZ_IDENTIFIER;

// Second repo for multi-plugin tests
export const CUSTOM_VIZ_REPO_PATH_2 =
  Cypress.config("projectRoot") + "/e2e/tmp/custom-viz-repo-2";

export const CUSTOM_VIZ_REPO_URL_2 =
  "file://" + CUSTOM_VIZ_REPO_PATH_2 + "/.git";

/**
 * Initialize a local git repo with the plugin fixture committed.
 * Creates a fresh repo each time, copies the fixture, and commits.
 */
export function setupCustomVizRepo() {
  cy.exec("rm -rf " + CUSTOM_VIZ_REPO_PATH);
  cy.exec("git config --global init.defaultBranch main");
  cy.exec("git init " + CUSTOM_VIZ_REPO_PATH);
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH} config user.email 'toucan@metabase.com'; git -C ${CUSTOM_VIZ_REPO_PATH} config user.name 'Toucan Cam'`,
  );
  cy.task("copyDirectory", {
    source: CUSTOM_VIZ_FIXTURE_PATH,
    destination: CUSTOM_VIZ_REPO_PATH,
  });
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH} add . && git -C ${CUSTOM_VIZ_REPO_PATH} commit -m 'Initial plugin commit'`,
  );
}

/**
 * Initialize a second local git repo for multi-plugin tests.
 * Uses a different path so the backend derives a different identifier.
 */
export function setupCustomVizRepo2() {
  cy.exec("rm -rf " + CUSTOM_VIZ_REPO_PATH_2);
  cy.exec("git init " + CUSTOM_VIZ_REPO_PATH_2);
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH_2} config user.email 'toucan@metabase.com'; git -C ${CUSTOM_VIZ_REPO_PATH_2} config user.name 'Toucan Cam'`,
  );
  cy.task("copyDirectory", {
    source: CUSTOM_VIZ_FIXTURE_PATH,
    destination: CUSTOM_VIZ_REPO_PATH_2,
  });
  // Override the name in the manifest so we can distinguish the two plugins
  cy.readFile(`${CUSTOM_VIZ_REPO_PATH_2}/metabase-plugin.json`).then(
    (manifest) => {
      cy.writeFile(
        `${CUSTOM_VIZ_REPO_PATH_2}/metabase-plugin.json`,
        JSON.stringify({ ...manifest, name: "demo-viz-2" }),
      );
    },
  );
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH_2} add . && git -C ${CUSTOM_VIZ_REPO_PATH_2} commit -m 'Initial plugin commit'`,
  );
}

/**
 * Setup local repo + register plugin in one call.
 * This is the most common beforeEach pattern for tests
 * that need a working plugin but don't test the install flow.
 */
export function setupCustomVizPlugin(): Cypress.Chainable<CustomVizPlugin> {
  setupCustomVizRepo();
  return addCustomVizPlugin(CUSTOM_VIZ_REPO_URL);
}

// -- Intercept helpers --

export function interceptPluginBundle() {
  cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle").as("pluginBundle");
}

export function interceptPluginList() {
  cy.intercept("GET", "/api/ee/custom-viz-plugin/list").as("pluginList");
}

export function interceptPluginCreate() {
  cy.intercept("POST", "/api/ee/custom-viz-plugin").as("pluginCreate");
}

export function interceptPluginRefresh() {
  cy.intercept("POST", "/api/ee/custom-viz-plugin/*/refresh").as(
    "pluginRefresh",
  );
}

export function waitForPluginBundle() {
  return cy.wait("@pluginBundle");
}

/**
 * Update the fixture in the local git repo and commit.
 * The updateFn receives the repo path and can use cy.writeFile / cy.exec
 * to modify files before the commit.
 */
export function updateFixtureAndCommit(
  updateFn: () => void,
  commitMessage = "Update plugin",
) {
  updateFn();
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH} add . && git -C ${CUSTOM_VIZ_REPO_PATH} commit -am '${commitMessage}'`,
  );
}

// -- Navigation helpers --

export function visitCustomVizSettings() {
  cy.visit("/admin/settings/custom-visualizations");
}

export function visitCustomVizNewForm() {
  cy.visit("/admin/settings/custom-visualizations/new");
}

export function visitCustomVizDevelopment() {
  cy.visit("/admin/settings/custom-visualizations/development");
}

export function visitCustomVizEditForm(id: number) {
  cy.visit(`/admin/settings/custom-visualizations/edit/${id}`);
}

// -- UI helpers --

export function getAddVisualizationLink() {
  return cy.findByRole("link", { name: /Add/ });
}

/**
 * Finds the custom viz plugin icon, which `EntityIcon` renders as a
 * CSS-masked `<span role="img" aria-label={display_name}>` rather than an
 * `<img>` element — so plain `img[src*=...]` selectors don't match.
 */
export function getCustomVizPluginIcon(displayName: string) {
  return cy.get("main").findByRole("img", { name: displayName });
}
