import type { EmbeddedDataApp } from "e2e/support/helpers";

const { H } = cy;

describe("scenarios > embedding > data app embed setup (DAT-16)", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.updateSetting("show-modular-embed-terms", false);
    H.updateSetting("show-static-embed-terms", false);

    // Add another data app to check that the wizard keeps the same app selected
    cy.request("POST", "/api/ee/apps", {
      name: "a-different-app",
      display_name: "A different app",
    });

    H.createEmbeddedDataApp().as("app");
  });

  it("opens the selected app from data studio and shows the preview and embed code", () => {
    cy.visit("/data-studio/apps");

    cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
      H.main()
        .findByRole("row", { name: new RegExp(display_name) })
        .findByRole("button", { name: "Data app options" })
        .click();
    });

    H.popover().findByRole("menuitem", { name: /Embed/ }).click();

    cy.log("select data app embed experience by default");
    H.modal()
      .findByRole("radio", { name: /Data Apps/ })
      .should("be.checked");

    cy.log("auto-select the data app that was chosen in data studio");
    cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
      H.modal()
        .findByRole("textbox", { name: "Data app" })
        .should("have.value", display_name);
    });

    cy.log("data app preview should load");
    H.getIframeBody('iframe[title="Data app preview"]')
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    H.modal().findByRole("button", { name: "Get code" }).click();

    cy.get<EmbeddedDataApp>("@app").then(({ name }) => {
      cy.log("embed code snippet must not contain guest or session auth flags");
      H.modal()
        .findByTestId("embed-code-snippet")
        .should("contain", `<metabase-data-app path="${name}">`)
        .and("not.contain", "useExistingUserSession")
        .and("not.contain", '"isGuest": true');
    });

    H.modal().findByRole("button", { name: "Back" }).click();

    cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
      cy.log("same app should remain selected after navigation");
      H.modal()
        .findByRole("textbox", { name: "Data app" })
        .should("have.value", display_name);
    });
  });
});
