import type { EmbeddedDataApp } from "e2e/support/helpers";

const { H } = cy;

describe("scenarios > embedding > data app embed setup (DAT-16)", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.updateSetting("show-modular-embed-terms", false);
    H.updateSetting("show-static-embed-terms", false);

    // An earlier app in the picker makes losing the menu's selection observable.
    cy.request("POST", "/api/ee/apps", {
      name: "a-different-app",
      display_name: "A different app",
    });

    H.createEmbeddedDataApp().as("app");
  });

  it("opens the selected app from Data Studio, previews its query, and generates SSO code", () => {
    cy.visit("/data-studio/apps");

    cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
      H.main()
        .findByRole("row", { name: new RegExp(display_name) })
        .findByRole("button", { name: "Data app options" })
        .click();
    });

    H.popover().findByRole("menuitem", { name: /Embed/ }).click();

    H.modal()
      .findByRole("radio", { name: /Data Apps/ })
      .should("be.checked");

    cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
      H.modal()
        .findByRole("textbox", { name: "Data app" })
        .should("have.value", display_name);
    });

    H.getIframeBody('iframe[title="Data app preview"]')
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    H.modal().findByRole("button", { name: "Get code" }).click();

    cy.get<EmbeddedDataApp>("@app").then(({ name }) => {
      H.modal()
        .findByTestId("embed-code-snippet")
        .should("contain", `<metabase-data-app path="${name}">`)
        .and("not.contain", "useExistingUserSession")
        .and("not.contain", '"isGuest": true');
    });

    H.modal().findByRole("button", { name: "Back" }).click();

    cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
      H.modal()
        .findByRole("textbox", { name: "Data app" })
        .should("have.value", display_name);
    });
  });
});
