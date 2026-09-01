import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";

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

  it("keeps a data app's server-managed permission group out of the admin Groups list", () => {
    // Provisioning a data app draft creates its permission group as a side effect.
    cy.request("POST", "/api/apps/hidden-app/draft").then(({ body }) => {
      expect(
        body.permission_group_id,
        "the draft provisions a permission group",
      ).to.be.a("number");
      const dataAppGroupId = body.permission_group_id;

      // The groups API — the source for the admin Groups list — omits it.
      cy.request("GET", "/api/permissions/group").then(({ body: groups }) => {
        const ids = groups.map((group: { id: number }) => group.id);
        expect(ids).not.to.include(dataAppGroupId);
      });
    });

    cy.visit("/admin/people/groups");
    cy.findByTestId("admin-panel").within(() => {
      cy.findByText("All Users").should("be.visible");
      cy.findByText("Data App: hidden-app").should("not.exist");
    });
  });

  it("surfaces a stale data-app group only on the Groups page, where it can be deleted", () => {
    const STALE_GROUP = "Data App: orphaned";

    // A stale group is a leftover no product flow can create (the app is gone but its group survives),
    // so a test-only endpoint seeds one directly: flagged, with no backing app.
    cy.request("POST", "/api/testing/stale-data-app-group", {
      name: STALE_GROUP,
    }).then(({ body: staleGroup }) => {
      // It is hidden from the shared groups endpoint every other consumer uses.
      cy.request("GET", "/api/permissions/group").then(({ body: groups }) => {
        const ids = groups.map((group: { id: number }) => group.id);
        expect(ids).not.to.include(staleGroup.id);
      });

      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      cy.visit("/admin/people/groups");

      cy.findByLabelText(`group-${staleGroup.id}-row`).within(() => {
        cy.findByText(STALE_GROUP).should("be.visible");
        cy.findByText("Stale").should("be.visible");
        // Shown as plain text, not a link to a detail page.
        cy.findByRole("link", { name: new RegExp(STALE_GROUP) }).should(
          "not.exist",
        );
        // A direct trash action rather than the "…" menu.
        cy.findByLabelText("group-action-button").should("not.exist");
        cy.findByLabelText("Remove Group").click();
      });

      H.modal().findByRole("button", { name: "Remove group" }).click();
      cy.wait("@deleteGroup");

      cy.findByLabelText(`group-${staleGroup.id}-row`).should("not.exist");
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
//       cy.findByText("Build apps on your data").should("be.visible");
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
      cy.findByText("Build apps on your data").should("not.exist");
    });
  });
});
