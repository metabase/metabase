import { navigateToEmbedOptionsStep } from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";

const SAVED_THEME_NAME = "Sunset";

const seedSavedTheme = () =>
  cy.request("POST", "/api/embed-theme", {
    name: SAVED_THEME_NAME,
    settings: {
      colors: {
        brand: "#FF0000",
        // Distinct chart colors are what makes the preview container remount
        // once the saved theme resolves — see the regression test below.
        charts: [
          "#FF0000",
          "#FF7F00",
          "#FFD400",
          "#00A86B",
          "#0080FF",
          "#3F00FF",
          "#8B00FF",
          "#FF00AA",
        ],
      },
    },
  });

const assertPreviewFinishesLoading = () => {
  cy.get("[data-iframe-loaded]", { timeout: 20_000 }).should("have.length", 1);
  cy.findByTestId("preview-loading-indicator").should("not.exist");
};

const reopenNewEmbedModal = () => {
  cy.findAllByTestId(/(sdk-setting-card|guest-embeds-setting-card)/)
    .first()
    .within(() => {
      cy.findByText("New embed").click();
    });
};

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
      "persistSettings",
    );
  });

  it("persists brand colors", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("0. select custom colors");
    cy.findByTestId("theme-card-Custom").click();

    cy.log("1. change brand color to red");
    cy.findByTestId("brand-color-picker").findByRole("button").click();

    H.popover().within(() => {
      cy.findByDisplayValue("#509EE2")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)")
        .blur();
    });

    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    // Wait for debounce
    cy.wait(800);

    cy.log("2. reload the page");
    cy.wait("@persistSettings");

    cy.log("3. brand color should be persisted");
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });

  it("finishes loading the preview when a persisted saved theme is restored on reopen", () => {
    seedSavedTheme();

    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("select a saved theme (anything other than the instance theme)");
    cy.findByTestId(`theme-card-${SAVED_THEME_NAME}`).click();

    cy.wait("@persistSettings");

    cy.log("the preview loads with the selected theme applied");
    assertPreviewFinishesLoading();

    cy.log("close the New embed modal");
    cy.findByTestId("sdk-iframe-embed-setup-modal-content")
      .findByLabelText("Close")
      .click();
    cy.findByTestId("sdk-iframe-embed-setup-modal-content").should("not.exist");

    cy.log("reopen the New embed modal");
    reopenNewEmbedModal();

    cy.log(
      "the preview must finish loading — the restored saved theme must not leave it stuck on the loader",
    );
    assertPreviewFinishesLoading();
  });
});
