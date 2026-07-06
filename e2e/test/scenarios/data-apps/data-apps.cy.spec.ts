const { H } = cy;

describe("scenarios > data apps", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // The `data-apps` token feature registers the /data-app route + admin page.
    H.activateToken("bleeding-edge");
  });

  it("lists a data app and renders it in its sandboxed iframe with real SDK data", () => {
    // Build the fixture with the Vite API and mock the data-app API (see
    // mockDataApp) — no remote-sync/git; the browser-only render path stays real.
    H.mockDataApp("renders-interactive-question", {
      displayName: "Renders Interactive Question",
    });

    // It shows up in the admin data-apps list, enabled (name links to the app).
    cy.visit("/admin/settings/data-apps");
    cy.findByRole("link", { name: "Renders Interactive Question" }).should(
      "be.visible",
    );

    // Opening it renders the sandboxed bundle end-to-end. The app mixes custom
    // HTML with SDK data: a scalar fetched via useMetabaseQuery shown in its own
    // markup, plus a full InteractiveQuestion.
    H.openDataApp("renders-interactive-question");
    H.dataAppIframe("Renders Interactive Question").within(() => {
      // Custom HTML the app renders around the SDK components.
      cy.findByRole("heading", { name: "Orders overview" }).should(
        "be.visible",
      );

      // A scalar (total orders) queried through Metabase, rendered in our markup.
      cy.findByTestId("orders-count", { timeout: 30000 })
        .invoke("text")
        .should("match", /^\d+$/);

      // The InteractiveQuestion loaded real data (an Orders column header).
      cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
    });
  });
});
