import {
  JWT_SHARED_SECRET,
  enableJwtAuth,
} from "e2e/support/helpers/e2e-jwt-helpers";

const { H } = cy;

const APP_SLUG = "embedded-app";
const APP_NAME = "Embedded Orders";
const TENANT_GROUP_NAME = "All tenant users";

const EMPTY_STATE_TEXT =
  "Only admins can open this app. Add groups to give people in them access.";

describe("scenarios > data apps > tenant access (DAT-17)", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.createEmbeddedDataApp();

    enableJwtAuth();

    cy.request("PUT", "/api/setting", {
      "use-tenants": true,
      "jwt-user-provisioning-enabled?": true,
    });

    cy.request("POST", "/api/ee/tenant", {
      name: "Finches",
      slug: "finches",
    });

    cy.task<string>("signJwt", {
      payload: {
        email: "finch@example.com",
        first_name: "Finch",
        last_name: "Viewer",
        "@tenant": "finches",
      },
      secret: JWT_SHARED_SECRET,
    }).as("tenantToken");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("grants and revokes access for all tenant users", () => {
    cy.log("tenant users cannot open the unassigned app");
    signInToAppAsTenant();
    assertAppAccessDenied();

    cy.signInAsAdmin();
    cy.intercept("POST", "/api/ee/apps/*/groups").as("addGroups");
    cy.visit(`/data-studio/apps/${APP_SLUG}/permissions`);
    H.main().findByText(EMPTY_STATE_TEXT).should("be.visible");

    cy.log("assign the tenant group through Data Studio");
    H.main().findByRole("button", { name: "Add groups" }).click();
    H.modal().findByRole("textbox", { name: "Groups" }).click();
    cy.findByRole("option", { name: TENANT_GROUP_NAME }).click();
    H.modal().findByRole("button", { name: "Add" }).click();
    cy.wait("@addGroups");

    H.expectUnstructuredSnowplowEvent({ event: "data_app_group_added" });
    H.main()
      .findByRole("row", { name: new RegExp(TENANT_GROUP_NAME) })
      .findByRole("img", { name: "Tenant group" })
      .should("be.visible");

    cy.log("the assigned tenant user can view the app");
    signInToAppAsTenant();
    assertAppIsRendered();

    cy.log("revoke the tenant group's access");
    cy.signInAsAdmin();
    cy.intercept("DELETE", "/api/ee/apps/*/groups/*").as("removeGroup");

    cy.visit(`/data-studio/apps/${APP_SLUG}/permissions`);
    H.main()
      .findByRole("button", { name: `${TENANT_GROUP_NAME} options` })
      .click();

    H.popover()
      .findByRole("menuitem", { name: /Remove access/ })
      .click();
    H.modal().findByRole("button", { name: "Remove access" }).click();

    cy.wait("@removeGroup");
    H.expectUnstructuredSnowplowEvent({ event: "data_app_group_removed" });
    H.main().findByText(EMPTY_STATE_TEXT).should("be.visible");

    cy.log("admins can still open the app");
    H.openDataApp(APP_SLUG);
    assertAppIsRendered();

    cy.log("the tenant user can no longer open the app");
    signInToAppAsTenant();
    assertAppAccessDenied();
  });
});

const signInToAppAsTenant = () =>
  cy
    .get<string>("@tenantToken")
    .then((token) =>
      cy.visit(
        `/auth/sso?jwt=${token}&return_to=${encodeURIComponent(`/apps/${APP_SLUG}`)}`,
      ),
    );

const assertAppAccessDenied = () =>
  H.main()
    .findByText("You don’t have access to this data app")
    .should("be.visible");

const assertAppIsRendered = () =>
  H.dataAppIframe(APP_NAME)
    .findByRole("heading", { name: "Embedded orders" })
    .should("be.visible");
