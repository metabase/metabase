import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  addUserToGroup,
  createDataAppApiKey,
  createDataAppScoreboardAction,
  dataAppIframe,
  dataAppPermissionGroupId,
  mockDataApp,
  syncDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";

const APP_SLUG = "synced-actions-app";
const APP_DISPLAY_NAME = "Synced Actions App";

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;
const ACTION_FILE = () => `${APP_ROOT()}/actions/orders.action.ts`;
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;
const LOCKFILE = () => `${APP_ROOT()}/resources_metadata.json`;

/** The manifest as source control holds it. */
const AUTHORED_MANIFEST = [
  "version: 1",
  `name: ${APP_DISPLAY_NAME}`,
  `slug: ${APP_SLUG}`,
  "path: ./dist/index.js",
  "entity_id: nPu5r1EndcM_D8TQfLk9c",
  "serdes/meta:",
  "- model: DataApp",
  "  id: nPu5r1EndcM_D8TQfLk9c",
  "  label: synced-actions-app",
  "",
].join("\n");

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
 * `toExecutableActionId` runs `copiedActionId` — the copy in the app's collection —
 * because that is the only action an app's viewers may execute.
 */
describe(
  "scenarios > data apps > sync-resources in production (actions)",
  { tags: ["@external", "@actions"] },
  () => {
    // Restore the source files and remove the lockfile before each synchronization.
    const restoreAuthoredFixture = () => {
      cy.writeFile(ACTION_FILE(), declaration(1));
      cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
      cy.task("removeDataAppPaths", { paths: [LOCKFILE()] });
    };

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      restoreAuthoredFixture();
      createDataAppApiKey().as("apiKey");
    });

    after(() => {
      restoreAuthoredFixture();
    });

    /** Declares an action, synchronizes, and returns both action IDs. */
    const syncApp = () =>
      createDataAppScoreboardAction().then((action) => {
        cy.writeFile(ACTION_FILE(), declaration(action.id));

        return cy.get<string>("@apiKey").then((apiKey) =>
          syncDataAppResources(apiKey, APP_ROOT()).then(({ ok, error }) => {
            expect(error, "sync-resources failed").to.eq(null);
            expect(ok).to.eq(true);

            return cy
              .readFile(`${APP_ROOT()}/resources_metadata.json`)
              .then((lockfile) => {
                const copiedActionId = lockfile.actions?.[0]?.copiedActionId;

                if (typeof copiedActionId !== "number") {
                  throw new Error("The sync wrote no action to the lockfile.");
                }

                return cy.wrap(
                  { sourceActionId: action.id, copiedActionId },
                  { log: false },
                );
              });
          }),
        );
      });

    it("executes the synchronized copy rather than the authored action", () => {
      syncApp().then(({ sourceActionId, copiedActionId }) => {
        expect(copiedActionId).not.to.eq(sourceActionId);

        cy.intercept("POST", "/api/action/*/execute").as("execute");
        mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
        cy.visit(`/apps/${APP_SLUG}`);

        dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("action-execute", { timeout: 30000 }).click();
          cy.findByTestId("action-output").should("have.text", "executed");
        });

        // The proof that production took the synchronized path.
        cy.wait("@execute")
          .its("request.url")
          .should("contain", `/api/action/${copiedActionId}/execute`);
      });
    });

    it("lets a member of the app's group execute it", () => {
      syncApp().then(({ copiedActionId }) => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          addUserToGroup(groupId, USERS.normal.email);

          cy.signInAsNormalUser();
          cy.intercept("POST", "/api/action/*/execute").as("execute");
          mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
          cy.visit(`/apps/${APP_SLUG}`);

          dataAppIframe(APP_DISPLAY_NAME).within(() => {
            cy.findByTestId("action-execute", { timeout: 30000 }).click();
            cy.findByTestId("action-output").should("have.text", "executed");
          });

          cy.wait("@execute")
            .its("request.url")
            .should("contain", `/api/action/${copiedActionId}/execute`);
        });
      });
    });
  },
);
