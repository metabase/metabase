const { H } = cy;
import Color from "color";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > scalar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow open-ended conditional color ranges", () => {
    H.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
    }).then(({ body: { id } }) => {
      cy.visit(`/question/${id}`);
      cy.findByTestId("query-visualization-root", { timeout: 20000 })
        .findByTestId("scalar-value")
        .should("be.visible");
    });

    H.openVizSettingsSidebar();
    H.sidebar().findByText("Conditional colors").click();

    cy.findByRole("button", { name: /add a range/i }).click();

    cy.findAllByPlaceholderText("Min").eq(0).clear().blur();
    cy.findAllByPlaceholderText("Max").eq(0).clear().type("1000").blur();

    cy.findByRole("button", { name: /add a range/i }).click();

    cy.findAllByPlaceholderText("Min").eq(1).clear().type("1000").blur();
    cy.findAllByPlaceholderText("Max").eq(1).clear().blur();

    cy.findAllByTestId("color-selector-button").eq(1).click();
    H.popover()
      .findAllByRole("button")
      .eq(4)
      .then(($button) => {
        const color = $button.attr("aria-label");
        cy.wrap($button).click();
        cy.findByTestId("scalar-value").should(
          "have.css",
          "color",
          Color(color).rgb().string(),
        );
      });

    cy.findByTestId("scalar-value").realHover();
    H.tooltip().should("contain.text", "≤ 1000").and("contain.text", "≥ 1000");
  });
});
