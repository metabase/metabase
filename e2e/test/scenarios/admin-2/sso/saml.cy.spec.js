const { H } = cy;

import { getSamlCertificate, setupSaml } from "./shared/helpers";

describe("scenarios > admin > settings > SSO > SAML", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("PUT", /\/api\/setting$/).as("updateSettings");
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
    cy.intercept("PUT", "/api/saml/settings").as("updateSamlSettings");
  });

  it("should allow to save and enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSamlSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSamlSettings");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Success").should("exist");

    H.goToAuthOverviewPage();
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to update saml settings", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication/saml");

    H.typeAndBlurUsingLabel(
      /SAML Identity Provider URL/i,
      "https://other.test",
    );
    cy.button("Save changes").click();
    cy.wait("@updateSamlSettings");
    cy.findByTestId("admin-layout-content")
      .findByText("Success")
      .should("exist");

    H.goToAuthOverviewPage();
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to disable and enable saml", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication");

    getSamlCard().icon("ellipsis").click();
    H.popover().findByText("Pause").click();
    cy.wait("@updateSetting");
    getSamlCard().findByText("Paused").should("exist");

    getSamlCard().icon("ellipsis").click();
    H.popover().findByText("Resume").click();
    cy.wait("@updateSetting");
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to reset saml settings", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication");

    getSamlCard().icon("ellipsis").click();
    H.popover().findByText("Deactivate").click();
    H.modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getSamlCard().findByText("Set up").should("exist");
  });

  it("should allow the user to enable/disable user provisioning", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication/saml");

    cy.findByRole("switch", { name: "User provisioning" }).should("be.checked");
    cy.contains("label", "User provisioning").click();
    cy.wait("@updateSetting");
    H.undoToast().findByText("Changes saved").should("exist");
    cy.findByRole("switch", { name: "User provisioning" }).should(
      "not.be.checked",
    );
  });

  describe("Group mapping", () => {
    beforeEach(() => {
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      setupSaml();
      cy.visit("/admin/settings/authentication/saml");
    });

    it("should save the switch and the mappings on their own and the group attribute with the form", () => {
      turnGroupMappingOn();
      addMapping("engineering", ["data", "nosql"]);
      addMapping("ops", ["nosql", "readonly"]);

      cy.log(
        "The group attribute saves with the page form, the switch stays out of it",
      );
      cy.findByLabelText("Group attribute name").type("memberOf");
      cy.button("Save changes").click();
      cy.wait("@updateSamlSettings")
        .its("request.body")
        .should((body) => {
          expect(body["saml-attribute-group"]).to.equal("memberOf");
          expect(body).not.to.have.property("saml-group-sync");
        });

      cy.log(
        "Deleting a mapping's groups removes them from the other mappings too",
      );
      deleteMapping(
        "engineering",
        /delete the groups/i,
        "Remove mapping and delete groups",
      );
      cy.wait(["@deleteGroup", "@deleteGroup"]);
      mappingRow("ops")
        .should("contain", "readonly")
        .and("not.contain", "nosql");

      cy.log("Everything comes back after a reload");
      cy.reload();
      groupMappingSwitch().should("be.checked");
      mappingRow("ops").should("contain", "readonly");
      cy.findByLabelText("Group attribute name").should(
        "have.value",
        "memberOf",
      );

      cy.log("Turning group mapping off hides the mappings and sticks");
      clickGroupMappingSwitch();
      cy.wait("@updateSetting")
        .its("request.body")
        .should("deep.equal", { value: false });
      groupMappingSection()
        .findByText("Manual group mappings")
        .should("not.exist");
      cy.reload();
      groupMappingSwitch().should("not.be.checked");
    });
  });
});

const getSamlCard = () => {
  return cy
    .findByTestId("admin-layout-content")
    .findByText("SAML")
    .parent()
    .parent();
};

const groupMappingSection = () => cy.findByTestId("saml-group-mapping-section");

const groupMappingSwitch = () =>
  cy.findByRole("switch", { name: "Group mapping" });

const mappingRow = (name) =>
  cy.contains('[data-testid="group-mapping-row"]', name);

const newMappingButton = () =>
  groupMappingSection().findByRole("button", { name: "New" });

const groupsPicker = () => cy.findByLabelText("Metabase groups");

// Mantine hides the switch input, so the click goes to the title label wired to it
const clickGroupMappingSwitch = () =>
  groupMappingSection().contains("label", "Group mapping").click();

const turnGroupMappingOn = () => {
  groupMappingSwitch().should("not.be.checked");
  clickGroupMappingSwitch();
  cy.wait("@updateSetting")
    .its("request.body")
    .should("deep.equal", { value: true });
};

const addMapping = (name, groups) => {
  newMappingButton().click();
  cy.findByLabelText("SAML group name").type(name);
  groupsPicker().click();
  groups.forEach((group) => {
    cy.findByRole("option", { name: group }).click();
  });
  cy.button("Add mapping").click();
  cy.wait("@updateSettings");
  mappingRow(name).should("contain", groups.join(", "));
};

const deleteMapping = (name, consequenceLabel, confirmLabel) => {
  mappingRow(name).findByLabelText("Delete mapping").click();
  H.modal().within(() => {
    cy.findByText("Remove this group mapping?").should("be.visible");
    cy.findByRole("radio", { name: consequenceLabel }).click();
    cy.button(confirmLabel).click();
  });
  cy.wait("@updateSettings");
  mappingRow(name).should("not.exist");
};

const enterSamlSettings = () => {
  getSamlCertificate().then((certificate) => {
    H.typeAndBlurUsingLabel(
      /SAML Identity Provider URL/i,
      "https://example.test",
    );
    H.typeAndBlurUsingLabel(
      /SAML Identity Provider Issuer/i,
      "https://example.test/issuer",
    );
    // paste this long value to not waste time typing
    cy.findByLabelText(/SAML Identity Provider Certificate/i)
      .click()
      .invoke("val", certificate);
    // do a little typing to invoke the blur event
    cy.findByLabelText(/SAML Identity Provider Certificate/i)
      .type("a{backspace}")
      .blur();
  });
};
