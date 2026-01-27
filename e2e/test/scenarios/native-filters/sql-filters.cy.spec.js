const { H } = cy;

import * as DateFilter from "./helpers/e2e-date-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

describe("scenarios > filters > sql filters > basic filter types", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    H.startNewNativeQuestion();
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
        H.filterWidget().find("input").invoke("val", "");
        SQLFilter.toggleRequired();
        H.filterWidget().find("input").should("have.value", "New value");
      });

      it("when there's a default value and input is empty, blur sets default value back", () => {
        SQLFilter.setDefaultValue("default");
        SQLFilter.toggleRequired();
        H.filterWidget().within(() => {
          cy.get("input")
            .type("{selectAll}{backspace}")
            .should("have.value", "");
          cy.get("input").blur().should("have.value", "default");
        });
      });

      it("when there's a default value and template tag is required, can reset it back", () => {
        SQLFilter.setDefaultValue("default");
        SQLFilter.toggleRequired();
        H.filterWidget().within(() => {
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
        H.filterWidget().find("input").invoke("val", "");
        SQLFilter.toggleRequired();
        H.filterWidget().find("input").should("have.value", "3");
      });

      it("when there's a default value and input is empty, blur sets default value back", () => {
        SQLFilter.setDefaultValue("3");
        SQLFilter.toggleRequired();
        H.filterWidget().within(() => {
          cy.get("input")
            .type("{selectAll}{backspace}")
            .should("have.value", "");
          cy.get("input").blur().should("have.value", "3");
        });
      });

      it("when there's a default value and template tag is required, can reset it back", () => {
        SQLFilter.setDefaultValue("3");
        SQLFilter.toggleRequired();
        H.filterWidget().within(() => {
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
      H.filterWidget().click();
      // Since we have fixed dates in Sample Database (dating back a couple of years), it'd be cumbersome to click back month by month.
      // Instead, let's choose the 15th of the current month and assert that there are no products / no results.

      H.popover().within(() => {
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
        .findByText("Select a default value…")
        .click();
      H.popover().within(() => {
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
        .findByText("Select a default value…")
        .click();
      DateFilter.setSingleDate(`${month}/${day}/${year}`);
      H.popover().findByText("Add filter").click();
    }

    describe("required tag", () => {
      it("does not need a default value to run and save the query", () => {
        SQLFilter.toggleRequired();
        SQLFilter.getRunQueryButton().should("not.be.disabled");
        SQLFilter.getSaveQueryButton().should("not.have.attr", "disabled");
      });

      it("when there's a default value, enabling required sets it as a parameter value", () => {
        setDefaultDate("2023", "11", "01");
        H.filterWidget().icon("close").click();
        SQLFilter.toggleRequired();
        H.filterWidget().should("contain.text", "November 1, 2023");
      });

      it("when there's a default value and template tag is required, can reset it back", () => {
        setDefaultDate("2023", "11", "01");
        SQLFilter.toggleRequired();
        H.filterWidget().click();
        H.popover().within(() => {
          cy.findByText("15").click();
          cy.findByText("Update filter").click();
        });
        H.filterWidget().icon("revert").click();
        H.filterWidget().should("contain.text", "November 1, 2023");
      });
    });
  });

  it("displays parameter field on desktop and mobile", () => {
    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE products.category = {{testingparamvisbility77}}",
    );

    SQLFilter.setWidgetValue("Gizmo");
    SQLFilter.runQuery();

    H.filterWidget()
      .findByPlaceholderText("Testingparamvisbility77")
      .should("be.visible");

    // close sidebar
    cy.findByTestId("sidebar-right").within(() => {
      cy.get(".Icon-close").click();
    });

    cy.icon("contract").click();

    // resize window to mobile form factor
    cy.viewport(480, 800);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1 active filter").click();

    H.filterWidget()
      .findByPlaceholderText("Testingparamvisbility77")
      .should("be.visible");
  });

  // flaky test (#19454)
  it(
    "should show an info popover when hovering over fields in the field filter field picker",
    { tags: "@skip" },
    () => {
      SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{cat}}");

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");

      H.popover().within(() => {
        cy.findByText("People").click();
        cy.findByText("City").trigger("mouseenter");
      });

      H.popover().contains("City");
      H.popover().contains("1,966 distinct values");
    },
  );
});

describe("scenarios > filters > sql filters > multiple values", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  function setFilterAndVerify({ values, isQueryBuilder } = {}) {
    H.filterWidget().click();
    H.popover().within(() => {
      H.multiAutocompleteInput().type(values.join(","));
      cy.button("Add filter").click();
    });
    if (isQueryBuilder) {
      cy.findAllByTestId("run-button").first().click();
    }
    values.forEach((value) => {
      H.tableInteractive().within(() => {
        cy.findAllByText(value).should("have.length.gte", 1);
        cy.findAllByText(value).should("have.length.gte", 1);
      });
    });
  }

  it("should allow multiple values for Text variables", () => {
    const questionDetails = {
      name: "SQL",
      native: {
        query: "SELECT * FROM products WHERE category IN ({{text}})",
        "template-tags": {
          text: {
            id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
            name: "text",
            "display-name": "Text",
            type: "text",
          },
        },
      },
      parameters: [
        {
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          type: "string/=",
          name: "Text",
          slug: "text",
          target: ["variable", ["template-tag", "text"]],
          isMultiSelect: true,
        },
      ],
      enable_embedding: true,
      embedding_params: {
        text: "enabled",
      },
    };

    cy.log("ad-hoc question");
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE category IN ({{text}})",
    );
    H.rightSidebar().findByLabelText("Multiple values").click();
    setFilterAndVerify({
      values: ["Gadget", "Widget"],
      isQueryBuilder: true,
    });

    cy.log("regular question");
    H.createNativeQuestion(questionDetails, {
      visitQuestion: true,
      wrapId: true,
    });
    setFilterAndVerify({
      values: ["Gadget", "Widget"],
      isQueryBuilder: true,
    });

    cy.log("public question");
    cy.get("@questionId").then((questionId) =>
      H.visitPublicQuestion(questionId),
    );
    setFilterAndVerify({
      values: ["Gadget", "Widget"],
      isQueryBuilder: false,
    });

    cy.log("embedded question");
    cy.get("@questionId").then((questionId) =>
      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      }),
    );
    setFilterAndVerify({
      values: ["Gadget", "Widget"],
      isQueryBuilder: false,
    });
  });

  it("should allow multiple values for Number variables", () => {
    const questionDetails = {
      name: "SQL",
      native: {
        query: "SELECT ID FROM products WHERE ID IN ({{number}})",
        "template-tags": {
          number: {
            id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
            name: "number",
            "display-name": "Number",
            type: "number",
          },
        },
      },
      parameters: [
        {
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          type: "number/=",
          name: "Number",
          slug: "number",
          target: ["variable", ["template-tag", "number"]],
          isMultiSelect: true,
        },
      ],
      enable_embedding: true,
      embedding_params: {
        number: "enabled",
      },
    };

    cy.log("ad-hoc question");
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery(
      "SELECT ID FROM products WHERE ID IN ({{number}})",
    );
    SQLFilter.openTypePickerFromDefaultFilterType();
    H.popover().findByText("Number").click();
    H.rightSidebar().findByLabelText("Multiple values").click();
    setFilterAndVerify({
      values: ["10", "20"],
      isQueryBuilder: true,
    });

    cy.log("regular question");
    H.createNativeQuestion(questionDetails, {
      visitQuestion: true,
      wrapId: true,
    });
    setFilterAndVerify({
      values: ["10", "20"],
      isQueryBuilder: true,
    });

    cy.log("public question");
    cy.get("@questionId").then((questionId) =>
      H.visitPublicQuestion(questionId),
    );
    setFilterAndVerify({
      values: ["10", "20"],
      isQueryBuilder: false,
    });

    cy.log("embedded question");
    cy.get("@questionId").then((questionId) =>
      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      }),
    );
    setFilterAndVerify({
      values: ["10", "20"],
      isQueryBuilder: false,
    });
  });
});
