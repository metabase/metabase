import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
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
  setDropdownFilterType,
  getDashboardCard,
  filterWidget,
  sidebar,
} from "e2e/support/helpers";

const { ACCOUNTS, ORDERS_ID, ACCOUNTS_ID } = SAMPLE_DATABASE;

const structuredSourceQuestion = {
  name: "GUI source",
  query: {
    "source-table": ACCOUNTS_ID,
  },
};

const nativeSourceQuestion = {
  name: "SQL source",
  native: {
    query: "select * from ORDERS;",
  },
};

const targetParameter = {
  id: "f8ec7c71",
  type: "number/=",
  name: "Number",
  slug: "number",
  sectionId: "number",
};

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > dashboard > filters", { tags: "@slow" }, () => {
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
      setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion("Quantity");
      setFilterQuestionSource({ question: "GUI source", field: "Seats" });
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
            dashboardDetails: getStructuredDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
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
            dashboardDetails: getStructuredDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a structured question source with number/= parameter", () => {
      cy.createQuestion(structuredSourceQuestion, { wrapId: true });
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion();
      setDropdownFilterType();
      setFilterQuestionSource({ question: "GUI source", field: "Seats" });
      saveDashboard();
      getDashboardCard().findByText("18,760").should("be.visible");

      filterWidget().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("2");
        cy.button("Add filter").click();
      });

      getDashboardCard().findByText("4,570").should("be.visible");
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
      setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion();
      setFilterQuestionSource({ question: "SQL source", field: "QUANTITY" });
      saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(visitQuestion);
      archiveQuestion();
    });

    it("should be able to use a native question source when embedded", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getNativeDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitEmbeddedPage(getDashboardResource(card));
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a native question source when public", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getNativeDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });
  });

  describe("static list source (dropdown)", () => {
    it("should be able to use a static list source", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion();
      setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      saveDashboard();
      filterWidget().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("T");
      });
      popover()
        .last()
        .within(() => {
          cy.findByText("30").should("not.exist");
          cy.findByText("Ten").should("be.visible");
          cy.findByText("Twenty").should("be.visible").click();
        });

      popover().button("Add filter").click();

      filterWidget().findByText("Twenty").should("be.visible");
      getDashboardCard().findByText("4").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Twenty").should("be.visible");
    });
  });

  describe("static list source (search)", () => {
    it("should be able to use a static list source (search)", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion();
      sidebar().findByText("Search box").click();
      setFilterListSource({
        values: [[10, "Ten"], [20, "Twenty"], 30],
      });
      saveDashboard();

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Twenty").should("be.visible");
    });
  });
});

const mapFilterToQuestion = (column = "Quantity") => {
  cy.findByText("Select…").click();
  popover().within(() => cy.findByText(column).click());
};

const filterDashboard = ({ isLabeled = false } = {}) => {
  cy.findByText("Number").click();

  if (isLabeled) {
    popover().first().findByPlaceholderText("Enter a number").type("T");
    popover().last().findByText("Twenty").click();
    popover().first().button("Add filter").click();
    return;
  }

  popover().within(() => {
    cy.findByPlaceholderText("Enter a number").type("20");
    cy.button("Add filter").click();
  });
};

const archiveQuestion = () => {
  openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    "This question will be removed from any dashboards or alerts using it. It will also be removed from the filter that uses it to populate values.",
  );
};

const getDashboardResource = ({ dashboard_id }) => ({
  resource: { dashboard: dashboard_id },
  params: {},
});

const getTargetDashboard = sourceSettings => ({
  parameters: [
    {
      ...targetParameter,
      ...sourceSettings,
    },
  ],
  enable_embedding: true,
  embedding_params: {
    [targetParameter.slug]: "enabled",
  },
});

const getStructuredDashboard = questionId => {
  return getTargetDashboard({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", ACCOUNTS.SEATS, null],
    },
  });
};

const getNativeDashboard = questionId => {
  return getTargetDashboard({
    values_source_type: "card",
    values_query_type: "input",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", "RATING", { "base-type": "type/Integer" }],
    },
  });
};

const getListDashboard = values_query_type => {
  return getTargetDashboard({
    values_source_type: "static-list",
    values_query_type,
    values_source_config: {
      values: [[10, "Ten"], [20, "Twenty"], 30],
    },
  });
};

const getParameterMapping = ({ card_id }) => ({
  parameter_mappings: [
    {
      card_id,
      parameter_id: targetParameter.id,
      target: ["dimension", ["field", ACCOUNTS.SEATS, null]],
    },
  ],
});
