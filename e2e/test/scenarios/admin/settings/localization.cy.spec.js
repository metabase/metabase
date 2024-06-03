import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitQuestionAdhoc,
  visitQuestion,
  popover,
  undoToast,
  echartsContainer,
  tableHeaderClick,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > localization", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setFirstWeekDayTo("monday");
  });

  it("should correctly apply start of the week to a bar chart (metabase#13516)", () => {
    // programatically create and save a question based on Orders table
    // filter: created before June 1st, 2022
    // summarize: Count by CreatedAt: Week

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.createQuestion({
      name: "Orders created before June 1st 2022",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        filter: ["<", ["field", ORDERS.CREATED_AT, null], "2022-06-01"],
      },
      display: "line",
    });

    // find and open that question
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders created before June 1st 2022").click();

    cy.wait("@cardQuery");

    cy.log("Assert the dates on the X axis");
    // it's hard and tricky to invoke hover in Cypress, especially in our graphs
    // that's why we have to assert on the x-axis, instead of a popover that shows on a dot hover
    echartsContainer().get("text").contains("April 25, 2022");
  });

  it("should display days on X-axis correctly when grouped by 'Day of the Week' (metabase#13604)", () => {
    cy.createQuestion({
      name: "13604",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "day-of-week" }],
        ],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, null],
          "2026-03-02", // Monday
          "2026-03-03", // Tuesday
        ],
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "graph.x_axis.scale": "ordinal",
      },
    });

    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13604").click();

    cy.log("Reported failing on v0.37.0.2 and labeled as `.Regression`");
    echartsContainer()
      .get("text")
      .contains(/sunday/i)
      .should("not.exist");
    echartsContainer()
      .get("text")
      .contains(/monday/i);
    echartsContainer()
      .get("text")
      .contains(/tuesday/i);
  });

  // HANDLE WITH CARE!
  // This test is extremely tricky and fragile because it needs to test for the "past X weeks" to check if week starts on Sunday or Monday.
  // As the time goes by we're risking that past X weeks don't yield any result when applied to the sample database.
  // For that reason I've chosen the past 220 weeks (mid-October 2022). This should give us 3+ years to run this test without updates.

  // TODO:
  //  - Keep an eye on this test in CI and update the week range as needed.
  it("should respect start of the week in SQL questions with filters (metabase#14294)", () => {
    cy.createNativeQuestion(
      {
        name: "14294",
        native: {
          query:
            "select ID, CREATED_AT, dayname(CREATED_AT) as CREATED_AT_DAY\nfrom ORDERS \n[[where {{date_range}}]]\norder by CREATED_AT",
          "template-tags": {
            date_range: {
              id: "93961154-c3d5-7c93-7b59-f4e494fda499",
              name: "date_range",
              "display-name": "Date range",
              type: "dimension",
              dimension: ["field", ORDERS.CREATED_AT, null],
              "widget-type": "date/all-options",
              default: "past220weeks",
              required: true,
            },
          },
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("TableInteractive-root").as("resultTable");

    cy.get("@resultTable").within(() => {
      // The third cell in the first row (CREATED_AT_DAY)
      cy.get("[data-testid=cell-data]").eq(2).should("not.contain", "Sunday");
    });
  });

  it("should not display excessive options in localization tab (metabase#14426)", () => {
    cy.visit("/admin/settings/localization");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Instance language/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Report timezone/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/First day of the week/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Localization options/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/Column title/i).should("not.exist");
  });

  it("should use currency settings for number columns with style set to currency (metabase#10787)", () => {
    cy.visit("/admin/settings/localization");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Unit of currency");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("US Dollar").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Euro").click();
    undoToast().findByText("Changes saved").should("be.visible");

    visitQuestionAdhoc({
      display: "scalar",
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT 10 as A",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        column_settings: {
          '["name","A"]': {
            number_style: "currency",
          },
        },
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("€10.00");
  });

  it("should use fix up clj unit testsdate and time styling settings in the date filter widget (metabase#9151, metabase#12472)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/setting/custom-formatting").as(
      "updateFormatting",
    );

    cy.visit("/admin/settings/localization");

    cy.findByTestId("custom-formatting-setting").within(() => {
      // update the date style setting to YYYY/MM/DD
      cy.findByText("January 31, 2018").click();
    });

    popover().findByText("2018/1/31").click();
    cy.wait("@updateFormatting");

    cy.findByTestId("custom-formatting-setting").within(() => {
      cy.findAllByTestId("select-button-content").should(
        "contain",
        "2018/1/31",
      );

      // update the time style setting to 24 hour
      cy.findByText("17:24 (24-hour clock)").click();
      cy.wait("@updateFormatting");
      cy.findByDisplayValue("HH:mm").should("be.checked");
    });

    visitQuestion(ORDERS_QUESTION_ID);

    // create a date filter and set it to the 'On' view to see a specific date
    tableHeaderClick("Created At");

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Specific dates…").click();
      cy.findByText("On").click();

      // ensure the date picker is ready
      cy.findByTextEnsureVisible("Add time");
      cy.findByTextEnsureVisible("Add filter");

      // update the date input in the widget
      cy.findByLabelText("Date").clear().type("2024/5/15").blur();

      // add a time to the date
      cy.findByText("Add time").click();
      cy.findByLabelText("Time").clear().type("19:56");

      // apply the date filter
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");

    cy.findByTestId("loading-spinner").should("not.exist");

    // verify that the correct row is displayed
    cy.findByTestId("TableInteractive-root").within(() => {
      cy.findByText("2024/5/15, 19:56");
      cy.findByText("127.52");
    });
  });
});

function setFirstWeekDayTo(day) {
  cy.request("PUT", "/api/setting/start-of-week", {
    value: day.toLowerCase(),
  });
}
