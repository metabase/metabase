import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";

const { H } = cy;

const loginWithJWT = (user: TenantUser, returnTo: string = "/") => {
  cy.task<string>("signJwt", {
    payload: user,
    secret: JWT_SHARED_SECRET,
  }).then((key) =>
    cy.visit(`/auth/sso?return_to=${encodeURIComponent(returnTo)}&jwt=${key}`),
  );
};

interface TenantAttributes {
  CAPS?: string;
  color?: string;
}

interface Tenant {
  name: string;
  slug: string;
  attributes?: TenantAttributes;
}

interface TenantUser {
  first_name: string;
  last_name: string;
  email: string;
  "@tenant": string;
}

const GIZMO_TENANT: Tenant = {
  name: "Gizmos",
  slug: "gizmo",
  attributes: {
    CAPS: "✨GIZMO✨",
    color: "cerulean",
  },
};

const GIZMO_USER: TenantUser = {
  first_name: "gizmo",
  last_name: "user",
  email: "gizmo.user@email.com",
  "@tenant": GIZMO_TENANT.slug,
};

// Tests for when a tenant user is given SSO logins to
// login to the internal Metabase instances, aka sidecar.
describe("scenarios > sidecar > tenant users", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.request("PUT", "/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret": JWT_SHARED_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    cy.request("POST", "/api/ee/tenant", GIZMO_TENANT);

    H.createSharedTenantCollection("Shared tenant collection 1").then(
      ({ body }) => {
        cy.wrap(body.id).as("sharedCollection1Id");
      },
    );
    H.createSharedTenantCollection("Shared tenant collection 2").then(
      ({ body }) => {
        cy.wrap(body.id).as("sharedCollection2Id");
      },
    );
  });

  it("should show the embedding data picker when logged in as a tenant user (metabase#EMB-1144)", () => {
    cy.log("log in as tenant user");
    loginWithJWT(GIZMO_USER, "/question/notebook");

    cy.log("embedding data picker is shown");
    cy.findByTestId("embedding-simple-data-picker-trigger").should(
      "be.visible",
    );
    H.popover().contains("Orders").should("be.visible");
    H.popover().contains("People").should("be.visible");
  });

  it("tenant users should see a flatten view of collections", () => {
    loginWithJWT(GIZMO_USER);

    H.navigationSidebar().within(() => {
      cy.findByText("Collections").should("be.visible");
      cy.findByText("Shared tenant collection 1").should("be.visible");
      cy.findByText("Shared tenant collection 2").should("be.visible");
      cy.findByText("Our data").should("be.visible");

      // No "internal/external" naming or sections
      cy.findByText(/External collections/).should("not.exist");
      cy.findByText(/Internal collections/).should("not.exist");
    });
  });

  it("the tenant collection should be called 'Our data' and be read only", () => {
    /*
      The "Our data" comes from both on the FE and the BE depending on the place it's used.
      This test checks a few places to make sure everything is working as expected.
    */
    loginWithJWT(GIZMO_USER);

    H.navigationSidebar().findByText("Our data").should("be.visible").click();
    cy.url().should("include", "/collection/");

    // Check the collection name on the collection page, it should be read only
    cy.findByTestId("collection-name-heading").should("have.text", "Our data");
    cy.findByTestId("collection-name-heading").should("be.disabled");

    // Check the save modal
    H.main().findByText("New").click();
    H.popover().findByText("Question").click();
    H.popover().findByText("Orders").click();
    H.main().findByText("Save").click();

    // Check the entity picker modal
    H.modal()
      .findByLabelText(/Where do you want to save this/)
      .should("have.text", "Our data")
      .click();

    H.entityPickerModal().findByText("Our data").should("be.visible");
  });
});
