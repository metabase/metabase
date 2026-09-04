const { H } = cy;
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

describe("scenarios > admin > settings > SSO > JWT", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("PUT", "/api/setting").as("updateSettings");
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
  });

  it("should allow to save and enable jwt", () => {
    cy.visit("/admin/settings/authentication/jwt");

    H.typeAndBlurUsingLabel(
      /JWT Identity Provider URI/i,
      "https://example.test",
    );
    cy.button("Set up key").click();
    H.modal().within(() => {
      cy.button("Done").click();
    });
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    H.goToAuthOverviewPage();

    getJwtCard().findByText("Active").should("exist");
  });

  it("should allow to disable and enable jwt", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication");

    getJwtCard().icon("ellipsis").click();
    H.popover().findByText("Pause").click();
    cy.wait("@updateSetting");
    getJwtCard().findByText("Paused").should("exist");

    getJwtCard().icon("ellipsis").click();
    H.popover().findByText("Resume").click();
    cy.wait("@updateSetting");
    getJwtCard().findByText("Active").should("exist");
  });

  it("should allow the user to enable/disable user provisioning", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication/jwt");

    cy.findByTestId("jwt-user-provisioning-enabled?-setting")
      .findByText(/^Disabled/)
      .click();
    cy.wait("@updateSetting");

    H.undoToast().findByText("Changes saved").should("be.visible");
  });

  it("should allow to reset jwt settings", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication");

    getJwtCard().icon("ellipsis").click();
    H.popover().findByText("Deactivate").click();
    H.modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getJwtCard().findByText("Set up").should("exist");
  });

  it("should allow to regenerate the jwt key and save the settings", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication/jwt");

    cy.findByLabelText(/String used by the JWT signing key/i).should(
      "have.value",
      "**********00",
    );

    cy.button("Regenerate key").click();
    H.modal().within(() => {
      cy.findByText("Set up secret key").should("exist");
      cy.findByText(
        "This will cause existing tokens to stop working until the identity provider is updated with the new key.",
      ).should("exist");
      cy.button("Done").click();
    });
    cy.button("Save changes").click();
    cy.wait("@updateSettings");

    cy.findByTestId("admin-layout-content")
      .findByText("Success")
      .should("exist");
  });

  describe("Group mapping", () => {
    beforeEach(() => {
      enableJwtAuth();
      cy.intercept("GET", "/api/permissions/group").as("getGroups");
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      cy.intercept("PUT", "/api/permissions/membership/*/clear").as(
        "clearGroup",
      );
      cy.visit("/admin/settings/authentication/jwt");
      cy.wait("@getGroups");
    });

    it("should allow deleting mappings along with deleting, or clearing users of, mapped groups", () => {
      cy.log("Every mapping is saved as soon as it is added");
      selectGroupMappingMode("Manual");
      addMapping("cn=People1", ["Administrators", "data", "nosql"]);
      addMapping("cn=People2", ["collection", "readonly"]);

      cy.log("Delete the first mapping together with its groups");
      deleteMapping(
        "cn=People1",
        /delete the groups/i,
        "Remove mapping and delete groups",
      );
      cy.wait(["@deleteGroup", "@deleteGroup"]);

      cy.log("Deleted groups are no longer offered for new mappings");
      newMappingButton().click();
      groupsPicker().click();
      cy.findByRole("listbox")
        .should("contain", "collection")
        .and("not.contain", "data")
        .and("not.contain", "nosql");
      cy.button("Cancel").click();

      cy.log(
        "Deleting the last mapping clears its groups and turns group mapping off",
      );
      deleteMapping(
        "cn=People2",
        /remove all members/i,
        "Remove mapping and members",
      );
      cy.wait(["@clearGroup", "@clearGroup"]);
      groupMappingSection()
        .findByRole("radio", { name: "Off" })
        .should("be.checked");

      cy.log("Deleted groups are gone and cleared groups have no members");
      cy.request("GET", "/api/permissions/group").then(({ body: groups }) => {
        const names = groups.map((group) => group.name);
        expect(names).to.include.members(["collection", "readonly"]);
        expect(names).not.to.include("data");
        expect(names).not.to.include("nosql");
        const memberCount = (name) =>
          groups.find((group) => group.name === name).member_count;
        expect(memberCount("collection")).to.equal(0);
        expect(memberCount("readonly")).to.equal(0);
      });
    });

    it("should drop deleted groups from the remaining mappings and clear all mappings when switching to automatic", () => {
      selectGroupMappingMode("Manual");
      addMapping("cn=People1", ["Administrators", "data", "nosql"]);
      addMapping("cn=People2", ["data", "collection"]);
      addMapping("cn=People3", ["collection", "readonly"]);

      cy.log(
        "Deleting a mapping's groups removes them from the other mappings too",
      );
      deleteMapping(
        "cn=People2",
        /delete the groups/i,
        "Remove mapping and delete groups",
      );
      cy.wait(["@deleteGroup", "@deleteGroup"]);
      mappingRow("cn=People1").should("contain", "Administrators, nosql");
      mappingRow("cn=People3")
        .should("contain", "readonly")
        .and("not.contain", "collection");

      cy.log("The same mappings come back after a reload");
      // the row assertions retry until the reloaded page has rendered, so there is nothing to wait on
      cy.reload();
      mappingRow("cn=People1").should("contain", "Administrators, nosql");
      mappingRow("cn=People3")
        .should("contain", "readonly")
        .and("not.contain", "collection");

      cy.log(
        "Switching to automatic asks for confirmation and deletes the mappings",
      );
      selectGroupMappingMode("Automatic");
      H.modal().within(() => {
        cy.findByText("Switch to automatic group mapping?").should(
          "be.visible",
        );
        cy.button("Delete mappings and switch").click();
      });
      cy.wait("@updateSettings").its("request.body").should("deep.equal", {
        "jwt-group-sync": true,
        "jwt-group-mappings": {},
      });
      groupMappingSection()
        .findByRole("radio", { name: "Automatic" })
        .should("be.checked");

      cy.reload();
      groupMappingSection()
        .findByRole("radio", { name: "Automatic" })
        .should("be.checked");
      selectGroupMappingMode("Manual");
      groupMappingSection()
        .findByText("Add at least one mapping to use manual group mapping")
        .should("be.visible");
    });
  });
});

const getJwtCard = () => {
  return cy
    .findByTestId("admin-layout-content")
    .findByText("JWT")
    .parent()
    .parent();
};

const groupMappingSection = () => cy.findByTestId("jwt-group-schema");

const mappingRow = (name) =>
  cy.contains('[data-testid="jwt-group-mapping-row"]', name);

const newMappingButton = () => cy.button("New mapping");

const groupsPicker = () => cy.findByLabelText("Metabase groups");

// the segmented control keeps its radio inputs hidden, so the visible label takes the click
const selectGroupMappingMode = (mode) => {
  groupMappingSection().findByText(mode).click();
};

// adding a mapping saves it right away, so wait for that write before moving on
const addMapping = (name, groups) => {
  newMappingButton().click();
  cy.findByLabelText("JWT group name").type(name);
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
    cy.findByText(consequenceLabel).click();
    cy.button(confirmLabel).click();
  });
  cy.wait("@updateSettings");
  mappingRow(name).should("not.exist");
};
