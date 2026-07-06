const { H } = cy;

describe("scenarios > data apps", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // All features so both `remote-sync` and `data-apps` are available.
    H.activateToken("bleeding-edge");
    H.setupGitSync();
  });

  it("syncs a data app from the connected repo and renders it in its sandboxed iframe", () => {
    // Build the fixture (its src/ + the create-data-app template) with the Vite
    // API and commit it into the repo as data_apps/<slug>/.
    H.seedDataApp("renders-interactive-question", {
      name: "Renders Interactive Question",
    });

    // Pull the repo through remote sync; the import materializes the data app.
    H.configureGitAndPullChanges("read-write");

    // It shows up in the admin data-apps list, enabled by default (an enabled
    // app renders its name as a link to the served URL).
    cy.visit("/admin/settings/data-apps");
    cy.findByRole("link", { name: "Renders Interactive Question" }).should(
      "be.visible",
    );

    // Opening it renders the sandboxed bundle end-to-end (fetch -> Near-Membrane
    // sandbox -> host DataAppProvider -> render). The app mixes custom HTML with
    // SDK data: a scalar fetched via useMetabaseQuery shown in its own markup,
    // plus a full InteractiveQuestion.
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
