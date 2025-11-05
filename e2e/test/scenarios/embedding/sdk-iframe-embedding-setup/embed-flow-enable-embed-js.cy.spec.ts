import { getEmbedSidebar } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > enable embed js", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("enable-embedding-simple", false);

    H.mockEmbedJsToDevServer();
  });

  it("shows the Enable to Continue button and enables embedding on click", () => {
    cy.visit("/admin/embedding");

    cy.findAllByTestId("sdk-setting-card")
      .first()
      .within(() => {
        cy.findByText("New embed").click();
      });

    cy.log("shows tooltip with fair usage info");
    getEmbedSidebar().findByLabelText("info icon").trigger("mouseover");

    H.hovercard()
      .contains(
        /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/,
      )
      .should("be.visible");

    getEmbedSidebar().findByLabelText("info icon").trigger("mouseout");

    cy.findByRole("button", { name: "Agree and enable" }).should("be.visible");

    cy.log("preview panel should show placeholder");
    cy.get('[alt="No results"]').should("be.visible");

    cy.findByRole("button", { name: "Agree and enable" }).click();

    cy.log("button should change to Enabled state");
    cy.findByRole("button", { name: /Enabled/ })
      .should("be.visible")
      .should("be.disabled");

    cy.log("Preview should load after embedding is enabled");
    H.waitForSimpleEmbedIframesToLoad();
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
    });
  });

  it("hides the enable card when embedding is already enabled", () => {
    H.updateSetting("enable-embedding-simple", true);

    cy.visit("/admin/embedding");

    cy.findAllByTestId("sdk-setting-card")
      .first()
      .within(() => {
        cy.findByText("New embed").click();
      });

    getEmbedSidebar()
      .contains("Enable Embedded Analytics JS to get started.")
      .should("not.exist");
  });
});
