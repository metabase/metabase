const { H } = cy;

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      cy.intercept("PUT", /\/api\/setting$/).as("updateSettings");
      cy.intercept("PUT", "/api/setting/*").as("updateSetting");
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("should setup ldap (metabase#16173)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Success").should("exist");
    });

    it("should update ldap settings", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapPort("389");
      cy.button("Save changes").click();
      cy.wait("@updateLdapSettings");

      H.goToAuthOverviewPage();

      getLdapCard().findByText("Active").should("exist");
    });

    it("should allow to disable and enable ldap", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      H.popover().findByText("Pause").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Paused").should("exist");

      getLdapCard().icon("ellipsis").click();
      H.popover().findByText("Resume").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Active").should("exist");
    });

    it("should not show the user provision UI to OSS users", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      cy.findByTestId("admin-layout-content")
        .findByText(/User Provisioning/i)
        .should("not.exist");
    });

    it("should allow to reset ldap settings", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      H.popover().findByText("Deactivate").click();
      H.modal().button("Deactivate").click();
      cy.wait("@updateSettings");

      getLdapCard().findByText("Set up").should("exist");
    });

    it("should not reset previously populated fields when schema validation fails for just one of them", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      enterLdapPort("0");
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByText("nullable integer greater than 0").should("exist");
      cy.findByDisplayValue("localhost").should("exist");
    });

    it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      enterLdapPort("1");
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByText("Wrong host or port").should("exist");
      cy.findByDisplayValue("localhost").should("exist");
    });

    it("shouldn't be possible to save a non-integer port (#13313)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      cy.findByLabelText(/LDAP Port/i)
        .parent()
        .parent()
        .as("portSection");

      enterLdapSettings();
      enterLdapPort("asd");
      cy.get("@portSection").findByDisplayValue("asd").should("not.exist");

      enterLdapPort("21.3");
      cy.get("@portSection")
        .findByText("ldap-port must be an integer")
        .should("be.visible");

      enterLdapPort("389 ");
      cy.get("@portSection")
        .findByText("That's not a valid port number")
        .should("not.exist");

      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Success").should("exist");
    });

    it("should allow user login on OSS when LDAP is enabled", () => {
      H.setupLdap();
      cy.signOut();
      cy.visit("/auth/login");
      cy.findByLabelText("Username or email address").type(
        "user01@example.org",
      );
      cy.findByLabelText("Password").type("123456");
      cy.button("Sign in").click();
      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Home").should("exist");
      });
    });

    describe("Group mapping", () => {
      beforeEach(() => {
        cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
        cy.intercept("PUT", "/api/permissions/membership/*/clear").as(
          "clearGroup",
        );
        cy.visit("/admin/settings/authentication/ldap");
      });

      it("should allow deleting mappings along with deleting, or clearing users of, mapped groups", () => {
        turnGroupMappingOn();

        cy.log("Every mapping is saved as soon as it is added");
        addMapping("cn=People1", ["Administrators", "data", "nosql"]);
        addMapping("cn=People2", ["collection", "readonly"]);

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
          "Deleting the last mapping clears its groups and keeps group mapping on",
        );
        deleteMapping(
          "cn=People2",
          /remove all members/i,
          "Remove mapping and members",
        );
        cy.wait(["@clearGroup", "@clearGroup"]);
        groupMappingSwitch().should("be.checked");
        groupMappingSection()
          .findByText("No mappings yet")
          .should("be.visible");

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

      it("should drop deleted groups from the remaining mappings and keep the mappings while group mapping is off", () => {
        turnGroupMappingOn();
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
          "Turning group mapping off hides the mappings without losing them",
        );
        groupMappingSwitch().click({ force: true });
        cy.wait("@updateSetting")
          .its("request.body")
          .should("deep.equal", { value: false });
        groupMappingSection()
          .findByText("Manual group mappings")
          .should("not.exist");

        groupMappingSwitch().click({ force: true });
        cy.wait("@updateSetting")
          .its("request.body")
          .should("deep.equal", { value: true });
        mappingRow("cn=People1").should("contain", "Administrators, nosql");
        mappingRow("cn=People3").should("contain", "readonly");
      });
    });
  },
);

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
    });

    it("should allow the user to enable/disable user provisioning", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      cy.findByRole("switch", { name: "User provisioning" })
        .should("be.checked")
        .click({ force: true });

      H.undoToast().findByText("Changes saved").should("be.visible");
      cy.findByRole("switch", { name: "User provisioning" }).should(
        "not.be.checked",
      );
    });

    it("should show the login form when ldap is enabled but password login isn't (metabase#25661)", () => {
      H.setupLdap();
      H.updateSetting("enable-password-login", false);
      cy.signOut();
      cy.visit("/auth/login");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Username or email address").should("be.visible");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("be.visible");
    });

    it("should allow user login on EE when LDAP is enabled", () => {
      H.setupLdap();
      // Only allowlisted directory attributes are synced, so name the ones this test checks.
      cy.request("PUT", "/api/setting/ldap-sync-user-attributes-allowlist", {
        value: "uid,homedirectory",
      });
      cy.signOut();
      cy.visit("/auth/login");
      cy.findByLabelText("Username or email address").type(
        "user01@example.org",
      );
      cy.findByLabelText("Password").type("123456");
      cy.button("Sign in").click();
      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Home").should("exist");
      });

      cy.signOut();
      cy.signInAsAdmin();

      // Check that attributes are synced
      cy.visit("/admin/people");
      cy.findByTestId("admin-people-list-table").within(() => {
        cy.findByText("Bar1 Bar1")
          .closest("tr")
          .within(() => {
            cy.icon("ellipsis").click();
          });
      });
      H.popover().within(() => {
        cy.findByText("Edit user").click();
      });
      cy.findByDisplayValue("uid").should("exist");
      cy.findByDisplayValue("homedirectory").should("exist");
    });
  },
);

const getLdapCard = () => {
  return cy
    .findByTestId("admin-layout-content")
    .findByText("LDAP")
    .parent()
    .parent();
};

const groupMappingSection = () => cy.findByTestId("ldap-group-mapping-section");

const groupMappingSwitch = () =>
  cy.findByRole("switch", { name: "Group mapping" });

const mappingRow = (name) =>
  cy.contains('[data-testid="group-mapping-row"]', name);

const newMappingButton = () =>
  groupMappingSection().findByRole("button", { name: "New" });

const groupsPicker = () => cy.findByLabelText("Metabase groups");

// the switch saves on its own, so wait for that write before adding mappings
const turnGroupMappingOn = () => {
  groupMappingSwitch().should("not.be.checked").click({ force: true });
  cy.wait("@updateSetting")
    .its("request.body")
    .should("deep.equal", { value: true });
};

// adding a mapping saves it right away, so wait for that write before moving on
const addMapping = (name, groups) => {
  newMappingButton().click();
  cy.findByLabelText("LDAP group name").type(name);
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

const enterLdapPort = (value) => {
  H.typeAndBlurUsingLabel(/LDAP Port/i, value);
};

const enterLdapSettings = () => {
  H.typeAndBlurUsingLabel(/LDAP Host/i, "localhost");
  H.typeAndBlurUsingLabel(/LDAP Port/i, "389");
  H.typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
  H.typeAndBlurUsingLabel("Password", "adminpass");
  H.typeAndBlurUsingLabel(/User search base/i, "ou=users,dc=example,dc=org");
};
