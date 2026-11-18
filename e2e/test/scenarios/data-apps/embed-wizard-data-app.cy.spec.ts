import type { EmbeddedDataApp } from "e2e/support/helpers";

import { visitNewEmbedPage } from "../embedding/sdk-iframe-embedding-setup/helpers";

const { H } = cy;

describe("scenarios > embedding > data app embed wizard", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.updateSetting("show-modular-embed-terms", false);
    H.updateSetting("show-static-embed-terms", false);

    H.createEmbeddedDataApp().as("app");
  });

  it("opens the selected app from data studio on the code step", () => {
    openDataAppEmbedWizard();

    cy.get<EmbeddedDataApp>("@app").then(({ slug }) => {
      cy.log("embed code snippet must not contain guest or session auth flags");
      H.modal()
        .findByTestId("embed-code-snippet")
        .should("contain", `<metabase-data-app path="${slug}">`)
        .and("not.contain", "useExistingUserSession")
        .and("not.contain", '"isGuest": true');
    });

    cy.log("data app preview should load");
    H.getIframeBody('iframe[title="Data app preview"]')
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    cy.log("admins cannot go back to pick another embed experience");
    H.modal().findByRole("button", { name: /Done/ }).should("be.enabled");
    H.modal().findByText("Select your embed experience").should("not.exist");
    H.modal().findByRole("button", { name: "Back" }).should("not.exist");
  });

  it("lets admins switch away from SSO-only experiences before accepting terms (DAT-16)", () => {
    H.updateSetting("enable-embedding-modular", false);
    H.updateSetting("show-modular-embed-terms", true);

    visitNewEmbedPage({ waitForResource: false });

    cy.log("data apps show their own enable embedding card");
    selectEmbedExperience("Data Apps");
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

  cy.get<EmbeddedDataApp>("@app").then(({ name }) => {
    H.main()
      .findByRole("row", { name: new RegExp(name) })
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
