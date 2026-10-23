import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";

const APP_SLUG = "synced-actions-app";
const APP_DISPLAY_NAME = "Synced Actions App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedActionsAppColl1";

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

describe(
  "scenarios > data apps > resources from a repository (actions)",
  { tags: ["@external", "@actions"] },
  () => {
    const removeTestFiles = () =>
      cy.task("removeDataAppPaths", {
        paths: [`${APP_ROOT()}/actions`, `${APP_ROOT()}/collections`],
      });

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      removeTestFiles();
    });

    after(() => {
      removeTestFiles();
    });

    /**
     * Publishes the app, creates an action in its collection, and declares it
     * by its entity ID, as the app's typed schema does.
     */
    const publishApp = () => {
      H.writeDataAppResources(APP_ROOT(), {
        collection: H.dataAppRepresentations.collection(
          COLLECTION,
          "Data App: Synced Actions App",
        ),
      });

      return H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) =>
        H.createDataAppScoreboardAction({
          collectionId: app.resource_collection_id,
        }).then((action) => {
          H.declareDataAppActions(APP_ROOT(), [
            { exportName: "CreateScore", actionEntityId: action.entity_id },
          ]);

          return cy.wrap({ app, action }, { log: false });
        }),
      );
    };

    it("executes the action in the app's collection for a member of the app's group", () => {
      publishApp().then(({ app, action }) => {
        H.assignTestGroupToDataApp(app.name).then((groupId) => {
          H.addUserToGroup(groupId, USERS.normal.email);
        });

        cy.signInAsNormalUser();
        cy.intercept("POST", "/api/action/*/execute").as("execute");
        H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
        cy.visit(`/apps/${APP_SLUG}`);

        H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("action-execute", { timeout: 30000 }).click();
          cy.findByTestId("action-output").should("have.text", "executed");
        });

        cy.wait("@execute")
          .its("request.url")
          .should("contain", `/api/action/${action.entity_id}/execute`);
      });
    });
  },
);
