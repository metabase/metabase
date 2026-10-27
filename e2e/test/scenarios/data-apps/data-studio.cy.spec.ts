import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";
import type { DataApp } from "metabase-types/api";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

const SYNCED_APP_NAME = "good";
const SYNCED_APP_DISPLAY_NAME = "Good App";

describe("scenarios > data apps > data studio", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("lists a data app and previews it on the app's overview", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    cy.intercept("POST", "/api/dataset").as("dataAppQuery");

    cy.visit("/data-studio/apps");
    H.main().findByText(APP_DISPLAY_NAME).click();

    cy.location("pathname").should("eq", `/data-studio/apps/${APP_NAME}`);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("heading", { name: "Orders overview" }).should(
        "be.visible",
      );
      cy.findByTestId("orders-count", { timeout: 30000 })
        .invoke("text")
        .should("match", /^\d+$/);
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

  it("makes an app a draft and live again", () => {
    H.pullExampleDataApps();
    cy.intercept("PUT", `/api/ee/apps/${SYNCED_APP_NAME}`).as("updateGoodApp");

    cy.visit(`/data-studio/apps/${SYNCED_APP_NAME}`);
    cy.findByTestId("data-app-about-sidebar")
      .findByText("Live")
      .should("be.visible");

    cy.findByRole("button", { name: "Data app options" }).click();
    H.popover()
      .findByRole("menuitem", { name: /Make draft/ })
      .click();
    H.modal()
      .findByText(`Make ${SYNCED_APP_DISPLAY_NAME} a draft?`)
      .should("be.visible");
    H.modal().findByRole("button", { name: "Make draft" }).click();
    cy.wait("@updateGoodApp");
    H.expectUnstructuredSnowplowEvent({ event: "data_app_made_draft" });

    cy.findByTestId("data-app-about-sidebar")
      .findByText("Draft")
      .should("be.visible");

    cy.findByRole("button", { name: "Data app options" }).click();
    H.popover()
      .findByRole("menuitem", { name: /Make live/ })
      .click();
    H.modal().findByRole("button", { name: "Make live" }).click();
    cy.wait("@updateGoodApp");
    H.expectUnstructuredSnowplowEvent({ event: "data_app_made_live" });

    cy.findByTestId("data-app-about-sidebar")
      .findByText("Live")
      .should("be.visible");
  });

  it("lists the app's questions and opens one", () => {
    H.pullExampleDataApps();

    cy.visit(`/data-studio/apps/${SYNCED_APP_NAME}`);
    H.main().findByRole("link", { name: "Questions" }).click();
    H.main().findByText("Orders").click();

    cy.location("pathname").should(
      "match",
      new RegExp(`^/data-studio/apps/${SYNCED_APP_NAME}/questions/\\d+$`),
    );
    cy.findByTestId("data-app-question-overview")
      .findByRole("link", { name: "Questions" })
      .should(
        "have.attr",
        "href",
        `/data-studio/apps/${SYNCED_APP_NAME}/questions`,
      );
  });

  describe("outdated apps", () => {
    // Only a bump of the supported version makes a real app outdated, so the flag
    // the API computes is patched onto a real app's responses instead.
    function markAppOutdated() {
      H.pullExampleDataApps();

      cy.intercept("GET", "/api/ee/apps", (req) => {
        req.continue((res) => {
          res.body = res.body.map((app: DataApp) =>
            app.name === SYNCED_APP_NAME
              ? { ...app, version: 1, outdated: true }
              : app,
          );
        });
      });
      cy.intercept(
        { method: "GET", pathname: `/api/ee/apps/${SYNCED_APP_NAME}` },
        (req) => {
          req.continue((res) => {
            res.body = { ...res.body, version: 1, outdated: true };
          });
        },
      );
    }

    it("marks an outdated app in the list, offers no way to open it there, and refuses to open it", () => {
      markAppOutdated();

      cy.visit("/data-studio/apps");
      H.main()
        .findByRole("row", { name: new RegExp(SYNCED_APP_DISPLAY_NAME) })
        .within(() => {
          cy.findByText("Live, outdated").should("be.visible");
          cy.findByRole("button", { name: "Data app options" }).click();
        });
      H.popover().within(() => {
        cy.findByRole("menuitem", { name: /Make draft/ }).should("be.visible");
        cy.findByRole("menuitem", { name: /Open app/ }).should("not.exist");
      });

      H.openDataApp(SYNCED_APP_NAME);
      H.main().findByText("This data app is outdated").should("be.visible");
      cy.get("iframe").should("not.exist");
    });
  });
});
