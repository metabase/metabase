import {
  modal,
  popover,
  restore,
  setupLdap,
  typeAndBlurUsingLabel,
} from "__support__/e2e/helpers";

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.intercept("PUT", "/api/setting").as("updateSettings");
      cy.intercept("PUT", "/api/setting/*").as("updateSetting");
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
    });

    it("should setup ldap (metabase#16173)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      cy.findByText("Success").should("exist");
    });

    it("should update ldap settings", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapPort("389");
      cy.button("Save changes").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByRole("link", { name: "Authentication" }).first().click();
      getLdapCard().findByText("Active").should("exist");
    });

    it("should allow to disable and enable ldap", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      popover().findByText("Pause").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Paused").should("exist");

      getLdapCard().icon("ellipsis").click();
      popover().findByText("Resume").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Active").should("exist");
    });

    it("should allow to reset ldap settings", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      popover().findByText("Deactivate").click();
      modal().button("Deactivate").click();
      cy.wait("@updateSettings");

      getLdapCard().findByText("Set up").should("exist");
    });

    it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      enterLdapPort("0");
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByText("Wrong host or port").should("exist");
      cy.findByDisplayValue("localhost").should("exist");
    });

    it("shouldn't be possible to save a non-numeric port (#13313)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      enterLdapPort("asd");
      cy.findByText("That's not a valid port number").should("exist");

      enterLdapPort("21.3");
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");
      cy.findByText('For input string: "21.3"').should("exist");

      enterLdapPort("123 ");
      cy.button("Save failed").click();
      cy.wait("@updateLdapSettings");
      cy.findByText('For input string: "123 "').should("exist");
    });

    it("should show the login form when ldap is enabled but password login isn't (metabase#25661)", () => {
      setupLdap();
      cy.request("PUT", "/api/setting/enable-password-login", { value: false });
      cy.signOut();
      cy.visit("/auth/login");

      cy.findByText("Username or email address").should("be.visible");
      cy.findByText("Password").should("be.visible");
    });

    describe("Group Mappings Widget", () => {
      beforeEach(() => {
        cy.intercept("GET", "/api/setting").as("getSettings");
        cy.intercept("GET", "/api/session/properties").as(
          "getSessionProperties",
        );
      });

      it("should allow deleting mappings along with deleting, or clearing users of, mapped groups", () => {
        cy.visit("/admin/settings/authentication/ldap");

        cy.wait("@getSettings");
        cy.wait("@getSessionProperties");

        // Create mapping, then delete it along with its groups
        createMapping("cn=People1");
        addGroupsToMapping("cn=People1", ["Administrators", "data", "nosql"]);
        deleteMappingWithGroups("cn=People1");

        // Create mapping, then clear its groups of members
        createMapping("cn=People2");
        addGroupsToMapping("cn=People2", ["collection", "readonly"]);
        // Groups deleted along with first mapping should not be offered
        cy.findByText("data").should("not.exist");
        cy.findByText("nosql").should("not.exist");

        cy.icon("close").click({ force: true });
        cy.findByText(/remove all group members/i).click();
        cy.button("Remove mapping and members").click();

        cy.visit("/admin/people/groups");
        cy.findByText("data").should("not.exist");
        cy.findByText("nosql").should("not.exist");

        checkThatGroupHasNoMembers("collection");
        checkThatGroupHasNoMembers("readonly");
      });

      it("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", () => {
        cy.visit("/admin/settings/authentication/ldap");

        createMapping("cn=People1");
        addGroupsToMapping("cn=People1", ["Administrators", "data", "nosql"]);

        createMapping("cn=People2");
        addGroupsToMapping("cn=People2", ["data", "collection"]);

        createMapping("cn=People3");
        addGroupsToMapping("cn=People3", ["collection", "readonly"]);

        deleteMappingWithGroups("cn=People2");

        // cn=People1 will have Admin and nosql as groups
        cy.findByText("1 other group");

        // cn=People3 will have readonly as group
        cy.findByText("readonly");

        // Ensure mappings are as expected after a page reload
        cy.visit("/admin/settings/authentication/ldap");
        cy.findByText("1 other group");
        cy.findByText("readonly");
      });
    });
  },
);

const getLdapCard = () => {
  return cy.findByText("LDAP").parent().parent();
};

const enterLdapPort = value => {
  typeAndBlurUsingLabel("LDAP Port", value);
};

const enterLdapSettings = () => {
  typeAndBlurUsingLabel("LDAP Host", "localhost");
  typeAndBlurUsingLabel("LDAP Port", "389");
  typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
  typeAndBlurUsingLabel("Password", "admin");
  typeAndBlurUsingLabel("User search base", "dc=example,dc=org");
};

const createMapping = name => {
  cy.button("New mapping").click();
  cy.findByPlaceholderText("cn=People,ou=Groups,dc=metabase,dc=com").type(name);
  cy.button("Add").click();
};

const addGroupsToMapping = (mappingName, groups) => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.findByText("Default").click();
    });

  groups.forEach(group => cy.findByText(group).click());
};

const deleteMappingWithGroups = mappingName => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.icon("close").click({ force: true });
    });

  cy.findByText(/delete the groups/i).click();
  cy.button("Remove mapping and delete groups").click();
};

const checkThatGroupHasNoMembers = name => {
  cy.findByText(name)
    .closest("tr")
    .within(() => cy.findByText("0"));
};
