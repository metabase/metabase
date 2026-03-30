import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { getEventTarget } from "metabase/lib/dom";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > touch chart drill popover", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboardWithQuestions({
      dashboardName: "Touch drill test dashboard",
      questions: [
        {
          name: "Line chart for touch drill",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            limit: 5,
          },
        },
      ],
    }).then(({ dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should position popover anchor correctly for TouchEvents (iOS Safari)", () => {
    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery");

    cy.window().then((win) => {
      const expectedX = 150;
      const expectedY = 200;

      const touch = new win.Touch({
        identifier: 0,
        target: win.document.body,
        clientX: expectedX,
        clientY: expectedY,
      });

      const touchEvent = new win.TouchEvent("touchend", {
        changedTouches: [touch],
        touches: [],
      });

      const target = getEventTarget(touchEvent);

      const left = parseFloat(target.style.left);
      const top = parseFloat(target.style.top);

      expect(left, "anchor left should not be NaN").to.not.be.NaN;
      expect(top, "anchor top should not be NaN").to.not.be.NaN;
      expect(left, "anchor left should match touch clientX").to.equal(
        expectedX - 3,
      );
      expect(top, "anchor top should match touch clientY").to.equal(
        expectedY - 3,
      );
    });
  });
});
