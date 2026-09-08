import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";
import type { DataApp } from "metabase-types/api";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

describe("scenarios > data apps > viewing & routing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  describe("viewing permissions", () => {
    it("lets a non-admin open a data app by direct URL", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      // A normal (non-admin) user has data access, so the app opens and renders
      // its data — the admin gate is only on *managing* apps, not viewing them.
      cy.signInAsNormalUser();
      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByTestId("orders-count", { timeout: 30000 })
          .invoke("text")
          .should("match", /^\d+$/);
      });
    });

    it("opens the app shell for a user without data access, but shows no data", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      // The `nodata` user can open the app (viewing isn't gated), but the query
      // the app runs goes through the QP with the user's own permissions — with
      // no data access it resolves to no data (the fixture renders "—").
      cy.signIn("nodata");
      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByTestId("orders-count", { timeout: 30000 }).should(
          "have.text",
          "—",
        );
      });
    });

    it("shows unpublished app error when opening an app without a resource collection", () => {
      cy.request<DataApp>("POST", `/api/apps/${APP_NAME}/draft`)
        .its("body.resource_collection_id")
        .as("resourceCollectionId");

      cy.log("archive and delete the data app collection");
      cy.get<number>("@resourceCollectionId").then((collectionId) => {
        cy.request("PUT", `/api/collection/${collectionId}`, {
          archived: true,
        });

        cy.request("DELETE", `/api/collection/${collectionId}`);
      });

      cy.log("fetching bundle should return 409 error");
      cy.request({
        url: `/api/apps/${APP_NAME}/bundle`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 409);

      cy.intercept("GET", `/api/apps/${APP_NAME}`).as("getUnpublishedApp");
      H.openDataApp(APP_NAME);

      cy.log("fetching data app metadata should return 409 error");
      cy.wait("@getUnpublishedApp")
        .its("response.statusCode")
        .should("eq", 409);

      H.main().within(() => {
        cy.findByText("This data app isn’t published yet").should("be.visible");

        cy.findByText(
          "An administrator needs to publish this data app before it can be opened.",
        ).should("be.visible");
      });
    });

    it("shows a not-found state for a disabled or missing app", () => {
      // No app with this slug exists, so the metadata endpoint really 404s and the
      // host renders a not-found state rather than a broken iframe — no mock needed.
      H.openDataApp("does-not-exist");
      H.main().findByText("Data app not found").should("be.visible");
    });
  });

  describe("loading state", () => {
    it("keeps the loader up until the app's bundle has actually rendered", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
        bundleDelayMs: 2000,
      });

      H.openDataApp(APP_NAME);

      cy.findByTestId("data-app-loading").should("be.visible");

      cy.findByTestId("data-app-loading", { timeout: 30000 }).should(
        "not.exist",
      );
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
      });
    });
  });

  describe("internal routing", () => {
    it("mirrors internal route changes into the parent URL", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        // Navigate to a nested page using the exposed `DataAppLink`.
        cy.findByRole("link", { name: "Details" }).click();
        cy.findByRole("heading", { name: "Order details" }).should(
          "be.visible",
        );
        // The app's own router moved, too — not just the page that rendered.
        cy.findByTestId("current-pathname").should("have.text", "/details");
      });

      // The iframe's client-side navigation is mirrored to the parent's URL bar
      // (via replaceState), so the top-level path reflects the nested route.
      cy.location("pathname").should("eq", `/apps/${APP_NAME}/details`);
    });

    it("starts on the target page when deep-linked directly to a sub-route", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("details");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Order details" }).should(
          "be.visible",
        );
        cy.findByTestId("current-pathname").should("have.text", "/details");
      });
    });

    it("navigates imperatively via useDataAppLocation().navigate", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByTestId("navigate-to-details").click();
        cy.findByRole("heading", { name: "Order details" }).should(
          "be.visible",
        );
        cy.findByTestId("current-pathname").should("have.text", "/details");
      });
      cy.location("pathname").should("eq", `/apps/${APP_NAME}/details`);
    });
  });

  describe("host error / not-ready screens", () => {
    it("shows a themed host error screen when the bundle throws while rendering", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("throw");
      // The throw is caught in the iframe and reported to the parent, which
      // renders its themed failure screen in the host realm.
      H.main()
        .findByText(/couldn.t be loaded/i, { timeout: 30000 })
        .should("be.visible");
    });
  });
});
