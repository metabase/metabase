const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";
import type { GroupListQuery } from "metabase-types/api";

import { groupMappingCardHelpers } from "./shared/group-mapping-card";

const { ADMIN_GROUP, NOSQL_GROUP, READONLY_GROUP } = USER_GROUPS;

const {
  groupMappingSection,
  mappingRow,
  newMappingButton,
  groupsPicker,
  addMapping,
  deleteMapping,
} = groupMappingCardHelpers({
  sectionTestId: "jwt-group-schema",
  nameLabel: "JWT group name",
  newMappingLabel: "New mapping",
});

describe("scenarios > admin > settings > SSO > JWT", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("PUT", /\/api\/setting$/).as("updateSettings");
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
      cy.button("Create").click();
    });
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    H.goToAuthOverviewPage();

    getJwtCard().findByText("Active").should("exist");
  });

  it("should allow to disable and enable jwt, reset its settings, and regenerate its key", () => {
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

    cy.log("Deactivating resets the jwt settings");
    getJwtCard().icon("ellipsis").click();
    H.popover().findByText("Deactivate").click();
    H.modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getJwtCard().findByText("Set up").should("exist");

    cy.log("Regenerating the existing jwt key and saving the settings");
    // Kept last: after saving, the form still counts as dirty, so leaving the
    // page opens a "Discard your changes?" modal.
    enableJwtAuth();
    cy.visit("/admin/settings/authentication/jwt");

    cy.findByLabelText(/String used by the JWT signing key/i).should(
      "have.value",
      "**********00",
    );

    cy.button("Regenerate key").click();
    H.modal().within(() => {
      cy.findByText("Delete key and generate a new one?").should("exist");
      cy.findByText(
        "This will cause existing tokens to stop working until the identity provider is updated with a new key.",
      ).should("exist");
      cy.button("Delete key").click();
    });
    H.modal().within(() => {
      cy.findByText("Store your new key").should("exist");
      cy.button("Done").click();
    });
    cy.button("Save changes").click();
    cy.wait("@updateSettings");

    cy.findByTestId("admin-layout-content")
      .findByText("Success")
      .should("exist");
  });

  it("should allow the user to enable/disable user provisioning", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication/jwt");

    cy.findByRole("switch", { name: "User provisioning" })
      .should("be.checked")
      .click({ force: true });
    cy.wait("@updateSetting");

    H.undoToast().findByText("Changes saved").should("be.visible");
    cy.findByRole("switch", { name: "User provisioning" }).should(
      "not.be.checked",
    );
  });

  describe("Group mapping", () => {
    beforeEach(() => {
      enableJwtAuth();
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      cy.intercept("PUT", "/api/permissions/membership/*/clear").as(
        "clearGroup",
      );
      cy.visit("/admin/settings/authentication/jwt");
    });

    it("should delete or clear mapped groups with their mappings, keep the remaining mappings consistent, and clear all mappings when switching to automatic", () => {
      cy.log("Every mapping is saved as soon as it is added");
      selectGroupMappingMode("Manual");
      addMapping("cn=People1", ["Administrators", "data", "nosql"]);
      addMapping("cn=People2", ["Administrators", "data", "collection"]);
      addMapping("cn=People3", ["collection", "readonly"]);

      cy.log(
        "Deleting a mapping's groups removes them from the other mappings too, but never deletes Administrators",
      );
      deleteMapping(
        "cn=People2",
        /delete the groups/i,
        "Remove mapping and delete groups",
      );
      cy.wait(["@deleteGroup", "@deleteGroup"]);
      cy.wait("@updateSettings")
        .its("request.body.jwt-group-mappings")
        .should("deep.equal", {
          "cn=People1": [ADMIN_GROUP, NOSQL_GROUP],
          "cn=People3": [READONLY_GROUP],
        });
      mappingRow("cn=People1").should("contain", "Administrators, nosql");
      mappingRow("cn=People3")
        .should("contain", "readonly")
        .and("not.contain", "collection");

      cy.log("Deleted groups are no longer offered for new mappings");
      newMappingButton().click();
      groupsPicker().click();
      cy.findByRole("listbox")
        .should("contain", "readonly")
        .and("not.contain", "data")
        .and("not.contain", "collection");
      cy.button("Cancel").click();

      cy.log("The same mappings come back after a reload");
      // the row assertions retry until the reloaded page has rendered, so there is nothing to wait on
      cy.reload();
      mappingRow("cn=People1").should("contain", "Administrators, nosql");
      mappingRow("cn=People3")
        .should("contain", "readonly")
        .and("not.contain", "collection");

      cy.log(
        "Clearing the last mappings empties their groups, skips Administrators and turns group mapping off",
      );
      deleteMapping(
        "cn=People3",
        /remove all members/i,
        "Remove mapping and members",
      );
      cy.wait("@clearGroup");
      deleteMapping(
        "cn=People1",
        /remove all members/i,
        "Remove mapping and members",
      );
      cy.wait("@clearGroup");
      groupMappingSection()
        .findByRole("radio", { name: "Off" })
        .should("be.checked");

      cy.log("Deleted groups are gone and cleared groups have no members");
      cy.request<GroupListQuery[]>("GET", "/api/permissions/group").then(
        ({ body: groups }) => {
          const names = groups.map((group) => group.name);
          expect(names).to.include.members(["nosql", "readonly"]);
          expect(names).not.to.include("data");
          expect(names).not.to.include("collection");
          const memberCount = (name: string) =>
            groups.find((group) => group.name === name)?.member_count;
          expect(memberCount("nosql")).to.equal(0);
          expect(memberCount("readonly")).to.equal(0);
        },
      );

      cy.log(
        "Switching to automatic asks for confirmation and deletes the mappings",
      );
      selectGroupMappingMode("Manual");
      addMapping("cn=People4", ["readonly"]);
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

// the segmented control keeps its radio inputs hidden, so the visible label takes the click
const selectGroupMappingMode = (mode: string) => {
  // a click during a write is ignored, so wait for the control to be free first
  groupMappingSection()
    .contains("label", mode)
    .should("not.have.attr", "data-read-only");
  groupMappingSection().contains("label", mode).click();
};
