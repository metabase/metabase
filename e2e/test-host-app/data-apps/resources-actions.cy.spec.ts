import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { PortableTable } from "e2e/support/helpers";
import type { Card, WritebackAction } from "metabase-types/api";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";

/** The app is published under its directory's name. */
const APP_SLUG = "vite-6-data-app-host-app";

const APP_ROOT = () => H.dataAppHostAppRoot();
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;

const COLLECTION = "hostAppCollection0002";

const AUTHORED_MANIFEST = `name: Vite 6 Data App
version: 1
path: ./dist/index.js
allowed_hosts:
  - https://allowed.data-app.test
`;

const SCOREBOARD_TABLE: PortableTable = [
  "Writable Postgres12",
  "public",
  TEST_TABLE,
];

const SCORE = { team_name: "Data App FC", score: 7 };

type Copies = {
  modelId: number;
  sources: { create: WritebackAction; update: WritebackAction };
  modelCopy: string;
  createCopy: string;
  updateCopy: string;
};

/**
 * Loads a model and its actions into an app the way an author does: the source
 * model and actions exist in Metabase, and the author copies them into the app's
 * `resources/` with new entity IDs, the action copies on the model copy. A
 * repository pull is what creates the copies.
 */
describe(
  "Embedding SDK: data-app resources (actions)",
  { tags: ["@external", "@actions"] },
  () => {
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

      // The specs share a checked-in host app, so start from a clean tree.
      H.resetDataAppHostAppSources();
      cy.writeFile(
        MANIFEST_FILE(),
        `${AUTHORED_MANIFEST}collection: ${COLLECTION}\n`,
      );
    });

    // Leave the checked-in host app as it was.
    after(() => {
      H.resetDataAppHostAppSources();
      cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
    });

    const writeResources = (
      { modelCopy }: Pick<Copies, "modelCopy">,
      actions: Array<[string, string, "row/create" | "row/update"]>,
      { modelIdOfActions = modelCopy }: { modelIdOfActions?: string } = {},
    ) =>
      H.writeDataAppResources(APP_ROOT(), {
        collection: H.resourceCollection(
          COLLECTION,
          "Data App: Vite 6 Data App",
        ),
        cards: [
          H.resourceCard({
            entityId: modelCopy,
            name: MODEL_NAME,
            type: "model",
            collection: COLLECTION,
            table: SCOREBOARD_TABLE,
          }),
        ],
        actions: actions.map(([entityId, name, kind]) =>
          H.resourceImplicitAction({
            entityId,
            name,
            kind,
            model: modelIdOfActions,
          }),
        ),
      });

    /** Declares a create and an update action on the source model, and writes their copies. */
    const copyTwoActions = () =>
      cy.get<number>("@modelId").then((modelId) =>
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: create }) =>
            H.createImplicitAction({ model_id: modelId, kind: "update" }).then(
              ({ body: update }) => {
                const copies: Copies = {
                  modelId,
                  sources: { create, update },
                  modelCopy: H.newEntityId(),
                  createCopy: H.newEntityId(),
                  updateCopy: H.newEntityId(),
                };

                H.declareDataAppActions(APP_ROOT(), [
                  {
                    exportName: "CreateScore",
                    sourceActionId: create.id,
                    copiedActionEntityId: copies.createCopy,
                  },
                  {
                    exportName: "UpdateScore",
                    sourceActionId: update.id,
                    copiedActionEntityId: copies.updateCopy,
                  },
                ]);
                writeResources(copies, [
                  [copies.createCopy, "Create", "row/create"],
                  [copies.updateCopy, "Update", "row/update"],
                ]);

                return cy.wrap(copies, { log: false });
              },
            ),
        ),
      );

    /** The entity IDs of the actions Metabase holds on the model copy. */
    const actionsOnModelCopy = (modelCopy: string) =>
      cy
        .request<Card>(`/api/card/${modelCopy}`)
        .then(({ body: model }) =>
          cy
            .request<WritebackAction[]>(`/api/action?model-id=${model.id}`)
            .then(({ body }) => body.map((action) => action.entity_id)),
        );

    it("lets the app's group execute a published copy but not the action it was copied from", () => {
      copyTwoActions().then(({ sources, createCopy }) => {
        // A user whose groups read no collection: the copy is reachable through
        // the app's group alone, and the source model, in the root collection,
        // through none of them.
        H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) => {
          H.addUserToGroup(app.permission_group_id, USERS.nocollection.email);
        });

        cy.signIn("nocollection");
        cy.request({
          method: "POST",
          url: `/api/action/${createCopy}/execute`,
          body: { parameters: SCORE },
        })
          .its("status")
          .should("be.oneOf", [200, 204]);

        cy.request({
          method: "POST",
          url: `/api/action/${sources.create.id}/execute`,
          body: { parameters: SCORE },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });

    it("deletes a copied action on the next pull once its file is gone", () => {
      copyTwoActions().then(
        ({ sources, modelCopy, createCopy, updateCopy }) => {
          H.publishDataApp(APP_ROOT(), APP_SLUG);
          actionsOnModelCopy(modelCopy).should("have.members", [
            createCopy,
            updateCopy,
          ]);

          H.declareDataAppActions(APP_ROOT(), [
            {
              exportName: "CreateScore",
              sourceActionId: sources.create.id,
              copiedActionEntityId: createCopy,
            },
          ]);
          writeResources({ modelCopy }, [[createCopy, "Create", "row/create"]]);
          H.publishDataApp(APP_ROOT(), APP_SLUG, { initializeRepo: false });

          actionsOnModelCopy(modelCopy).should("deep.equal", [createCopy]);
        },
      );
    });

    it("refuses an action copy that isn't on a model in the app's resources, and loads none of them", () => {
      copyTwoActions().then(({ modelId, createCopy, modelCopy }) => {
        cy.request<Card>(`/api/card/${modelId}`).then(({ body: source }) => {
          // The copy points at the source model instead of the model copy.
          writeResources(
            { modelCopy },
            [[createCopy, "Create", "row/create"]],
            {
              modelIdOfActions: source.entity_id,
            },
          );

          H.publishDataAppExpectingRefusal(APP_ROOT(), APP_SLUG).then(
            (error) => {
              expect(error).to.contain(
                "must belong to a model in the app's resources",
              );
              cy.request({
                url: `/api/card/${modelCopy}`,
                failOnStatusCode: false,
              })
                .its("status")
                .should("eq", 404);
            },
          );
        });
      });
    });
  },
);
