import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";
import type { DataApp } from "metabase-types/api";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

describe("scenarios > data apps > admin management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  it("Happy Path: lists a data app and renders it in its sandboxed iframe with real SDK data", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    cy.visit("/admin/settings/apps");
    cy.findByRole("link", { name: APP_DISPLAY_NAME })
      .scrollIntoView()
      .should("be.visible");

    cy.intercept("POST", "/api/dataset").as("dataAppQuery");

    H.openDataApp(APP_NAME);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("heading", { name: "Orders overview" }).should(
        "be.visible",
      );

      cy.findByTestId("orders-count", { timeout: 30000 })
        .invoke("text")
        .should("match", /^\d+$/);

      cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
    });

    // The iframe's query requests must be attributed to the data app, so
    // query_execution analytics record which app ran them (EMB-2088).
    cy.wait("@dataAppQuery").then(({ request }) => {
      expect(request.headers["x-metabase-client"]).to.equal("data-app");
      expect(request.headers["x-metabase-client-identifier"]).to.equal(
        APP_NAME,
      );
    });
  });

  it("keeps a data app's permission group out of the admin Groups list", () => {
    // Provisioning a data app draft creates its permission group as a side effect.
    cy.request("POST", "/api/apps/orders-app/draft").then(({ body }) => {
      const dataAppGroupId = body.permission_group_id;

      // The groups API does not return data-app groups.
      cy.request("GET", "/api/permissions/group").then(({ body: groups }) => {
        const ids = groups.map((group: { id: number }) => group.id);
        expect(ids).not.to.include(dataAppGroupId);
      });

      cy.visit("/admin/people/groups");
      cy.findByTestId("admin-panel").within(() => {
        cy.findByText("All Users").should("be.visible");
        cy.findByText("Data App: orders-app").should("not.exist");
      });
    });
  });

  it("dismisses the promo banner and keeps it hidden across a reload", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", []);
    cy.intercept(
      "PUT",
      "/api/user-key-value/namespace/user_acknowledgement/key/data-apps-admin-settings-banner",
    ).as("ackBanner");

    cy.visit("/admin/settings/apps");

    H.main()
      .findByText(/AI-generated React apps/)
      .should("be.visible");
    cy.findByRole("button", { name: "Dismiss" }).click();
    cy.wait("@ackBanner");
    H.main()
      .findByText(/AI-generated React apps/)
      .should("not.exist");

    // The dismissal persists (a real user-key-value write), so a reload keeps it hidden.
    cy.reload();
    cy.findByRole("heading", { name: "Data apps" }).should("be.visible");
    H.main()
      .findByText(/AI-generated React apps/)
      .should("not.exist");
  });

  describe("outdated apps", () => {
    // Only a bump of the supported version makes a real app outdated, so the flag
    // the API computes is patched onto a real app's responses instead.
    const OUTDATED_APP = "orders-app";

    function markAppOutdated() {
      cy.request<DataApp>("POST", `/api/apps/${OUTDATED_APP}/draft`)
        .its("body.display_name")
        .as("outdatedAppName");

      cy.intercept("GET", "/api/apps", (req) => {
        req.continue((res) => {
          res.body = res.body.map((app: DataApp) =>
            app.name === OUTDATED_APP
              ? { ...app, version: 1, outdated: true }
              : app,
          );
        });
      });
      cy.intercept(
        { method: "GET", pathname: `/api/apps/${OUTDATED_APP}` },
        (req) => {
          req.continue((res) => {
            res.body = { ...res.body, version: 1, outdated: true };
          });
        },
      );
    }

    it("badges an outdated app, refuses to open it, and still lets an admin manage its users", () => {
      markAppOutdated();

      cy.visit("/admin/settings/apps");

      cy.get<string>("@outdatedAppName").then((displayName) => {
        cy.findByTestId(`data-app-list-item-${OUTDATED_APP}`)
          .scrollIntoView()
          .within(() => {
            cy.findByText("Outdated").should("be.visible");
            cy.findByText(displayName).should("be.visible");
            cy.findByRole("link", { name: displayName }).should("not.exist");
            cy.findByRole("button", {
              name: `Actions for ${displayName}`,
            }).click();
          });
      });

      H.popover().findByText("Manage user access").click();

      cy.location("pathname").should(
        "eq",
        `/admin/settings/apps/${OUTDATED_APP}/users`,
      );
      H.main()
        .findByRole("heading", { name: "Manage access to this app" })
        .should("be.visible");

      H.openDataApp(OUTDATED_APP);
      H.main().findByText("This data app is outdated").should("be.visible");
      cy.get("iframe").should("not.exist");
    });
  });
});

// TODO(v65): data apps launch in v65 — replace the "no token" suite below with
// these upsell tests once the nav item + page are un-gated.
// describe("scenarios > data apps > upsell (OSS)", { tags: "@OSS" }, () => {
//   beforeEach(() => {
//     H.restore();
//     cy.signInAsAdmin();
//     // No token: on the OSS build the `data-apps` feature is unavailable, so the
//     // settings page shows the upsell instead of the management UI.
//   });
//
//   it("shows the data-apps upsell instead of the management UI", () => {
//     cy.visit("/admin/settings/apps");
//
//     H.main().within(() => {
//       cy.findByText("Build custom data apps").should("be.visible");
//       cy.findByText("Try for free").should("be.visible");
//     });
//   });
//
//   it("marks the Data apps settings nav item with an upsell gem", () => {
//     cy.visit("/admin/settings/apps");
//
//     cy.findByRole("link", { name: /Data apps/ }).within(() => {
//       cy.findByTestId("upsell-gem").should("exist");
//     });
//   });
// });

describe("scenarios > data apps > no token (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // No token: data apps launch in v65, so without the `data-apps` feature the
    // admin UI must not mention them at all — no nav item, no upsell, no page.
  });

  it("hides the Data apps settings nav item", () => {
    cy.visit("/admin/settings/general");

    cy.findByRole("heading", { name: "General" }).should("be.visible");
    cy.findByRole("link", { name: /Data apps/ }).should("not.exist");
  });

  it("404s the data apps settings page instead of showing an upsell", () => {
    cy.visit("/admin/settings/apps");

    H.main().within(() => {
      cy.findByText("The page you asked for couldn't be found.").should(
        "be.visible",
      );
      cy.findByText("Build custom data apps").should("not.exist");
    });
  });
});
