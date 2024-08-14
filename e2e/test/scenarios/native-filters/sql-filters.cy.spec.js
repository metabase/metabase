import {
  restore,
  openNativeEditor,
  filterWidget,
  popover,
} from "e2e/support/helpers";

import * as DateFilter from "./helpers/e2e-date-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

describe("scenarios > filters > sql filters > basic filter types", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    openNativeEditor();
  });

  describe("should work for text", () => {
    beforeEach(() => {
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE products.category = {{textFilter}}",
      );
    });

    it("when set through the filter widget", () => {
      SQLFilter.setWidgetValue("Gizmo");

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Rustic Paper Wallet");
        cy.findAllByText("Doohickey").should("not.exist");
      });
    });

    it("when set as the default value for a required filter", () => {
      SQLFilter.toggleRequired();
      SQLFilter.setDefaultValue("Gizmo");

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Rustic Paper Wallet");
        cy.findAllByText("Doohickey").should("not.exist");
      });
    });

    describe("required tag", () => {
      it("does not need a default value to run and save the query", () => {
        SQLFilter.toggleRequired();
        SQLFilter.getRunQueryButton().should("not.be.disabled");
        SQLFilter.getSaveQueryButton().should("not.have.attr", "disabled");
      });

      it("when there's a default value, enabling required sets it as a parameter value", () => {
        SQLFilter.setDefaultValue("New value");
        filterWidget().find("input").invoke("val", "");
        SQLFilter.toggleRequired();
        filterWidget().find("input").should("have.value", "New value");
      });

      it("when there's a default value and input is empty, blur sets default value back", () => {
        SQLFilter.setDefaultValue("default");
        SQLFilter.toggleRequired();
        filterWidget().within(() => {
          cy.get("input")
            .type("{selectAll}{backspace}")
            .should("have.value", "");
          cy.get("input").blur().should("have.value", "default");
        });
      });

      it("when there's a default value and template tag is required, can reset it back", () => {
        SQLFilter.setDefaultValue("default");
        SQLFilter.toggleRequired();
        filterWidget().within(() => {
          cy.get("input").type("abc").should("have.value", "defaultabc");
          cy.icon("revert").click();
          cy.get("input").should("have.value", "default");
        });
      });
    });
  });

  describe("should work for number", () => {
    beforeEach(() => {
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE products.rating = {{numberFilter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");
    });

    it("when set through the filter widget", () => {
      SQLFilter.setWidgetValue("4.3");

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Aerodynamic Linen Coat");
        cy.findAllByText("4.3");
      });
    });

    it("when set as the default value for a required filter (metabase#16811)", () => {
      SQLFilter.toggleRequired();
      SQLFilter.setDefaultValue("4.3");

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Aerodynamic Linen Coat");
        cy.findAllByText("4.3");
      });
    });

    describe("required tag", () => {
      it("does not need a default value to run and save the query", () => {
        SQLFilter.toggleRequired();
        SQLFilter.getRunQueryButton().should("not.be.disabled");
        SQLFilter.getSaveQueryButton().should("not.have.attr", "disabled");
      });

      it("when there's a default value, enabling required sets it as a parameter value", () => {
        SQLFilter.setDefaultValue("3");
        filterWidget().find("input").invoke("val", "");
        SQLFilter.toggleRequired();
        filterWidget().find("input").should("have.value", "3");
      });

      it("when there's a default value and input is empty, blur sets default value back", () => {
        SQLFilter.setDefaultValue("3");
        SQLFilter.toggleRequired();
        filterWidget().within(() => {
          cy.get("input")
            .type("{selectAll}{backspace}")
            .should("have.value", "");
          cy.get("input").blur().should("have.value", "3");
        });
      });

      it("when there's a default value and template tag is required, can reset it back", () => {
        SQLFilter.setDefaultValue("3");
        SQLFilter.toggleRequired();
        filterWidget().within(() => {
          cy.get("input").type(".11").should("have.value", "3.11");
          cy.icon("revert").click();
          cy.get("input").should("have.value", "3");
        });
      });
    });
  });

  describe("should work for date", () => {
    beforeEach(() => {
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE products.created_at = {{dateFilter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Date");
    });

    it("when set through the filter widget", () => {
      filterWidget().click();
      // Since we have fixed dates in Sample Database (dating back a couple of years), it'd be cumbersome to click back month by month.
      // Instead, let's choose the 15th of the current month and assert that there are no products / no results.

      popover().within(() => {
        cy.findByText("15").click();
        cy.findByText("Add filter").click();
      });

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("No results!");
      });
    });

    it("when set as the default value for a required filter", () => {
      SQLFilter.toggleRequired();

      cy.findByTestId("sidebar-content")
        .findByPlaceholderText("Select a default value…")
        .click();
      popover().within(() => {
        cy.findByText("15").click();
        cy.findByText("Add filter").click();
      });

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("No results!");
      });
    });

    function setDefaultDate(year = "2024", month = "01", day = "22") {
      cy.findByTestId("sidebar-content")
        .findByPlaceholderText("Select a default value…")
        .click();
      popover().within(() => {
        DateFilter.setSingleDate(`${month}/${day}/${year}`);
        cy.findByText("Add filter").click();
      });
    }

    describe("required tag", () => {
      it("does not need a default value to run and save the query", () => {
        SQLFilter.toggleRequired();
        SQLFilter.getRunQueryButton().should("not.be.disabled");
        SQLFilter.getSaveQueryButton().should("not.have.attr", "disabled");
      });

      it("when there's a default value, enabling required sets it as a parameter value", () => {
        setDefaultDate("2023", "11", "01");
        filterWidget().icon("close").click();
        SQLFilter.toggleRequired();
        filterWidget()
          .findByTestId("field-set-content")
          .should("have.text", "November 1, 2023");
      });

      it("when there's a default value and template tag is required, can reset it back", () => {
        setDefaultDate("2023", "11", "01");
        SQLFilter.toggleRequired();
        filterWidget().click();
        popover().within(() => {
          cy.findByText("15").click();
          cy.findByText("Update filter").click();
        });
        filterWidget().icon("revert").click();
        filterWidget()
          .findByTestId("field-set-content")
          .should("have.text", "November 1, 2023");
      });
    });
  });

  it("displays parameter field on desktop and mobile", () => {
    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE products.category = {{testingparamvisbility77}}",
    );

    SQLFilter.setWidgetValue("Gizmo");
    SQLFilter.runQuery();

    cy.get("fieldset")
      .findByText("Testingparamvisbility77")
      .should("be.visible");

    // close sidebar
    cy.findByTestId("sidebar-right").within(() => {
      cy.get(".Icon-close").click();
    });

    cy.icon("contract").click();

    // resize window to mobile form factor
    cy.viewport(480, 800);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1 active filter").click();

    cy.get("fieldset")
      .findByText("Testingparamvisbility77")
      .should("be.visible");
  });

  // flaky test (#19454)
  it.skip("should show an info popover when hovering over fields in the field filter field picker", () => {
    SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{cat}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    popover().within(() => {
      cy.findByText("People").click();
      cy.findByText("City").trigger("mouseenter");
    });

    popover().contains("City");
    popover().contains("1,966 distinct values");
  });
});
