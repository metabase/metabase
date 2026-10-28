import type { Card, ColumnSettings } from "metabase-types/api";

const { H } = cy;

const CURRENCY_SETTINGS: ColumnSettings = {
  number_style: "currency",
  currency_style: "symbol",
  currency_in_header: false,
  decimals: 0,
};

describe("scenarios > visualizations > table > currency position", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should inherit the instance currency position and save an override for one column", () => {
    cy.intercept("PUT", "/api/setting/custom-formatting").as(
      "updateFormatting",
    );
    cy.visit("/admin/settings/localization");
    cy.findByTestId("currency_position-formatting-setting")
      .findByRole("radio", { name: "After amount" })
      .check();
    cy.wait("@updateFormatting").its("response.statusCode").should("eq", 204);

    H.createNativeQuestion(
      {
        name: "Currency position overrides",
        native: { query: 'SELECT 2 AS "Euros", 2 AS "Dollars"' },
        visualization_settings: {
          column_settings: {
            '["name","Euros"]': { ...CURRENCY_SETTINGS, currency: "EUR" },
            '["name","Dollars"]': { ...CURRENCY_SETTINGS, currency: "USD" },
          },
        },
      },
      { visitQuestion: true },
    );
    H.assertTableData({
      columns: ["Euros", "Dollars"],
      firstRows: [["2\u00a0€", "2\u00a0$"]],
    });

    openColumnFormatting("Dollars");
    cy.findByTestId("column-formatting-settings")
      .findByRole("radio", { name: "Before amount" })
      .check();
    cy.realPress("Escape");
    H.assertTableData({
      columns: ["Euros", "Dollars"],
      firstRows: [["2\u00a0€", "$2"]],
    });

    saveAndReloadQuestion();
    H.assertTableData({
      columns: ["Euros", "Dollars"],
      firstRows: [["2\u00a0€", "$2"]],
    });
  });

  it("should put currency names after the amount and preserve the position selected for symbols", () => {
    H.createNativeQuestion(
      {
        name: "Currency names and symbols",
        native: { query: 'SELECT 2 AS "Euros"' },
        visualization_settings: {
          column_settings: {
            '["name","Euros"]': {
              ...CURRENCY_SETTINGS,
              currency: "EUR",
              currency_position: "before",
            },
          },
        },
      },
      { visitQuestion: true },
    );
    H.assertTableData({ columns: ["Euros"], firstRows: [["€2"]] });

    openColumnFormatting("Euros");
    cy.findByTestId("column-formatting-settings").within(() => {
      cy.findByRole("radio", { name: "Name (euros)" }).check();
      cy.findByRole("radio", { name: "After amount" })
        .should("be.checked")
        .and("be.disabled");
      cy.findByRole("radio", { name: "Before amount" }).should("be.disabled");
      cy.findByText("Currency names always appear after the amount.").should(
        "be.visible",
      );
    });
    cy.realPress("Escape");
    H.assertTableData({ columns: ["Euros"], firstRows: [["2 euros"]] });

    saveAndReloadQuestion();
    H.assertTableData({ columns: ["Euros"], firstRows: [["2 euros"]] });
    openColumnFormatting("Euros");
    cy.findByTestId("column-formatting-settings").within(() => {
      cy.findByRole("radio", { name: "Symbol (€)" }).check();
      cy.findByRole("radio", { name: "Before amount" })
        .should("be.checked")
        .and("be.enabled");
    });
    cy.realPress("Escape");
    H.assertTableData({ columns: ["Euros"], firstRows: [["€2"]] });
  });
});

function openColumnFormatting(columnName: string) {
  H.tableHeaderClick(columnName);
  H.popover().findByTestId("click-actions-sort-control-formatting").click();
}

function saveAndReloadQuestion() {
  cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  H.saveQuestion(undefined, { shouldReplaceOriginalQuestion: true });
  cy.wait<unknown, Card>("@updateQuestion").then(({ response }) => {
    expect(response?.statusCode).to.eq(200);
    if (response) {
      H.visitQuestion(response.body.id);
    }
  });
}
