import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { PortableTable } from "e2e/support/helpers";
import type { Card, CollectionItem } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

/** The app is published under its directory's name. */
const APP_SLUG = "vite-6-data-app-host-app";

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

const metricAggregation = (metric: string) => ({
  aggregation: [["metric", { "lib/uuid": crypto.randomUUID() }, metric]],
});

/**
 * Runs the app's resources end to end against the dev host app, a real vite
 * data app with the published SDK installed: the CLI an author runs, the build
 * guard, and the repository pull that loads what the author wrote.
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
            models: [],
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
          "is a question no definition names. Delete it.",
        );
      });
    });
  });

  it("publishes the saved question with a pull, readable by the app's group alone", () => {
    const question = H.newEntityId();
    H.declareDataAppQueries(APP_ROOT(), [
      { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
    ]);
    H.writeDataAppResources(APP_ROOT(), {
      collection: collection(),
      cards: [ordersQuestion(question)],
    });
    H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) => {
      expect(app.table_ids).to.deep.eq([ORDERS_ID]);

      cy.request<Card>(`/api/card/${question}`).then(({ body: card }) => {
        expect(card.collection_id).to.eq(app.resource_collection_id);
        expect(card.name).to.eq("Orders");

        H.addUserToGroup(app.permission_group_id, USERS.normal.email);

        cy.signInAsNormalUser();
        cy.request(`/api/card/${question}`)
          .its("body.id")
          .should("eq", card.id);

        cy.signIn("nocollection");
        cy.request({ url: `/api/card/${question}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 403);
      });
    });
  });

  it("publishes a copy of the metric a query uses, readable by the app's group alone", () => {
    H.createQuestion({
      name: "Orders count",
      type: "metric",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    }).then(({ body: metric }) => {
      const question = H.newEntityId();
      const metricCopy = H.newEntityId();

      H.declareDataAppQueries(APP_ROOT(), [
        {
          name: "OrdersCount",
          tableId: ORDERS_ID,
          metricId: metric.id,
          savedQuestionEntityId: question,
        },
      ]);
      H.writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [
          ordersQuestion(question, metricAggregation(metricCopy)),
          H.resourceCard({
            entityId: metricCopy,
            name: "Orders count",
            type: "metric",
            collection: COLLECTION,
            table: ORDERS_TABLE,
            stage: {
              aggregation: [["count", { "lib/uuid": crypto.randomUUID() }]],
            },
          }),
        ],
      });
      H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) => {
        cy.request<{ data: CollectionItem[] }>(
          `/api/collection/${app.resource_collection_id}/items?models=metric`,
        ).then(({ body: { data: metrics } }) => {
          expect(metrics.map(({ name }) => name)).to.deep.eq(["Orders count"]);
          const [copy] = metrics;
          expect(copy.id, "a copy, not the source metric").not.to.eq(metric.id);

          H.addUserToGroup(app.permission_group_id, USERS.normal.email);

          cy.signInAsNormalUser();
          cy.request(`/api/card/${copy.id}`).its("status").should("eq", 200);
          cy.request<Card>(`/api/card/${question}`).then(({ body: card }) => {
            cy.request("POST", `/api/card/${card.id}/query`)
              .its("body.data.rows.0.0")
              .should("be.greaterThan", 0);
          });

          cy.signIn("nocollection");
          cy.request({ url: `/api/card/${copy.id}`, failOnStatusCode: false })
            .its("status")
            .should("eq", 403);
        });
      });
    });
  });

  it("refuses resources that read a card outside the app, and loads none of them", () => {
    H.createQuestion({
      name: "Orders count",
      type: "metric",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    }).then(({ body: metric }) => {
      const question = H.newEntityId();

      H.declareDataAppQueries(APP_ROOT(), [
        {
          name: "OrdersCount",
          tableId: ORDERS_ID,
          metricId: metric.id,
          savedQuestionEntityId: question,
        },
      ]);
      // The question reads the source metric instead of a copy in the app.
      H.writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question, metricAggregation(metric.entity_id))],
      });

      H.publishDataAppExpectingRefusal(APP_ROOT(), APP_SLUG).then((error) => {
        expect(error).to.contain(
          `references Card ${metric.entity_id}, which is not one of the app's resources`,
        );
        cy.request({ url: `/api/card/${question}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404);
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
