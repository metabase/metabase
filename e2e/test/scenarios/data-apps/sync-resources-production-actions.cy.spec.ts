import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { WritebackAction } from "metabase-types/api";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";

const APP_SLUG = "synced-actions-app";
const APP_DISPLAY_NAME = "Synced Actions App";

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;
const ACTION_FILE = () => `${APP_ROOT()}/actions/orders.action.ts`;
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;
const LOCKFILE = () => `${APP_ROOT()}/resources_metadata.json`;

/** The manifest as source control holds it. */
const AUTHORED_MANIFEST = `name: ${APP_DISPLAY_NAME}\npath: ./dist/index.js\n`;

/** The declaration as source control holds it, with no generated ID yet. */
const declaration = (sourceActionId: number) =>
  [
    'import { defineAction } from "@metabase/embedding-sdk-react/data-app";',
    "",
    "export const CreateScore = defineAction({",
    `  action: { id: ${sourceActionId}, parameters: [] },`,
    "});",
    "",
  ].join("\n");

/**
 * The action half of the production path. Outside the dev preview
 * `toExecutableActionId` runs `copiedActionId` — the copy hanging off the copied
 * model — because that is the only action an app's viewers may execute.
 */
describe(
  "scenarios > data apps > sync-resources in production (actions)",
  { tags: ["@external", "@actions"] },
  () => {
    // Restore the source files and remove the lockfile before each synchronization.
    const restoreAuthoredFixture = () => {
      cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
      cy.task("removeDataAppPaths", { paths: [ACTION_FILE(), LOCKFILE()] });
    };

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);
      H.createModelFromTableName({
        tableName: TEST_TABLE,
        modelName: MODEL_NAME,
      });

      restoreAuthoredFixture();
      H.createDataAppApiKey().as("apiKey");

      cy.get<number>("@modelId")
        .then((modelId) =>
          H.createImplicitAction({ model_id: modelId, kind: "create" }),
        )
        .its("body")
        .as("sourceAction");

      cy.get<WritebackAction>("@sourceAction").then(({ id }) =>
        cy.writeFile(ACTION_FILE(), declaration(id)),
      );

      cy.get<string>("@apiKey")
        .then((apiKey) => H.syncDataAppResources(apiKey, APP_ROOT()))
        .then(({ ok, error }) => {
          expect(error, "sync-resources failed").to.eq(null);
          expect(ok).to.eq(true);
        });

      cy.readFile(LOCKFILE())
        .its("models")
        .should("have.length", 1)
        .its("0.actions")
        .should("have.length", 1)
        .its("0.copiedActionId")
        .should("be.a", "number")
        .as("copiedActionId");
    });

    after(() => {
      restoreAuthoredFixture();
    });

    it("executes the synchronized copy rather than the authored action", () => {
      cy.get<WritebackAction>("@sourceAction").then(({ id }) => {
        cy.get<number>("@copiedActionId").should("not.equal", id);
      });

      executePublishedAction();
    });

    it("lets a member of an assigned group execute the synchronized action", () => {
      H.assignDataAppTestGroup(APP_SLUG).as("groupId");
      cy.get<number>("@groupId").then((groupId) =>
        H.addUserToGroup(groupId, USERS.normal.email),
      );

      cy.signInAsNormalUser();
      executePublishedAction();
    });
  },
);

function executePublishedAction() {
  cy.intercept("POST", "/api/action/*/execute").as("execute");
  H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
  H.openDataApp(APP_SLUG);

  H.dataAppIframe(APP_DISPLAY_NAME)
    .findByRole("button", { name: "execute" })
    .should("be.visible")
    .click();

  cy.wait("@execute").its("request.url").as("executeUrl");
  cy.get<number>("@copiedActionId").then((copiedActionId) => {
    cy.get<string>("@executeUrl").should(
      "contain",
      `/api/action/${copiedActionId}/execute`,
    );
  });

  H.dataAppIframe(APP_DISPLAY_NAME)
    .findByTestId("action-output")
    .should("be.visible")
    .and("have.text", "executed");
}
