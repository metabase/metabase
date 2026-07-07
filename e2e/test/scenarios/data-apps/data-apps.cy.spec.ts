import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data apps", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("lists a data app and renders it in its sandboxed iframe with real SDK data", () => {
    const source = { type: "table" as const, id: ORDERS_ID };
    H.mockDataApp("renders-interactive-question", {
      displayName: "Renders Interactive Question",
      testEnv: {
        scalarQuery: {
          source,
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
        questionQuery: { source },
      },
    });

    cy.visit("/admin/settings/data-apps");
    cy.findByRole("link", { name: "Renders Interactive Question" }).should(
      "be.visible",
    );

    H.openDataApp("renders-interactive-question");
    H.dataAppIframe("Renders Interactive Question").within(() => {
      cy.findByRole("heading", { name: "Orders overview" }).should(
        "be.visible",
      );

      cy.findByTestId("orders-count", { timeout: 30000 })
        .invoke("text")
        .should("match", /^\d+$/);

      cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
    });
  });
});
