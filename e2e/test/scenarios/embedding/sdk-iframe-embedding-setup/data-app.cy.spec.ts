import type { EmbeddedDataApp } from "e2e/support/helpers";

const { H } = cy;

describe("scenarios > embedding > data app embed wizard", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.updateSetting("show-modular-embed-terms", false);
    H.updateSetting("show-static-embed-terms", false);

    H.createEmbeddedDataApp().as("app");
  });

  it("opens the selected app from data studio and shows the preview and embed code", () => {
    openDataAppEmbedWizard();

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

  it("lets admins switch away from SSO-only experiences before accepting terms (DAT-16)", () => {
    H.updateSetting("enable-embedding-modular", false);
    H.updateSetting("show-modular-embed-terms", true);

    openDataAppEmbedWizard();

    H.modal()
      .findByRole("button", { name: "Agree and enable" })
      .should("be.visible");

    cy.log("switch from SSO-only experience to dashboard");
    ["Data Apps", "Exploration", "Browser"].forEach((experience) => {
      selectEmbedExperience(experience);

      // dashboard supports guest embeds
      selectEmbedExperience("Dashboard");
    });

    cy.log("should be able to switch back to data apps experience");
    selectEmbedExperience("Data Apps");
    H.modal()
      .findByRole("button", { name: "Agree and enable" })
      .should("be.visible");
  });
});

function openDataAppEmbedWizard() {
  cy.visit("/data-studio/apps");

  cy.get<EmbeddedDataApp>("@app").then(({ display_name }) => {
    H.main()
      .findByRole("row", { name: new RegExp(display_name) })
      .findByRole("button", { name: "Data app options" })
      .click();
  });

  H.popover().findByRole("menuitem", { name: /Embed/ }).click();
}

function selectEmbedExperience(name: string) {
  cy.log(`select ${name}`);
  H.modal()
    .findByRole("radio", { name: new RegExp(name) })
    .click();
  H.modal()
    .findByRole("radio", { name: new RegExp(name) })
    .should("be.checked");
}
