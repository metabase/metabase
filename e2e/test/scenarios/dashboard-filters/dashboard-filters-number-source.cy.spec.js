import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ACCOUNTS, ORDERS_ID } = SAMPLE_DATABASE;

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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("static list source (dropdown)", () => {
    it("should be able to use a static list source", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion();
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      H.saveDashboard();

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
      H.getDashboardCard().findByText("4").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        H.visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });
  });

  describe("static list source (search)", () => {
    it("should be able to use a static list source (search)", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Number", "Equal to", "Number");
      mapFilterToQuestion();
      H.sidebar().findByText("Search box").click();
      H.setFilterListSource({
        values: [[10, "Ten"], [20, "Twenty"], 30],
      });
      H.saveDashboard();

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        H.visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });
  });
});

const mapFilterToQuestion = (column = "Quantity") => {
  cy.findByText("Select…").click();
  H.popover().within(() => cy.findByText(column).click());
};

const filterDashboard = ({ isLabeled = false, isDropdown = false } = {}) => {
  H.filterWidget().click();

  if (isDropdown) {
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list");

      cy.findByText("Ten").should("be.visible");
      cy.findAllByText("30").should("be.visible");
      cy.findByText("Twenty").should("be.visible").click();

      cy.button("Add filter").click();
    });
    return;
  }

  if (isLabeled) {
    H.popover().first().findByPlaceholderText("Enter a number").type("T");
    H.popover().last().findByText("Twenty").click();
    H.popover().first().button("Add filter").click();
    return;
  }

  H.popover().within(() => {
    cy.findByPlaceholderText("Enter a number").type("20");
    cy.button("Add filter").click();
  });
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
