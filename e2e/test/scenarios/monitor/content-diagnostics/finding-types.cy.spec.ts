const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  documentEmbedding,
  embeddedCardIds,
  markStale,
  runContentDiagnosticsScan,
  searchFindings,
  setThreshold,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const QUERY = { "source-table": ORDERS_ID };
const EMPTY_DOCUMENT = { type: "doc" as const, content: [] };

const TABS = [
  { id: 1, name: "First tab" },
  { id: 2, name: "Second tab" },
];

// Detection is backend logic, so each finding type keeps one test that seeds real content, runs a
// real scan and reads the result. How each tab renders a finding (units, labels, icons, the
// duplicates list) is covered by the Jest specs of the content diagnostics pages.
describe("scenarios > monitor > content diagnostics > finding types", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("reports empty content of every type, and passes over its archived counterparts", () => {
    const SEARCH_TERM = "emptiness";
    const COLLECTION_NAME = "E2E emptiness collection";
    const DASHBOARD_NAME = "E2E emptiness dashboard";
    const DOCUMENT_NAME = "E2E emptiness document";
    const QUESTION_NAME = "E2E emptiness question";
    const TRASHED = [
      "E2E emptiness trashed collection",
      "E2E emptiness trashed dashboard",
      "E2E emptiness trashed document",
    ];

    H.createCollection({ name: COLLECTION_NAME });
    H.createDashboard({ name: DASHBOARD_NAME });
    H.createDocument({ name: DOCUMENT_NAME, document: EMPTY_DOCUMENT });
    H.createNativeQuestion({
      name: QUESTION_NAME,
      native: { query: "SELECT * FROM ORDERS WHERE ID < 0" },
    }).then(({ body: card }) => {
      cy.request("POST", `/api/card/${card.id}/query`);
    });

    H.createCollection({ name: TRASHED[0] }).then(({ body: collection }) =>
      H.archiveCollection(collection.id),
    );
    H.createDashboard({ name: TRASHED[1] }).then(({ body: dashboard }) =>
      H.archiveDashboard(dashboard.id),
    );
    H.createDocument({ name: TRASHED[2], document: EMPTY_DOCUMENT }).then(
      ({ body: document }) => H.archiveDocument(document.id),
    );

    runContentDiagnosticsScan();
    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("all four live entity types are reported by the one checker");
    cy.findByTestId("imbalanced-content-list").within(() => {
      [COLLECTION_NAME, DASHBOARD_NAME, DOCUMENT_NAME, QUESTION_NAME].forEach(
        (name) => {
          cy.findByText(name).should("be.visible");
        },
      );
    });

    cy.log("and none of the archived ones are");
    TRASHED.forEach((name) => {
      cy.findByTestId("imbalanced-content-list").should(
        "not.contain.text",
        name,
      );
    });

    cy.log("the question's row count comes from its real query run");
    cy.findByTestId("imbalanced-content-list")
      .findByText(QUESTION_NAME)
      .click();
    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Content count").should("be.visible");
      cy.findByText("0 rows").should("be.visible");
    });
  });

  it("reports crowded content of every type, and one dashboard as both crowded and empty", () => {
    const SEARCH_TERM = "crowding";
    const COLLECTION_NAME = "E2E crowding collection";
    const TABBED_DASHBOARD_NAME = "E2E crowding tabbed dashboard";
    const PACKED_DASHBOARD_NAME = "E2E crowding packed dashboard";
    const DOCUMENT_NAME = "E2E crowding document";

    setThreshold("content-diagnostics-crowded-collection-threshold-items", 2);
    setThreshold("content-diagnostics-crowded-dashboard-threshold-tabs", 1);
    setThreshold(
      "content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab",
      1,
    );
    setThreshold("content-diagnostics-crowded-document-threshold-cards", 1);

    H.createCollection({ name: COLLECTION_NAME }).then(
      ({ body: collection }) => {
        ["A", "B", "C"].forEach((suffix) => {
          H.createQuestion({
            name: `E2E child question ${suffix}`,
            collection_id: collection.id,
            query: QUERY,
          });
        });
      },
    );
    H.createDashboard({ name: PACKED_DASHBOARD_NAME }).then(
      ({ body: dashboard }) => {
        H.addQuestionToDashboard({
          dashboardId: dashboard.id,
          cardId: ORDERS_QUESTION_ID,
        });
        H.addQuestionToDashboard({
          dashboardId: dashboard.id,
          cardId: ORDERS_QUESTION_ID,
        });
      },
    );
    H.createDashboardWithTabs({ name: TABBED_DASHBOARD_NAME, tabs: TABS });
    H.createDocument({
      name: DOCUMENT_NAME,
      document: documentEmbedding([ORDERS_QUESTION_ID, ORDERS_QUESTION_ID]),
    });

    runContentDiagnosticsScan();
    visitContentDiagnosticsTab("crowded");
    searchFindings(SEARCH_TERM);

    cy.log("each subject is reported, having crossed a bound of its own");
    cy.findByTestId("imbalanced-content-list").within(() => {
      [
        COLLECTION_NAME,
        PACKED_DASHBOARD_NAME,
        TABBED_DASHBOARD_NAME,
        DOCUMENT_NAME,
      ].forEach((name) => {
        cy.findByText(name).should("be.visible");
      });
    });

    cy.log("the tabbed dashboard is counted on the tab axis it crossed");
    cy.findByTestId("imbalanced-content-list")
      .findByText(TABBED_DASHBOARD_NAME)
      .click();
    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Content count").should("be.visible");
      cy.findByText("2 tabs").should("be.visible");
    });

    cy.log("and holding no cards at all makes it empty on the same scan");
    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.findByTestId("imbalanced-content-list")
      .findByText(TABBED_DASHBOARD_NAME)
      .click();
    cy.findByTestId("content-diagnostics-sidebar")
      .findByText("0 dashcards")
      .should("be.visible");
  });

  it("reports thinly filled content, leaving bare content to the empty tab", () => {
    const SEARCH_TERM = "sparsity";
    const SPARSE_COLLECTION_NAME = "E2E sparsity thin collection";
    const SPARSE_DASHBOARD_NAME = "E2E sparsity thin dashboard";
    const EMPTY_COLLECTION_NAME = "E2E sparsity bare collection";

    H.createCollection({ name: EMPTY_COLLECTION_NAME });
    H.createCollection({ name: SPARSE_COLLECTION_NAME }).then(
      ({ body: collection }) => {
        ["A", "B"].forEach((suffix) => {
          H.createQuestion({
            name: `E2E child question ${suffix}`,
            collection_id: collection.id,
            query: QUERY,
          });
        });
      },
    );
    H.createDashboard({ name: SPARSE_DASHBOARD_NAME }).then(
      ({ body: dashboard }) => {
        H.addQuestionToDashboard({
          dashboardId: dashboard.id,
          cardId: ORDERS_QUESTION_ID,
        });
      },
    );

    runContentDiagnosticsScan();
    visitContentDiagnosticsTab("sparse");
    searchFindings(SEARCH_TERM);

    cy.log("both types holding a little content are reported as sparse");
    cy.findByTestId("imbalanced-content-list").within(() => {
      cy.findByText(SPARSE_COLLECTION_NAME).should("be.visible");
      cy.findByText(SPARSE_DASHBOARD_NAME).should("be.visible");
    });

    cy.log(
      "sparseness floors at one item, so the bare collection is not sparse",
    );
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      EMPTY_COLLECTION_NAME,
    );

    cy.log("the collection is counted by the items it holds");
    cy.findByTestId("imbalanced-content-list")
      .findByText(SPARSE_COLLECTION_NAME)
      .click();
    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Content count").should("be.visible");
      cy.findByText("2 items").should("be.visible");
    });

    cy.log("the bare collection is reported by the empty tab instead");
    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.findByTestId("imbalanced-content-list")
      .findByText(EMPTY_COLLECTION_NAME)
      .should("be.visible");
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      SPARSE_COLLECTION_NAME,
    );
  });

  it("clusters same-named content of every type, across case, spacing and card sub-kind", () => {
    const SEARCH_TERM = "duplicated";
    const NAME = "E2E duplicated question";
    const NAME_VARIANT = "e2e  DUPLICATED   question";
    const BOTH_NAMES = /e2e\s+duplicated\s+question/i;
    const SAME_NAMES = [
      "E2E duplicated collection",
      "E2E duplicated dashboard",
      "E2E duplicated document",
      "E2E duplicated hybrid",
    ];
    const [COLLECTION_NAME, DASHBOARD_NAME, DOCUMENT_NAME, CROSS_KIND_NAME] =
      SAME_NAMES;

    H.createQuestion({ name: NAME, query: QUERY });
    H.createQuestion({ name: NAME_VARIANT, query: QUERY });
    [COLLECTION_NAME, COLLECTION_NAME].forEach((name) =>
      H.createCollection({ name }),
    );
    [DASHBOARD_NAME, DASHBOARD_NAME].forEach((name) =>
      H.createDashboard({ name }),
    );
    [DOCUMENT_NAME, DOCUMENT_NAME].forEach((name) =>
      H.createDocument({ name, document: EMPTY_DOCUMENT }),
    );
    H.createQuestion({ name: CROSS_KIND_NAME, query: QUERY });
    H.createQuestion({ name: CROSS_KIND_NAME, type: "model", query: QUERY });

    runContentDiagnosticsScan();
    visitContentDiagnosticsTab("duplicated");
    searchFindings(SEARCH_TERM);

    cy.log(
      "both questions are reported, despite differing in case and spacing",
    );
    cy.findByTestId("duplicated-content-list")
      .findAllByText(BOTH_NAMES)
      .should("have.length", 2);

    cy.log(
      "every type the checker covers, and a question with a model, reports both sides",
    );
    SAME_NAMES.forEach((name) => {
      cy.findByTestId("duplicated-content-list")
        .findAllByText(name)
        .should("have.length", 2);
    });

    cy.log("the model is served with its own sub-kind");
    cy.findByTestId("duplicated-content-list")
      .findAllByRole("img", { name: "Model" })
      .should("have.length", 1);

    cy.log("opening one question shows its variant as its duplicate");
    cy.findByTestId("duplicated-content-list").findByText(NAME).click();
    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Duplicates (1)").should("be.visible");
      cy.findByRole("region", { name: "Duplicates" }).should(
        "contain.text",
        NAME_VARIANT,
      );
    });
  });

  it("reports backdated content of every type, and leaves recently used content out", () => {
    const SEARCH_TERM = "staleness";
    const QUESTION_NAME = "E2E staleness backdated question";
    const DASHBOARD_NAME = "E2E staleness backdated dashboard";
    const DOCUMENT_NAME = "E2E staleness backdated document";
    const FRESH_NAME = "E2E staleness fresh question";
    const BACKDATED = [QUESTION_NAME, DASHBOARD_NAME, DOCUMENT_NAME];
    const LAST_USED_ON = "2020-06-15";
    const LAST_USED_DISPLAY = "June 15, 2020";

    H.createQuestion({ name: FRESH_NAME, query: QUERY });
    H.createQuestion({ name: QUESTION_NAME, query: QUERY }).then(
      ({ body: card }) => markStale("card", card.id, LAST_USED_ON),
    );
    H.createDashboard({ name: DASHBOARD_NAME }).then(({ body: dashboard }) =>
      markStale("dashboard", dashboard.id, LAST_USED_ON),
    );
    H.createDocument({ name: DOCUMENT_NAME, document: EMPTY_DOCUMENT }).then(
      ({ body: document }) => markStale("document", document.id, LAST_USED_ON),
    );

    runContentDiagnosticsScan();
    visitContentDiagnosticsTab("stale");
    searchFindings(SEARCH_TERM);

    cy.log("each type is reported, carrying the date it was last active");
    cy.findByTestId("stale-content-list").within(() => {
      BACKDATED.forEach((name) => {
        cy.findByText(name).should("be.visible");
      });
      cy.findAllByText(LAST_USED_DISPLAY).should(
        "have.length",
        BACKDATED.length,
      );
    });

    cy.log("the question that has not gone stale is left out");
    cy.findByTestId("stale-content-list").should(
      "not.contain.text",
      FRESH_NAME,
    );

    cy.log("the document's sidebar shows when it was last viewed");
    cy.findByTestId("stale-content-list").findByText(DOCUMENT_NAME).click();
    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Last viewed").should("be.visible");
      cy.findByText(LAST_USED_DISPLAY).should("be.visible");
    });
  });

  it("drops a finding once the problem is fixed or the entity is gone", () => {
    const SEARCH_TERM = "rescanning";
    const COLLECTION_NAME = "E2E rescanning collection";
    const DASHBOARD_NAME = "E2E rescanning dashboard";

    H.createCollection({ name: COLLECTION_NAME }).then(({ body: collection }) =>
      cy.wrap(collection.id).as("collectionId"),
    );
    H.createDashboard({ name: DASHBOARD_NAME }).then(({ body: dashboard }) =>
      cy.wrap(dashboard.id).as("dashboardId"),
    );
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("both start out empty, and are reported as such");
    cy.findByTestId("imbalanced-content-list").within(() => {
      cy.findByText(COLLECTION_NAME).should("be.visible");
      cy.findByText(DASHBOARD_NAME).should("be.visible");
    });

    cy.get("@collectionId").then((collectionId) => {
      H.createQuestion({
        name: "E2E child question",
        collection_id: Number(collectionId),
        query: QUERY,
      });
    });
    cy.get("@dashboardId").then((dashboardId) => {
      cy.request("DELETE", `/api/dashboard/${dashboardId}`);
    });
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("the collection is no longer empty, so its finding is gone");
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      COLLECTION_NAME,
    );

    cy.log("and the deleted dashboard takes its finding with it");
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      DASHBOARD_NAME,
    );
  });
});

describe(
  "scenarios > monitor > content diagnostics > finding types > slow",
  { tags: "@external" },
  () => {
    const SEARCH_TERM = "slowness";
    const CARD_NAME = "E2E slowness question";
    const EMBEDDED_CARD_NAME = "E2E slowness embedded question";
    const DASHBOARD_NAME = "E2E slowness dashboard";
    const DOCUMENT_NAME = "E2E slowness document";
    const SLOW_QUERY = "SELECT pg_sleep(2)";
    const SECONDS_DURATION = /^\d+\.\ds$/;

    // EMBEDDED_CARD_NAME is absent by design: embedding copies the card, and a document's own copies
    // are not finding subjects. Only the copy is ever executed below, so the name reaches the slow
    // list through the document roll-up alone.
    const SLOW = [CARD_NAME, DASHBOARD_NAME, DOCUMENT_NAME];

    function createSlowQuestion(name: string) {
      return H.createNativeQuestion({
        name,
        database: WRITABLE_DB_ID,
        native: { query: SLOW_QUERY },
      });
    }

    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
    });

    it("reports slow cards, and the dashboard and document that embed them", () => {
      setThreshold("content-diagnostics-slow-card-threshold-seconds", 1);

      createSlowQuestion(CARD_NAME).then(({ body: card }) => {
        cy.request("POST", `/api/card/${card.id}/query`);
        H.createDashboard({ name: DASHBOARD_NAME }).then(
          ({ body: dashboard }) => {
            H.addQuestionToDashboard({
              dashboardId: dashboard.id,
              cardId: card.id,
            });
          },
        );
      });
      createSlowQuestion(EMBEDDED_CARD_NAME).then(({ body: card }) => {
        H.createDocument({
          name: DOCUMENT_NAME,
          document: documentEmbedding([card.id]),
        }).then(({ body: document }) => {
          embeddedCardIds(document.document).forEach((id) => {
            cy.request("POST", `/api/card/${id}/query`);
          });
        });
      });

      runContentDiagnosticsScan();
      visitContentDiagnosticsTab("slow");
      searchFindings(SEARCH_TERM);

      cy.log("the measured cards are reported, and so are both roll-ups");
      cy.findByTestId("slow-content-list").within(() => {
        SLOW.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });

      cy.log("the document's own copy of its card is not a finding of its own");
      cy.findByTestId("slow-content-list")
        .findByText(EMBEDDED_CARD_NAME)
        .should("not.exist");

      cy.log(
        "the document roll-up reports a duration on the scale of the query",
      );
      cy.findByTestId("slow-content-list").findByText(DOCUMENT_NAME).click();
      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText("Duration").should("be.visible");
        cy.findByText(SECONDS_DURATION).should("be.visible");
      });
    });
  },
);
