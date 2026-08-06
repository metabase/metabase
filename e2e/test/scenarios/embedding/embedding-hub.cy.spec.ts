import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import { createThemeViaApi } from "./embedding-theme-editor/helpers";

const { H } = cy;

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

/**
 * The embedding hub at `/embedding` -- the tabbed section, not the older
 * onboarding checklist that `onboarding/embedding-homepage.cy.spec.ts` covers.
 * One describe per tab; each tab adds its own as it lands.
 *
 * Deliberately thin: card copy, the upsell banner and the AI card's done states
 * are unit-tested next to their components. What is here is what needs a real
 * browser or a real backend -- routing, the two step orderings, and completion
 * coming back from the checklist endpoint.
 *
 * Get started's blocks are both `@EE`, because the steps themselves are: tenants,
 * SSO and data segregation only exist on an enterprise build. The unlicensed case
 * is that same build with no token activated, which is what the locked states are
 * about.
 */

const CARD = "embedding-hub-checklist-card";

const PRO_STEP_ORDER = [
  "Connect a database",
  "Create a dashboard",
  "Get embed snippet",
  "Configure data permissions and tenants",
  "Set up SSO",
  "Embed in production with SSO",
  "Create a custom theme",
  "Configure AI",
];

// Without modular embedding every Fine-tune step is locked, so AI -- the one
// advanced step still reachable -- is promoted into the first section.
const UNLICENSED_STEP_ORDER = [
  "Connect a database",
  "Create a dashboard",
  "Get embed snippet",
  "Configure AI",
  "Configure data permissions and tenants",
  "Set up SSO",
  "Embed in production with SSO",
  "Create a custom theme",
];

function assertStepOrder(titles: string[]) {
  cy.findAllByTestId(CARD)
    .should("have.length", titles.length)
    .each(($card, index) => {
      cy.wrap($card).should("contain.text", titles[index]);
    });
}

describe("scenarios > embedding > embedding hub > get started", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("redirects from the hub root and lists the licensed step order", () => {
      cy.visit("/embedding");

      cy.log("the hub root is the Get started tab");
      cy.location("pathname").should("eq", "/embedding/get-started");

      cy.findByRole("link", { name: "Get started" }).should(
        "have.attr",
        "aria-current",
        "page",
      );

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByRole("heading", {
          name: "Get started with Metabase Embedding",
        }).should("be.visible");

        assertStepOrder(PRO_STEP_ORDER);
      });
    });

    it("returns to Get started from the permissions wizard", () => {
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main")
        .findByRole("link", { name: "Configure data permissions and tenants" })
        .click();

      cy.location("pathname").should(
        "eq",
        "/embedding/get-started/permissions-setup",
      );

      cy.log(
        "the wizard's back link is relative, so it lands on the host that mounted it rather than admin",
      );
      cy.findByRole("link", { name: /Back to the setup guide/ }).click();

      cy.location("pathname").should("eq", "/embedding/get-started");
    });

    it("finishes the permissions wizard and lands back on Get started", () => {
      cy.log("seed every step the wizard checks, so Summary is the one left");
      H.updateSetting("use-tenants", true);
      cy.request("POST", "/api/collection", {
        name: "Shared collection",
        namespace: "shared-tenant-collection",
      }).then(({ body: sharedCollection }) => {
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: sharedCollection.id,
        });
      });

      cy.request("POST", "/api/ee/tenant", {
        name: "Test Tenant",
        slug: "test-tenant",
      });

      cy.request("POST", "/api/permissions/group", { name: "Test Group" }).then(
        ({ body: group }) => {
          cy.sandboxTable({ table_id: STATIC_ORDERS_ID, group_id: group.id });
        },
      );

      cy.visit("/embedding/get-started/permissions-setup");

      cy.log("the Summary step closes the wizard out");
      cy.findByRole("button", { name: "Done" }).click();

      cy.location("pathname").should("eq", "/embedding/get-started");
      cy.findByTestId("embedding-hub-main").should("be.visible");
    });

    it("finishes the SSO wizard and lands back on Get started", () => {
      cy.log("JWT configured is what unlocks the two steps after it");
      enableJwtAuth();

      cy.visit("/embedding/get-started/sso-setup");

      cy.findByRole("button", { name: "Next" }).click();

      cy.log("confirming the manual login test is what closes the wizard out");
      // A link, not a button: it is a `Button component={Link}`, so the step's
      // own navigation is what returns to the hub.
      cy.findByRole("link", { name: "Log in works, I'm done" }).click();

      cy.location("pathname").should("eq", "/embedding/get-started");
      cy.findByTestId("embedding-hub-main").should("be.visible");
    });
  });

  describe("unlicensed", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("promotes AI into the first section and locks the Fine-tune steps", () => {
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main").within(() => {
        assertStepOrder(UNLICENSED_STEP_ORDER);

        cy.log(
          "the upsell banner is what stands in for the Fine-tune subtitle",
        );
        cy.findByText(
          "Upgrade to Metabase Pro to configure advanced options.",
        ).should("be.visible");

        cy.log("a feature-locked step is inert, with no link to follow");
        cy.findByRole("link", { name: "Set up SSO" }).should("not.exist");
        cy.findByText("Set up SSO")
          .closest(`[data-testid=${CARD}]`)
          .should("have.attr", "aria-disabled", "true");

        cy.log("AI is never locked -- the admin AI page needs no token");
        cy.findByRole("button", { name: "Configure AI" }).should("be.visible");
      });
    });

    it("marks the embed step complete once a guest embed is published", () => {
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Get embed snippet")
          .closest(`[data-testid=${CARD}]`)
          .findByLabelText("Step 3 complete")
          .should("not.exist");
      });

      cy.log("publish a dashboard as a guest embed");
      H.createDashboard({ name: "Published dashboard" }).then(
        ({ body: dashboard }) => {
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            enable_embedding: true,
          });
        },
      );

      cy.log(
        "the checklist is served without a licence, so completion is real rather than all-false",
      );
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Get embed snippet")
          .closest(`[data-testid=${CARD}]`)
          .findByLabelText("Step 3 complete")
          .should("exist");
      });
    });
  });
});

describe("scenarios > embedding > embedding hub > security", () => {
  describe("pro", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      // The snapshot turns embedding on, but this test is about turning it on
      // from the hub, so start from off the way a fresh instance would be.
      H.updateSetting("enable-embedding-modular", false);
    });

    it("turns embedding on with one switch", () => {
      cy.intercept("GET", "/api/setting").as("getSettings");
      cy.intercept("GET", "/api/session/properties").as("getSessionProperties");

      cy.visit("/embedding/security");

      cy.log("The first enable goes through the terms modal");
      cy.findByTestId("embedding-hub-main")
        .findByText("Modular embedding and SDK for React")
        .should("be.visible");

      // The switch renders before either request lands, reading undefined as
      // off and as terms-already-seen, so a click before then writes the
      // settings directly instead of opening the modal.
      cy.wait(["@getSettings", "@getSessionProperties"]);
      cy.findAllByRole("switch").first().should("not.be.checked").click();
      cy.findByRole("button", { name: "Agree" }).click();

      cy.log("The merged setting is written");

      // A fresh visit rather than cy.reload(): reloading the app inside the
      // Cypress runner leaves the hub, landing on /unauthorized and then home.
      cy.visit("/embedding/security");
      cy.wait(["@getSettings", "@getSessionProperties"]);

      cy.findAllByRole("switch").first().should("be.checked");

      cy.request("GET", "/api/session/properties").then(({ body }) => {
        expect(body["enable-embedding-modular"]).to.be.true;
      });
    });

    it("lists published guest embeds even after guest embeds are switched off", () => {
      cy.log("Publish a dashboard as a guest embed");
      // Publishing is itself gated on guest embeds being on, so this has to
      // come before the dashboard is marked embeddable.
      H.updateSetting("enable-embedding-modular", true);
      H.createDashboard({ name: "Published dashboard" }).then(
        ({ body: dashboard }) => {
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            enable_embedding: true,
          });
        },
      );

      cy.visit("/embedding/security");

      assertPublishedDashboardIsListed();

      cy.log(
        "Turning guest embeds off is exactly when an admin needs to audit what is already out there",
      );
      H.updateSetting("enable-embedding-modular", false);
      cy.visit("/embedding/security");

      assertPublishedDashboardIsListed();
    });
  });
});

describe("scenarios > embedding > embedding hub > authentication", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("saves JWT settings from the hub's copy of the admin form", () => {
      cy.intercept("PUT", "/api/setting").as("updateSettings");

      cy.visit("/embedding/authentication");

      cy.log("the hub supplies the heading, so the form does not add its own");
      cy.findByRole("heading", { name: "Authentication" }).should("be.visible");
      cy.findByRole("heading", { name: "JWT" }).should("not.exist");

      cy.findByLabelText("JWT Identity Provider URI *")
        .type("https://jwt.example.com/auth")
        .blur();

      cy.log("the shared secret is generated through the key modal");
      cy.button("Set up key").click();
      H.modal().within(() => {
        cy.button("Done").click();
      });

      cy.button("Save and enable").click();
      cy.wait("@updateSettings");

      cy.log("the settings the form writes are the real ones");
      cy.request("GET", "/api/session/properties").then(({ body }) => {
        expect(body["jwt-enabled"]).to.equal(true);
        expect(body["jwt-identity-provider-uri"]).to.equal(
          "https://jwt.example.com/auth",
        );
      });

      cy.log("and they survive a reload of the tab");
      // cy.reload() does not work here: the app comes back without the hub
      // around it, so the page renders with no "Authentication" heading and the
      // form is never reached. Visiting the path again mounts the hub properly.
      cy.visit("/embedding/authentication");
      H.main()
        .findByLabelText("JWT Identity Provider URI *")
        .should("have.value", "https://jwt.example.com/auth");
    });

    it("sends the admin to Admin settings when only SAML is configured", () => {
      configureSaml();

      cy.visit("/embedding/authentication");

      H.main().within(() => {
        cy.findByText("SAML is configured").should("be.visible");
        cy.findByLabelText("JWT Identity Provider URI *").should("not.exist");
      });
    });
  });

  describe("unlicensed", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("upsells instead of exposing the form", () => {
      cy.visit("/embedding/authentication");

      // Card copy is unit-tested next to the component; this is what needs a
      // real browser -- the upsell rendering in place of the real form.
      H.main().within(() => {
        cy.findByText("Secure your embeds with single sign-on").should(
          "be.visible",
        );

        cy.log("nothing configurable renders below the paywall");
        cy.findByLabelText("JWT Identity Provider URI *").should("not.exist");
      });
    });
  });
});

describe("scenarios > embedding > embedding hub > permissions", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("navigates every tab and level of the editor without leaving the hub", () => {
      cy.visit("/embedding/permissions");

      cy.log("The editor renders at the hub's path, not admin's");
      cy.location("pathname").should("match", /^\/embedding\/permissions/);

      walkThroughPermissionsEditor();
      assertStillInsideHub();
    });

    it("navigates every tab and level of the editor with tenants enabled", () => {
      // The tenant-only tabs (Shared collections, Tenant collections) only
      // show up once tenants are on, so this is the full tab set -- the
      // other test is the narrower one licensing alone shows.
      H.updateSetting("use-tenants", true);

      cy.visit("/embedding/permissions");

      cy.log("The editor renders at the hub's path, not admin's");
      cy.location("pathname").should("match", /^\/embedding\/permissions/);

      walkThroughPermissionsEditor();

      cy.log("Shared collections tab");
      cy.findByRole("tab", { name: "Shared collections" }).click();
      cy.findAllByRole("menuitem").first().click();
      cy.location("pathname").should("match", /^\/embedding\/permissions/);

      cy.log("Tenant collections tab");
      cy.findByRole("tab", { name: "Tenant collections" }).click();
      cy.findAllByRole("menuitem").first().click();

      assertStillInsideHub();
    });
  });
});

function walkThroughPermissionsEditor() {
  cy.log("Data tab, Groups view: lands here by default");
  cy.findAllByRole("menuitem").first().click();
  cy.findByTestId("permission-table").should("be.visible");

  cy.log("Drilling into a group's database entity stays in the hub");
  cy.findByTestId("permission-table").findByText("Sample Database").click();
  cy.location("pathname").should("match", /^\/embedding\/permissions/);

  cy.log("Data tab, Databases view");
  cy.findByRole("tab", { name: "Databases" }).click();
  cy.findAllByRole("menuitem").first().click();
  cy.findByTestId("permission-table").should("be.visible");

  cy.log("Collections tab");
  cy.findByRole("tab", { name: "Collections" }).click();
  cy.findAllByRole("menuitem").first().click();
  cy.findByTestId("permission-table").should("be.visible");

  cy.log("Application tab");
  cy.findByRole("tab", { name: "Application" }).click();
  cy.findByTestId("permission-table").should("be.visible");
}

function assertStillInsideHub() {
  cy.log("Still inside the embedding hub throughout");
  cy.location("pathname").should("match", /^\/embedding\/permissions/);
  cy.findByTestId("embedding-hub-nav").should("be.visible");
}

describe("scenarios > embedding > embedding hub > tenancy", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("offers the enable card while the multi-tenant strategy is off", () => {
      H.updateSetting("use-tenants", false);

      cy.visit("/embedding");

      cy.findByTestId("embedding-hub-nav")
        .findByRole("link", { name: "Tenancy" })
        .click();

      cy.url().should("include", "/embedding/tenancy");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Enable multi-tenant user strategy").should("be.visible");
        cy.findByRole("tab", { name: "Tenants" }).should("not.exist");
      });
    });

    it("carries the tenant surfaces once the strategy is on", () => {
      H.updateSetting("use-tenants", false);

      cy.visit("/embedding/tenancy");

      cy.log("Enable multi-tenancy from the enable card, not the API");
      cy.findByTestId("embedding-hub-main")
        .findByRole("button", { name: "Enable multi-tenancy" })
        .click();

      cy.findByRole("dialog", { name: "Pick a user strategy" }).within(() => {
        cy.findByText("Multi tenant").click();
        cy.findByRole("button", { name: "Apply" }).click();
      });

      cy.log("Applying lands on the tenants listing, now empty");
      // The empty state's copy is interpolated with anchor links, so no
      // single node's text content matches the sentence exactly -- a regex
      // matches the substring instead.
      cy.findByTestId("embedding-hub-main")
        .findByText(/Create your first tenant to start adding/)
        .should("be.visible");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByRole("tab", { name: "Tenants" }).should("be.visible");
        cy.findByRole("tab", { name: "Tenant users" }).click();
      });

      cy.log("The listing's own links stay inside the hub");
      cy.url().should("include", "/embedding/tenancy/people");
      cy.url().should("not.include", "/admin/people");
    });
  });

  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("upsells rather than hiding the tab", () => {
      cy.visit("/embedding/tenancy");

      // Card copy is unit-tested next to the component; this just confirms
      // the upsell renders in place of the real tenants surfaces.
      cy.findByTestId("embedding-hub-main")
        .findByText("Use a multi-tenant user strategy")
        .should("be.visible");
    });
  });
});

describe("scenarios > embedding > embedding hub > appearance", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("carries the theme listing and the branding settings on one tab", () => {
      cy.visit("/embedding");

      cy.findByTestId("embedding-hub-nav")
        .findByRole("link", { name: "Appearance" })
        .click();

      cy.url().should("include", "/embedding/appearance");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByRole("heading", { name: "Appearance" }).should("be.visible");
        cy.findByRole("heading", { name: "Themes" }).should("be.visible");
        cy.findByRole("heading", { name: "Branding elements" }).should(
          "be.visible",
        );
        cy.findByText("Loading message").should("be.visible");
        cy.findByText("When calculations return no results").should(
          "be.visible",
        );
        cy.findByText("When no objects can be found").should("be.visible");
      });
    });

    it("opens the theme editor inside the hub", () => {
      cy.visit("/embedding/appearance");

      cy.findByTestId("embedding-hub-main")
        .findByRole("button", { name: /New theme/ })
        .click();

      cy.url().should("include", "/embedding/appearance/theme/new");
      cy.url().should("not.include", "/admin/embedding/themes");
    });

    it("opens an existing theme inside the hub", () => {
      createThemeViaApi("Existing theme");
      cy.visit("/embedding/appearance");

      cy.findByTestId("embedding-hub-main")
        .findByText("Existing theme")
        .click();

      // The listing is the admin one, mounted with the hub's basePath: card
      // clicks have to land here rather than on the admin route.
      cy.url().should("match", /\/embedding\/appearance\/theme\/\d+/);
      cy.url().should("not.include", "/admin/embedding/themes");
    });

    it("creates a theme from the hub and shows it in the listing", () => {
      cy.visit("/embedding/appearance");

      cy.findByTestId("embedding-hub-main")
        .findByRole("button", { name: /New theme/ })
        .click();

      cy.findByLabelText("Theme name").clear().type("Hub theme");
      cy.findByRole("button", { name: /Save theme/ }).click();

      H.undoToastList().contains("Theme saved").should("be.visible");

      cy.url().should("eq", Cypress.config().baseUrl + "/embedding/appearance");
      cy.findByTestId("embedding-hub-main")
        .findByText("Hub theme")
        .should("be.visible");
    });
  });

  describe("unlicensed", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("upsells rather than hiding the tab", () => {
      cy.visit("/embedding/appearance");

      cy.findByTestId("embedding-hub-main")
        .findByText("Create custom themes")
        .should("be.visible");
    });

    it("sends a theme editor deep link back to the upsell", () => {
      // A themeId, not the bare `theme` path -- that one redirects from the
      // route table whatever the plan, so it would pass without the guard.
      cy.visit("/embedding/appearance/theme/new");

      cy.url().should("eq", Cypress.config().baseUrl + "/embedding/appearance");
      cy.findByTestId("embedding-hub-main")
        .findByText("Create custom themes")
        .should("be.visible");
    });
  });
});

describe("scenarios > embedding > embedding hub > localization", () => {
  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("upsells rather than hiding the tab", () => {
      cy.visit("/embedding/localization");

      cy.findByTestId("embedding-hub-main")
        .findByText("Translate your embedded content")
        .should("be.visible");
    });
  });
});

describe("scenarios > embedding > embedding hub > nav", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("reaches all seven tabs from the nav", () => {
      cy.visit("/embedding");

      const tabs = [
        { label: "Get started", path: "/embedding" },
        { label: "Security", path: "/embedding/security" },
        { label: "Authentication", path: "/embedding/authentication" },
        { label: "Permissions", path: "/embedding/permissions" },
        { label: "Tenancy", path: "/embedding/tenancy" },
        { label: "Appearance", path: "/embedding/appearance" },
        { label: "Localization", path: "/embedding/localization" },
      ];

      tabs.forEach(({ label, path }) => {
        cy.log(`Open the ${label} tab`);
        cy.findByTestId("embedding-hub-nav")
          .findByRole("link", { name: label })
          .click();

        cy.url().should("include", path);
      });
    });
  });

  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("shows every tab, with a gem on the paid ones", () => {
      cy.visit("/embedding");

      cy.findByTestId("embedding-hub-nav").within(() => {
        cy.log("Paid tabs carry the gem");
        ["Authentication", "Tenancy", "Appearance", "Localization"].forEach(
          (label) => {
            cy.findByRole("link", { name: label })
              .findByTestId("upsell-gem")
              .should("exist");
          },
        );

        cy.log("Permissions works on OSS, so it carries none");
        cy.findByRole("link", { name: "Permissions" })
          .findByTestId("upsell-gem")
          .should("not.exist");
      });
    });
  });
});

function configureSaml() {
  cy.readFile("test_resources/sso/auth0-public-idp.cert", "utf8").then(
    (certificate) => {
      cy.request("PUT", "/api/setting", {
        "saml-enabled": true,
        "saml-identity-provider-uri": "https://example.test",
        "saml-identity-provider-certificate": certificate,
        "saml-identity-provider-issuer": "https://example.test/issuer",
      });
    },
  );
}

function assertPublishedDashboardIsListed() {
  cy.findByTestId("embedding-hub-main").within(() => {
    // The hub clips its content and scrolls it internally, so this card sits
    // below the fold on a CI-sized viewport and Cypress reads it as hidden
    // until it is scrolled in.
    cy.findByText("Published guest embeds")
      .scrollIntoView()
      .should("be.visible");
    cy.findByText("Published dashboard").should("be.visible");
  });
}
