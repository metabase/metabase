import {
  editDashboard,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
  openQuestionActions,
  visitQuestion,
  setFilterQuestionSource,
  setFilterListSource,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const structuredSourceQuestion = {
  name: "GUI source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
  },
};

const nativeSourceQuestion = {
  name: "SQL source",
  native: {
    query: "select distinct CATEGORY from PRODUCTS order by CATEGORY limit 2",
  },
};

const targetParameter = {
  name: "Text",
  slug: "text",
  id: "f8ec7c71",
  type: "string/=",
  sectionId: "string",
};

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("structured question source", () => {
    it("should be able to use a structured question source", () => {
      cy.createQuestion(structuredSourceQuestion, { wrapId: true });
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setFilterQuestionSource({ question: "GUI source", field: "Category" });
      saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(visitQuestion);
      archiveQuestion();
    });

    it("should be able to use a structured question source when embedded", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getTargetDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getTargetParameterMapping(card));
            visitEmbeddedPage(getDashboardResource(card));
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a structured question source when public", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getTargetDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getTargetParameterMapping(card));
            visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });
  });

  describe("native question source", () => {
    it("should be able to use a native question source", () => {
      cy.createNativeQuestion(nativeSourceQuestion, { wrapId: true });
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setFilterQuestionSource({ question: "SQL source", field: "CATEGORY" });
      saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(visitQuestion);
      archiveQuestion();
    });
  });

  describe("static list source", () => {
    it("should be able to use a static list source", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setFilterListSource({ values: ["Doohickey", "Gadget"] });
      saveDashboard();
      filterDashboard();
    });
  });
});

const mapFilterToQuestion = () => {
  cy.findByText("Select…").click();
  popover().within(() => cy.findByText("Category").click());
};

const filterDashboard = () => {
  cy.findByText("Text").click();

  popover().within(() => {
    cy.findByText("Doohickey").should("be.visible");
    cy.findByText("Gadget").should("be.visible");
    cy.findByText("Gizmo").should("not.exist");

    cy.findByPlaceholderText("Search the list").type("Gadget");
    cy.findByText("Doohickey").should("not.exist");
    cy.findByText("Gadget").click();
    cy.button("Add filter").click();
  });
};

const archiveQuestion = () => {
  openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    "This question will be removed from any dashboards or pulses using it. It will also be removed from the filter that uses it to populate values.",
  );
};

const getDashboardResource = ({ dashboard_id }) => ({
  resource: { dashboard: dashboard_id },
  params: {},
});

const getTargetDashboard = questionId => ({
  parameters: [
    {
      ...targetParameter,
      values_source_type: "card",
      values_source_config: {
        card_id: questionId,
        value_field: ["field", PRODUCTS.CATEGORY, null],
      },
    },
  ],
  enable_embedding: true,
  embedding_params: {
    [targetParameter.slug]: "enabled",
  },
});

const getTargetParameterMapping = ({ card_id }) => ({
  parameter_mappings: [
    {
      card_id,
      parameter_id: targetParameter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ],
});
