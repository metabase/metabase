import { restore, describeEE, setTokenFeatures } from "e2e/support/helpers";

const HOSTING_FEATURE_KEY = "hosting";
const STORE_MANAGED_FEATURE_KEY = "metabase-store-managed";
const NO_UPSELL_FEATURE_HEY = "no-upsell";

// mocks data the will be returned by enterprise useLicense hook
const mockBillingTokenFeatures = features => {
  return cy.intercept("GET", "/api/premium-features/token/status", {
    "valid-thru": "2099-12-31T12:00:00",
    valid: true,
    trial: false,
    features,
    status: "something",
  });
};

describe("scenarios > admin > license and billing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describeEE("store info", () => {
    it("should show the user a link to the store for an unlincensed enterprise instance", () => {
      cy.visit("/admin/settings/license");
      cy.findByTestId("license-and-billing-content")
        .findByText("Go to the Metabase Store")
        .should("have.prop", "tagName", "A");
    });

    it("should show the user store info for an self-hosted instance managed by the store", () => {
      setTokenFeatures("all");
      mockBillingTokenFeatures([
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
      ]);

      const harborMasterConnectedAccount = {
        email: "ci-admins@metabase.com",
        first_name: "CI",
        last_name: "Admins",
        password: "test-password-123",
      };

      // create an admin user who is also connected to our test harbormaster account
      cy.request("GET", "/api/permissions/group")
        .then(({ body: groups }) => {
          const adminGroup = groups.find(g => g.name === "Administrators");
          return cy
            .createUserFromRawData(harborMasterConnectedAccount)
            .then(user => Promise.resolve([adminGroup.id, user]));
        })
        .then(([adminGroupId, user]) => {
          const data = { user_id: user.id, group_id: adminGroupId };
          return cy
            .request("POST", "/api/permissions/membership", data)
            .then(() => Promise.resolve(user));
        })
        .then(user => {
          cy.signOut(); // stop being normal admin user and be store connected admin user
          return cy.request("POST", "/api/session", {
            username: user.email,
            password: harborMasterConnectedAccount.password,
          });
        })
        .then(() => {
          // core test
          cy.visit("/admin/settings/license");
          cy.findByTestId("billing-info-key-plan").should("exist");
          cy.findByTestId("license-input").should("exist");
        });
    });

    it("should not show license input for cloud-hosted instances", () => {
      setTokenFeatures("all");
      mockBillingTokenFeatures([
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
        HOSTING_FEATURE_KEY,
      ]);
      cy.visit("/admin/settings/license");
      cy.findByTestId("license-input").should("not.exist");
    });

    it("should render an error if something fails when fetching billing info", () => {
      setTokenFeatures("all");
      mockBillingTokenFeatures([
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
      ]);
      // force an error
      cy.intercept("GET", "/api/ee/billing", req => {
        req.reply({ statusCode: 500 });
      });
      cy.visit("/admin/settings/license");
      cy.findByTestId("license-and-billing-content")
        .findByText(/An error occurred/)
        .should("exist");
    });
  });
});
