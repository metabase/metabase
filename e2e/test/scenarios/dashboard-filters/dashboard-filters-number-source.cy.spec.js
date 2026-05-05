const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

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
      H.createQuestionAndDashboard({
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
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isDropdown: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });
  });

  describe("static list source (search)", () => {
    it("should be able to use a static list source (search)", () => {
      H.createQuestionAndDashboard({
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
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Twenty").should("be.visible");
    });
  });

  describe("card source (dropdown)", () => {
    it("should allow to use a card source with numeric columns and a single value", () => {
      cy.log("setup a dashboard");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.editDashboard();
      H.setFilter("Number", "Less than or equal to");
      H.selectDashboardFilter(H.getDashboardCard(), "Total");
      H.sidebar().findByText("Dropdown list").click();
      H.setFilterQuestionSource({ question: "Orders", field: "ID" });
      H.saveDashboard();

      cy.log("pick a value without searching");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByText("5").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard().findByText("1 row").should("be.visible");

      cy.log("pick a value with searching");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Search the list").type("225");
        cy.findByLabelText("5").should("not.exist");
        cy.findByText("225").click();
        cy.button("Update filter").click();
      });
      H.getDashboardCard()
        .findByText("Showing first 2,000 rows")
        .should("be.visible");
    });

    it("should allow to use a card source with numeric columns and multiple values", () => {
      cy.log("setup a dashboard");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.editDashboard();
      H.setFilter("Number", "Equal to");
      H.selectDashboardFilter(H.getDashboardCard(), "Quantity");
      H.sidebar().findByText("Dropdown list").click();
      H.setFilterQuestionSource({ question: "Orders", field: "ID" });
      H.saveDashboard();

      cy.log("pick a value without searching");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByText("7").click();
        cy.findByText("25").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard().findByText("932 rows").should("be.visible");

      cy.log("pick a value with searching");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByLabelText("7").should("be.checked");
        cy.findByLabelText("25").should("be.checked");
        cy.findByPlaceholderText("Search the list").type("225");
        cy.findByLabelText("7").should("not.exist");
        cy.findByText("225").click();
        cy.button("Update filter").click();
      });
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByLabelText("7").should("be.checked");
        cy.findByLabelText("25").should("be.checked");
        cy.findByLabelText("225").should("be.checked");
      });
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
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
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

const getTargetDashboard = (sourceSettings) => ({
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

const getListDashboard = (values_query_type) => {
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
