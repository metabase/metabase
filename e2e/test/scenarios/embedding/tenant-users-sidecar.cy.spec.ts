const { H } = cy;

const JWT_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

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
    H.activateToken("bleeding-edge");

    cy.request("PUT", "/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret": JWT_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    cy.request("POST", "/api/ee/tenant", GIZMO_TENANT);
  });

  it("should show the embedding data picker when logged in as a tenant user (metabase#EMB-1144)", () => {
    cy.log("log in as tenant user");
    cy.task<string>("signJwt", {
      payload: GIZMO_USER,
      secret: JWT_SECRET,
    }).then((key) =>
      cy.visit(`/auth/sso?return_to=/question/notebook&jwt=${key}`),
    );

    cy.log("embedding data picker is shown");
    cy.findByTestId("embedding-simple-data-picker-trigger").should(
      "be.visible",
    );
    H.popover().contains("Orders").should("be.visible");
    H.popover().contains("People").should("be.visible");
  });
});
