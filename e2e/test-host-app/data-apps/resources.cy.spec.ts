import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type PortableTable,
  buildDataAppHostApp,
  dataAppCliEnv,
  dataAppHostAppRoot,
  declareDataAppQueries,
  newEntityId,
  resetDataAppHostAppSources,
  resourceCard,
  resourceCollection,
  runDataAppCli,
  writeDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const APP_ROOT = () => dataAppHostAppRoot();
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;

const COLLECTION = "hostAppCollection0001";

const AUTHORED_MANIFEST = `name: Vite 6 Data App
version: 1
path: ./dist/index.js
allowed_hosts:
  - https://allowed.data-app.test
`;

const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const collection = () =>
  resourceCollection(COLLECTION, "Data App: Vite 6 Data App");

/** The saved question an author writes for a plain `Orders` definition. */
const ordersQuestion = (entityId: string, stage = {}) =>
  resourceCard({
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
    resetDataAppHostAppSources();
    cy.writeFile(
      MANIFEST_FILE(),
      `${AUTHORED_MANIFEST}collection: ${COLLECTION}\n`,
    );
  });

  // Leave the checked-in host app as it was.
  after(() => {
    resetDataAppHostAppSources();
    cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
  });

  describe("the CLI", () => {
    it("prints the query Metabase builds from a definition, as an author writes the saved question from it", () => {
      const question = newEntityId();
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);

      dataAppCliEnv().then((env) =>
        runDataAppCli("print-resources", env).then(({ exitCode, stdout }) => {
          expect(exitCode, stdout).to.eq(0);
          expect(JSON.parse(stdout)).to.deep.eq({
            queries: [
              {
                export: "Orders",
                file: "queries/orders.query.ts",
                savedQuestionEntityId: question,
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
                metrics: [],
              },
            ],
            actions: [],
            models: [],
            metrics: [],
          });
        }),
      );
    });

    it("checks that the resources back every definition, listing every problem", () => {
      const question = newEntityId();
      const stale = newEntityId();
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);

      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      runDataAppCli("check-resources").then(({ exitCode, stdout }) => {
        expect(exitCode).to.eq(0);
        expect(stdout).to.contain("resources/ backs every definition.");
      });

      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(stale)],
      });
      runDataAppCli("check-resources").then(({ exitCode, stderr }) => {
        expect(exitCode).not.to.eq(0);
        expect(stderr).to.contain(
          `queries/orders.query.ts:Orders names saved question ${question}, which no file in resources/cards/ holds.`,
        );
        expect(stderr).to.contain(
          "is a question no definition names. Delete it.",
        );
      });
    });
  });

  describe("the build guard", () => {
    /** `cy.exec` reports the command's output; vite prints this only on success. */
    const expectBuildToSucceed = () =>
      buildDataAppHostApp().should((result) => {
        expect(`${result.stdout}${result.stderr}`).to.contain("built in");
      });

    // `metabase-resource-check` runs on buildStart and never calls Metabase, so
    // an app whose definitions name missing resources is refused before it can
    // be bundled.
    it("refuses to build when a definition's saved question is missing", () => {
      const question = newEntityId();
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);
      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      expectBuildToSucceed();

      writeDataAppResources(APP_ROOT(), { collection: collection() });
      buildDataAppHostApp().should((result) => {
        const output = `${result.stdout}${result.stderr}`;
        expect(output, "the build is refused").to.contain(
          `names saved question ${question}, which no file in resources/cards/ holds.`,
        );
        expect(output).not.to.contain("built in");
      });

      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      expectBuildToSucceed();
    });
  });
});
