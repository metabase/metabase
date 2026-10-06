import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { WritebackAction } from "metabase-types/api";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";

/** The app is published under its directory's name. */
const APP_SLUG = "vite-6-data-app-host-app";

const APP_ROOT = () => H.dataAppHostAppRoot();
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;

const COLLECTION = "hostAppCollection0002";

const SCORE = { team_name: "Data App FC", score: 7 };

type Copy = { source: WritebackAction; entityId: string; exportName: string };

/**
 * Loads actions into an app the way an author does: the source actions exist
 * in Metabase, belonging to no model, and the author copies what Metabase
 * exports for them into the app's `resources/` with new entity IDs. A
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

      // The specs share a checked-in host app, so start from a clean tree.
      H.resetDataAppHostAppSources();
      cy.writeFile(
        MANIFEST_FILE(),
        `${H.DATA_APP_HOST_APP_MANIFEST}collection: ${COLLECTION}\n`,
      );
    });

    // Leave the checked-in host app as it was.
    after(() => {
      H.resetDataAppHostAppSources();
      cy.writeFile(MANIFEST_FILE(), H.DATA_APP_HOST_APP_MANIFEST);
    });

    /** Declares `copies` and writes them, changed by `edit`, into `resources/`. */
    const writeCopies = (
      copies: Copy[],
      edit: (copy: Record<string, unknown>) => Record<string, unknown> = (
        copy,
      ) => copy,
    ) => {
      H.declareDataAppActions(
        APP_ROOT(),
        copies.map(({ source, entityId, exportName }) => ({
          exportName,
          sourceActionId: source.id,
          copiedActionEntityId: entityId,
        })),
      );

      return H.exportDataAppActionCopies(
        copies.map(({ source, entityId }) => ({
          sourceActionId: source.id,
          entityId,
        })),
        COLLECTION,
      ).then((actions) =>
        H.writeDataAppResources(APP_ROOT(), {
          collection: H.dataAppRepresentations.collection(
            COLLECTION,
            "Data App: Vite 6 Data App",
          ),
          actions: actions.map(edit),
        }),
      );
    };

    /** Two source actions that belong to no model, with a copy of each written. */
    const copyTwoActions = () =>
      H.createDataAppScoreboardAction({ name: "Add team" }).then((add) =>
        H.createDataAppScoreboardAction({ name: "Add rival" }).then((rival) => {
          const copies: [Copy, Copy] = [
            { source: add, entityId: H.newEntityId(), exportName: "AddTeam" },
            {
              source: rival,
              entityId: H.newEntityId(),
              exportName: "AddRival",
            },
          ];

          writeCopies(copies);

          return cy.wrap(copies, { log: false });
        }),
      );

    /** Which of the copies with `entityIds` Metabase holds. */
    const copiesLoaded = (entityIds: string[]) =>
      cy
        .request<WritebackAction[]>("/api/action")
        .then(({ body }) =>
          body
            .map((action) => action.entity_id)
            .filter((entityId) => entityIds.includes(entityId)),
        );

    it("lets the app's group execute a published copy but not the action it was copied from", () => {
      copyTwoActions().then(([{ source, entityId }]) => {
        // A user whose groups read no collection: the copy is reachable through
        // the app's group alone, and the source action, in the root collection,
        // through none of them.
        H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) => {
          H.addUserToGroup(app.permission_group_id, USERS.nocollection.email);
        });

        cy.signIn("nocollection");
        cy.request({
          method: "POST",
          url: `/api/action/${entityId}/execute`,
          body: { parameters: SCORE },
        })
          .its("status")
          .should("be.oneOf", [200, 204]);

        cy.request({
          method: "POST",
          url: `/api/action/${source.id}/execute`,
          body: { parameters: SCORE },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });

    it("deletes a copied action on the next pull once its file is gone", () => {
      copyTwoActions().then(([kept, removed]) => {
        const entityIds = [kept.entityId, removed.entityId];

        H.publishDataApp(APP_ROOT(), APP_SLUG);
        copiesLoaded(entityIds).should("have.members", entityIds);

        writeCopies([kept]);
        H.publishDataApp(APP_ROOT(), APP_SLUG, { initializeRepo: false });

        copiesLoaded(entityIds).should("deep.equal", [kept.entityId]);
      });
    });

    it("refuses a copy of an action that belongs to a model, and loads none of them", () => {
      copyTwoActions().then((copies) => {
        const [first] = copies;

        // A data app runs only actions that belong to no model.
        writeCopies(copies, (copy) =>
          copy.entity_id === first.entityId
            ? { ...copy, model_id: H.newEntityId() }
            : copy,
        );

        H.publishDataAppExpectingRefusal(APP_ROOT(), APP_SLUG).then((error) => {
          expect(error).to.contain("must belong to no model");
          copiesLoaded(copies.map(({ entityId }) => entityId)).should(
            "deep.equal",
            [],
          );
        });
      });
    });
  },
);
