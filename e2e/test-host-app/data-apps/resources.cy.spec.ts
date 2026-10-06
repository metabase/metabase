import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { PortableTable } from "e2e/support/helpers";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const APP_ROOT = () => H.dataAppHostAppRoot();
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;

const COLLECTION = "hostAppCollection0001";

/** The host app's checked-in manifest, as serialization reads it. */
const AUTHORED_MANIFEST = `version: 1
name: Vite 6 Data App
slug: vite-6-data-app-host-app
path: ./dist/index.js
allowed_hosts:
  - https://allowed.data-app.test
entity_id: qxpaPkU_WRE2ZQu0cmpqD
serdes/meta:
- model: DataApp
  id: qxpaPkU_WRE2ZQu0cmpqD
  label: vite-6-data-app-host-app
`;

const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const collection = () =>
  H.resourceCollection(COLLECTION, "Data App: Vite 6 Data App");

/** The saved question an author writes for a plain `Orders` definition. */
const ordersQuestion = (entityId: string, stage = {}) =>
  H.resourceCard({
    entityId,
    name: "Orders",
    type: "question",
    collection: COLLECTION,
    table: ORDERS_TABLE,
    stage,
  });

/**
 * Runs the app's resources tooling against the dev host app, a real vite data
 * app with the published SDK installed: the CLI an author runs and the build
 * guard.
 */
describe("Embedding SDK: data-app resources (queries)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

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

  describe("the CLI", () => {
    it("prints the query Metabase builds from a definition, as an author writes the saved question from it", () => {
      const question = H.newEntityId();
      H.declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);

      H.dataAppCliEnv().then((env) =>
        H.runDataAppCli("print-resources", env).then(({ exitCode, stdout }) => {
          expect(exitCode, stdout).to.eq(0);
          const printed = JSON.parse(stdout);
          expect(printed).to.deep.include({
            actions: [],
            metrics: [],
          });
          const [query] = printed.queries;
          expect(query).to.deep.include({
            export: "Orders",
            file: "queries/orders.query.ts",
            savedQuestionEntityId: question,
            metrics: [],
          });
          // The saved question is complete: the author writes it as it is.
          expect(query.entity).to.deep.include({
            entity_id: question,
            collection_id: COLLECTION,
            name: "Orders",
            type: "question",
            display: "table",
            dataset_query: {
              "lib/type": "mbql/query",
              database: "Sample Database",
              stages: [
                {
                  "lib/type": "mbql.stage/mbql",
                  "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
                },
              ],
            },
            "serdes/meta": [{ model: "Card", id: question, label: "orders" }],
          });
          expect(query.entity.creator_id).to.be.a("string");
        }),
      );
    });

    it("checks that the resources back every definition, listing every problem", () => {
      const question = H.newEntityId();
      const stale = H.newEntityId();
      H.declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);

      H.writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      H.runDataAppCli("check-resources").then(({ exitCode, stdout }) => {
        expect(exitCode).to.eq(0);
        expect(stdout).to.contain("resources/ backs every definition.");
      });

      H.writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(stale)],
      });
      H.runDataAppCli("check-resources").then(({ exitCode, stderr }) => {
        expect(exitCode).not.to.eq(0);
        expect(stderr).to.contain(
          `queries/orders.query.ts:Orders names saved question ${question}, which no file in resources/cards/ holds.`,
        );
        expect(stderr).to.contain(
          "is a resource that is not referenced anywhere.",
        );
      });
    });
  });

  describe("the build guard", () => {
    /** `cy.exec` reports the command's output; vite prints this only on success. */
    const expectBuildToSucceed = () =>
      H.buildDataAppHostApp().should((result) => {
        expect(`${result.stdout}${result.stderr}`).to.contain("built in");
      });

    // `metabase-resource-check` runs on buildStart and never calls Metabase, so
    // an app whose definitions name missing resources is refused before it can
    // be bundled.
    it("refuses to build when a definition's saved question is missing", () => {
      const question = H.newEntityId();
      H.declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);
      H.writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      expectBuildToSucceed();

      H.writeDataAppResources(APP_ROOT(), { collection: collection() });
      H.buildDataAppHostApp().should((result) => {
        const output = `${result.stdout}${result.stderr}`;
        expect(output, "the build is refused").to.contain(
          `names saved question ${question}, which no file in resources/cards/ holds.`,
        );
        expect(output).not.to.contain("built in");
      });

      H.writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      expectBuildToSucceed();
    });
  });
});
