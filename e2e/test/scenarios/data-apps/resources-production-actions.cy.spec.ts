import yaml from "js-yaml";

import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";

const APP_SLUG = "synced-actions-app";
const APP_DISPLAY_NAME = "Synced Actions App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedActionsAppColl1";

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

/**
 * The action half of the production path. Outside the dev preview
 * `toExecutableActionId` runs `copiedActionEntityId`, the copy in the app's
 * collection, because that is the only action an app's viewers may execute.
 * The copy reaches Metabase through the app's collection files and a repository pull.
 */
describe(
  "scenarios > data apps > resources in production (actions)",
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
     * Declares an action that belongs to no model, writes the copy an author
     * writes from its serialization, publishes the app, and yields it with the copy's
     * entity ID.
     */
    const publishApp = () =>
      H.createDataAppScoreboardAction().then((source) => {
        const actionCopy = H.newEntityId();

        H.declareDataAppActions(APP_ROOT(), [
          {
            exportName: "CreateScore",
            sourceActionId: source.id,
            copiedActionEntityId: actionCopy,
          },
        ]);

        return H.serializeDataAppActionCopies(
          [{ sourceActionId: source.id, entityId: actionCopy }],
          COLLECTION,
        )
          .then((actions) =>
            H.writeDataAppResources(APP_ROOT(), {
              collection: H.dataAppRepresentations.collection(
                COLLECTION,
                "Data App: Synced Actions App",
              ),
              actions,
            }),
          )
          .then(() => H.publishDataApp(APP_ROOT(), APP_SLUG))
          .then((app) => cy.wrap({ app, actionCopy }, { log: false }));
      });

    it("serializes the action an author copies, with no model, as its file holds it", () => {
      H.createDataAppScoreboardAction().then((source) => {
        // Executing the action reads this, so the copy must keep it.
        cy.request("PUT", `/api/action/${source.id}`, {
          visualization_settings: {
            fields: { score: { id: "score", hidden: true, defaultValue: 0 } },
          },
        });

        const copy = H.newEntityId();

        H.serializeDataAppActions(
          [{ sourceActionId: source.id, entityId: copy }],
          COLLECTION,
        ).then(([file]) => {
          expect(file.file).to.eq("add_team.yaml");

          const entity = yaml.load(file.yaml);
          expect(entity).to.deep.include({
            entity_id: copy,
            collection_id: COLLECTION,
            type: "query",
          });
          expect(entity).not.to.have.property("model_id");
          expect(entity)
            .to.have.nested.property("visualization_settings.fields.score")
            .that.deep.include({ hidden: true, defaultValue: 0 });
        });
      });
    });

    it("executes the app's copy rather than the authored action, for a member of the app's group", () => {
      publishApp().then(({ app, actionCopy }) => {
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
          .should("contain", `/api/action/${actionCopy}/execute`);
      });
    });
  },
);
