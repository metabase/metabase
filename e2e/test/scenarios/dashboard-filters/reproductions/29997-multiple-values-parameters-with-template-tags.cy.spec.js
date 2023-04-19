import {
  restore,
  editDashboard,
  visitDashboard,
  getDashboardCard,
  selectDashboardFilter,
  filterWidget,
  popover,
} from "e2e/support/helpers";

import * as FieldFilter from "e2e/test/scenarios/native-filters/helpers/e2e-field-filter-helpers";

const nativeQuestionDetails = {
  name: "Native question with state parameter",
  native: {
    query: "select * from people where state = {{state}};",
    "template-tags": {
      state: {
        type: "text",
        name: "state",
        id: "c2efec27-91b7-4c2d-b584-c07c759c554e",
        "display-name": "State",
      },
    },
  },
};

const nativeQuestionParameter = {
  id: "c2efec27-91b7-4c2d-b584-c07c759c554e",
  name: "State",
  slug: "state",
  target: ["variable", ["template-tag", "state"]],
  type: "category",
  values_query_type: "list",
};

const dashboardParameter = {
  name: "State",
  slug: "state",
  id: "f8ae0c97",
  type: "string/=",
  sectionId: "location",
  values_query_type: "list",
};

const customValues = {
  values_source_config: { values: ["AK", "AL", "AR", "AZ", "CA"] },
  values_source_type: "static-list",
};

const dashboardDetails = {
  name: "Multiple values parameter with template tags",
};

describe("issue 29997", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it('should not see "people can pick" option when connecting a native questions to a dashboard parameter with custom values (metabase#29997)', () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails: nativeQuestionDetails,
      dashboardDetails: {
        ...dashboardDetails,
        parameters: [
          {
            ...dashboardParameter,
            ...customValues,
          },
        ],
      },
    }).then(({ body: dashboardCard }) => {
      const { dashboard_id } = dashboardCard;
      visitDashboard(dashboard_id);
    });

    editDashboard();
    cy.findByText("State").icon("gear").click();
    cy.findByText("People can pick").should("be.visible");

    selectDashboardFilter(getDashboardCard(0), "State");
    cy.findByText("People can pick").should("not.exist");

    cy.button("Save").click();
    filterWidget().click();
    FieldFilter.selectFilterValueFromList("AK");
    cy.findByText("Rows 1-6 of 68").should("be.visible");

    filterWidget().click();
    FieldFilter.selectFilterValueFromList("AL", { addFilter: false });
    popover().button("Update filter").click();

    // The number of rows is less than 68 because the filter supports only one value.
    // If it supports multiple values the number of rows should be more than 68.
    cy.findByText("Rows 1-6 of 56").should("be.visible");
  });

  it('should not see "people can pick" option when connecting a native questions with custom values to a dashboard parameter (metabase#29997)', () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails: {
        ...nativeQuestionDetails,
        parameters: [
          {
            ...nativeQuestionParameter,
            ...customValues,
          },
        ],
      },
      dashboardDetails: {
        ...dashboardDetails,
        parameters: [dashboardParameter],
      },
    }).then(({ body: dashboardCard }) => {
      const { dashboard_id } = dashboardCard;
      visitDashboard(dashboard_id);
    });

    editDashboard();
    cy.findByText("State").icon("gear").click();
    cy.findByText("People can pick").should("be.visible");

    selectDashboardFilter(getDashboardCard(0), "State");
    cy.findByText("People can pick").should("not.exist");

    cy.button("Save").click();
    filterWidget().click();
    FieldFilter.addWidgetStringFilter("AK");
    cy.findByText("Rows 1-6 of 68").should("be.visible");

    filterWidget().click();
    FieldFilter.addWidgetStringFilter("{selectall}{backspace}AL", "update");

    // The number of rows is less than 68 because the filter supports only one value.
    // If it supports multiple values the number of rows should be more than 68.
    cy.findByText("Rows 1-6 of 56").should("be.visible");
  });
});
