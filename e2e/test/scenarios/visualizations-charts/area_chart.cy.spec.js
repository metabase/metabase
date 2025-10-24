const { H } = cy;

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("scenarios > visualizations > area chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("Data > series settings > Replace missing values", () => {
    const SERIES_1_NAME = "series1";
    const SERIES_2_NAME = "series2";
    const queryWithNulls = {
      type: "native",
      native: {
        query: `
          select 'a' x, 1 y, '${SERIES_1_NAME}' s
          union all
          select 'b' x, null y, '${SERIES_1_NAME}' s
          union all
          select 'c' x, 2 y, '${SERIES_1_NAME}' s
          union all
          select 'a' x, 2 y, '${SERIES_2_NAME}' s
          union all
          select 'b' x, null y, '${SERIES_2_NAME}' s
          union all
          select 'c' x, 3 y, '${SERIES_2_NAME}' s
        `,
        "template-tags": {},
      },
      database: SAMPLE_DB_ID,
    };

    it("should not include 'Linear interpolated' option for stacked area charts and default to 'Zero'", () => {
      H.visitQuestionAdhoc({
        dataset_query: queryWithNulls,
        display: "area",
      });

      H.openVizSettingsSidebar();
      cy.findByTestId("chartsettings-sidebar")
        .findByTestId(`${SERIES_1_NAME}-settings-button`)
        .click();

      H.popover().within(() => {
        cy.findByLabelText("Replace missing values with")
          .click()
          .should("have.value", "Zero");

        cy.findByRole("option", { name: "Zero" }).should("be.visible");
        cy.findByRole("option", { name: "Nothing" }).should("be.visible");
        cy.findByRole("option", { name: "Linear Interpolated" }).should(
          "not.exist",
        );
      });

      cy.log('Verify "Stack" is already selected in Display settings');
      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findByText("Display").click();
        cy.findByRole("radio", { name: "Stack" }).should("be.checked");
      });
    });

    it("should not include 'Linear interpolated' option for 100% stacked area charts and default to 'Zero'", () => {
      H.visitQuestionAdhoc({
        dataset_query: queryWithNulls,
        display: "area",
        visualization_settings: {
          "stackable.stack_type": "normalized",
        },
      });

      H.openVizSettingsSidebar();
      cy.findByTestId("chartsettings-sidebar")
        .findByTestId(`${SERIES_1_NAME}-settings-button`)
        .click();

      H.popover().within(() => {
        cy.findByLabelText("Replace missing values with")
          .click()
          .should("have.value", "Zero");

        cy.findByRole("option", { name: "Zero" }).should("be.visible");
        cy.findByRole("option", { name: "Nothing" }).should("be.visible");
        cy.findByRole("option", { name: "Linear Interpolated" }).should(
          "not.exist",
        );
      });

      cy.log('Verify "Stack - 100%" is already selected in Display settings');
      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findByText("Display").click();
        cy.findByRole("radio", { name: "Stack - 100%" }).should("be.checked");
      });
    });

    it("should bring 'Linear interpolated' option back and show it as a default value when selecting 'No stack' option", () => {
      H.visitQuestionAdhoc({
        dataset_query: queryWithNulls,
        display: "area",
      });

      H.openVizSettingsSidebar();
      cy.log("Change Display setting to 'Don't stack'");
      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findByText("Display").click();
        cy.findByRole("radio", { name: "Don't stack" })
          .click()
          .should("be.checked");
      });

      cy.log(
        "Verify 'Linear interpolated' option is back and selected by default",
      );
      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findByText("Data").click();
        cy.findByTestId(`${SERIES_1_NAME}-settings-button`).click();
      });
      H.popover()
        .findByLabelText("Replace missing values with")
        .click()
        .should("have.value", "Linear Interpolated");
    });
  });
});
