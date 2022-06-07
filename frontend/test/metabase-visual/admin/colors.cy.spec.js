import {
  describeEE,
  popover,
  restore,
  visitQuestionAdhoc,
} from "__support__/e2e/cypress";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "line",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["cum-sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  },
};

describeEE("visual tests > admin > colors", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/setting/application-colors").as("updateColors");
  });

  it("should update brand colors", () => {
    cy.visit("/admin/settings/whitelabel");

    const title = "User interface colors";
    updateColor(title, "#509EE3", "#885AB1");
    updateColor(title, "#88BF4D", "#ED6E6E");
    updateColor(title, "#7172AD", "#F9CF48");

    visitQuestionAdhoc(questionDetails);
    cy.percySnapshot();
  });
});

const section = title => {
  return cy.findByText(title).parent();
};

const updateColor = (title, oldColor, newColor) => {
  section(title).within(() => {
    cy.findByLabelText(oldColor).click();
  });

  popover().within(() => {
    cy.findByRole("textbox").clear();
    cy.findByRole("textbox").type(newColor);
    cy.findByRole("textbox").type("{esc}");
  });

  cy.wait("@updateColors");
};
