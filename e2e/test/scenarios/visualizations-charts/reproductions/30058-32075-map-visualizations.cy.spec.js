import {
  addSummaryField,
  addSummaryGroupingField,
  openNotebook,
  popover,
  removeSummaryGroupingField,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  query: {
    "source-query": {
      "source-table": PEOPLE_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          PEOPLE.LATITUDE,
          { "base-type": "type/Float", binning: { strategy: "default" } },
        ],
        [
          "field",
          PEOPLE.LONGITUDE,
          { "base-type": "type/Float", binning: { strategy: "default" } },
        ],
      ],
    },
  },
  database: SAMPLE_DB_ID,
};

describe("issue 32075", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should still display visualization as a map after adding a filter (metabase#32075)", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    addCountGreaterThan2Filter();
    visualize();

    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.get(".PinMap").should("exist");
  });

  it("should still display visualization as a map after adding another column to group by", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    openNotebook();
    addSummaryGroupingField({ field: "Birth Date" });
    visualize();

    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.get(".PinMap").should("exist");
  });

  it("should still display visualization as a map after adding another aggregation", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    openNotebook();
    addSummaryField({ metric: "Average of ...", field: "Longitude" });
    visualize();

    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.get(".PinMap").should("exist");
  });

  it("should change display to default after removing a column to group by when map is not sensible anymore", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    openNotebook();
    removeSummaryGroupingField({ field: "Latitude: Auto binned" });
    visualize();

    cy.get(".PinMap").should("not.exist");
    cy.get(".LineAreaBarChart").should("exist");
  });
});

describe("issue 30058", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not crash visualization after adding a filter (metabase#30058)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "map",
      displayIsLocked: true,
    });

    addCountGreaterThan2Filter();
    visualize();

    cy.get(".Icon-warning").should("not.exist");
  });
});

const addCountGreaterThan2Filter = () => {
  openNotebook();
  cy.findAllByTestId("action-buttons").last().button("Filter").click();
  popover().within(() => {
    cy.findByText("Count").click();
    cy.findByDisplayValue("Equal to").click();
  });
  cy.findByRole("listbox").findByText("Greater than").click();
  popover().within(() => {
    cy.findByPlaceholderText("Enter a number").type("2");
    cy.button("Add filter").click();
  });
};
