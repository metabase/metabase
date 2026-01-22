import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("OSS", { tags: "@OSS" }, () => {
  describe("scenarios > embedding > Modular embedding (ex EAJS)", () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({
        withToken: false,
        enabledAuthMethods: ["api-key"],
      });
      H.setupSMTP();
      cy.signOut();
    });

    describe("dashboards", () => {
      it("should not render a subscription button even with `with-subscriptions=true`", () => {
        cy.get<string>("@apiKey").then((apiKey) => {
          const frame = H.loadSdkIframeEmbedTestPage({
            elements: [
              {
                component: "metabase-dashboard",
                attributes: {
                  dashboardId: ORDERS_DASHBOARD_ID,
                  withSubscriptions: true,
                },
              },
            ],
            metabaseConfig: { apiKey },
          });

          frame.within(() => {
            cy.findByRole("button", { name: "Subscriptions" }).should(
              "not.exist",
            );
          });
        });
      });
    });
  });
});

describe("EE without license", () => {
  describe("scenarios > embedding > Modular embedding (EAJS)", () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({
        withToken: "starter",
        enabledAuthMethods: ["api-key"],
      });
      H.setupSMTP();
      cy.signOut();
    });

    describe("dashboards", () => {
      it("should not render a subscription button even with `with-subscriptions=true`", () => {
        cy.get<string>("@apiKey").then((apiKey) => {
          const frame = H.loadSdkIframeEmbedTestPage({
            elements: [
              {
                component: "metabase-dashboard",
                attributes: {
                  dashboardId: ORDERS_DASHBOARD_ID,
                  withSubscriptions: true,
                },
              },
            ],
            metabaseConfig: { apiKey },
          });

          frame.within(() => {
            cy.findByRole("button", { name: "Subscriptions" }).should(
              "not.exist",
            );
          });
        });
      });
    });
  });
});

describe("EE", () => {
  describe("scenarios > embedding > Modular embedding (EAJS)", () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({ withToken: "bleeding-edge" });
      H.setupSMTP();
      cy.signOut();
    });

    describe("dashboards", () => {
      it("should render a subscription button with `with-subscriptions=true`", () => {
        const frame = H.loadSdkIframeEmbedTestPage({
          elements: [
            {
              component: "metabase-dashboard",
              attributes: {
                dashboardId: ORDERS_DASHBOARD_ID,
                withSubscriptions: true,
              },
            },
          ],
        });

        frame.within(() => {
          cy.findByRole("button", { name: "Subscriptions" })
            .should("be.visible")
            .click();
          dashboardSidebar().within(() => {
            cy.log("set up the first subscription");
            cy.findByRole("button", { name: "Done" }).click();

            cy.log("set up the second subscription");
            cy.button("Set up a new schedule").click();
            cy.findByText("Hourly").click();
          });

          H.popover().findByRole("option", { name: "Daily" }).click();
          cy.findByRole("button", { name: "Done" }).click();

          dashboardSidebar().within(() => {
            // Header
            cy.findByText("Subscriptions").should("be.visible");

            // Subscription list
            cy.findAllByText("Bobby Tables").should("have.length", 2);
            cy.findByText("Emailed hourly").should("be.visible");
            cy.findByText("Emailed daily at 8:00 AM").should("be.visible");
          });
        });
      });
    });
  });
});

function dashboardSidebar() {
  return cy.findByRole("complementary");
}

describe("scenarios > embedding > sdk iframe embed options passthrough", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ signOut: true });
  });

  it("shows a static question with drills=false", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
            drills: false,
          },
        },
      ],
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      cy.log("1. static question must not contain title and toolbar");
      cy.findByTestId("interactive-question-result-toolbar").should(
        "not.exist",
      );

      cy.log("2. clicking on the column value should not show the popover");
      cy.findAllByText("37.65").first().should("be.visible");
      cy.findAllByText("37.65").first().click();
      cy.findByText(/Filter by this value/).should("not.exist");
    });
  });

  it("shows a static question with drills=false, withTitle=true", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
            drills: false,
            withTitle: true,
          },
        },
      ],
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      cy.log("static question must contain title, but not toolbar");
      cy.findByText("Orders").should("be.visible");
      cy.findByTestId("interactive-question-result-toolbar").should(
        "not.exist",
      );
    });
  });

  it("shows a static dashboard using drills=false, withTitle=false, withDownloads=true", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            drills: false,
            withTitle: false,
            withDownloads: true,
          },
        },
      ],
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.log("1. card title should be visible");
      cy.findByText("Orders").should("be.visible");

      cy.log("2. dashboard title should not exist -- withTitle=false");
      cy.findByText("Orders in a dashboard").should("not.exist");

      cy.log("3. download button should be visible -- withDownloads=true");
      cy.get('[aria-label="Download as PDF"]').should("be.visible");

      cy.log("4. clicking on the column value should not show the popover");
      cy.findAllByText("37.65").first().should("be.visible");

      cy.findAllByText("37.65").first().click();

      cy.findByText(/Filter by this value/).should("not.exist");
    });
  });

  it("renders an interactive question with drills=true, withTitle=false, withDownloads=true", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
            drills: true,
            withDownloads: true,
            withTitle: false,
          },
        },
      ],
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      cy.log("1. card title should not exist");
      cy.findByText("Orders").should("not.exist");

      cy.log("2. download button on the toolbar should be visible");
      cy.get("[aria-label='download icon']").should("be.visible");

      cy.log("3. clicking on the column value should show the popover");
      cy.findAllByText("37.65").first().should("be.visible");
      cy.findAllByText("37.65").first().click();
      cy.findByText(/Filter by this value/).should("be.visible");

      cy.log("4. clicking on the filter should drill down");
      cy.get('[type="filter"] button').first().click();
      cy.findAllByText("29.8").first().should("be.visible");

      cy.log("5. should not show a save button");
      cy.findByText("Save").should("not.exist");
    });
  });

  it("renders an interactive dashboard with drills=true, withDownloads=true, withTitle=false", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            drills: true,
            withDownloads: true,
            withTitle: false,
          },
        },
      ],
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.log("1. dashboard title should not exist -- withTitle=false");
      cy.findByText("Orders in a dashboard").should("not.exist");

      cy.log("2. card title should be visible");
      cy.findByText("Orders").should("be.visible");

      cy.log("3. download button should be visible -- withDownloads=true");
      cy.get('[aria-label="Download as PDF"]').should("be.visible");

      cy.log("4. clicking on the column value should show the popover");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("be.visible");

      cy.log("5. clicking on the filter should drill down");
      cy.get('[type="filter"] button').first().click();
      cy.findAllByText("29.8").first().should("be.visible");

      cy.log("6. saving should be disabled in drill-throughs");
      cy.findByText("Save").should("not.exist");
    });
  });

  it("renders the exploration template with isSaveEnabled=true, targetCollection, entityTypes", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: "new",
            isSaveEnabled: true,
            targetCollection: FIRST_COLLECTION_ID,
            entityTypes: ["table"],
          },
        },
      ],
    });

    frame.within(() => {
      cy.findByText("Pick your starting data").should("be.visible");

      H.popover().within(() => {
        cy.findByText("Orders").click();
      });

      cy.findByRole("button", { name: "Visualize" }).click();

      cy.log("1. clicking on the filter should drill down");
      cy.findAllByText("37.65").first().should("be.visible").click();
      cy.findByText(/Filter by this value/).should("be.visible");
      cy.get('[type="filter"] button').first().click();
      cy.findAllByText("29.8").first().should("be.visible");
      cy.findByTestId("interactive-question-result-toolbar").should(
        "be.visible",
      );

      cy.log("2. saving should be enabled");
      cy.findByText("Save").click();

      cy.log(
        "3. we should not see the collection picker as we have a target collection",
      );
      cy.findByText("Where do you want to save this?").should("not.exist");
    });
  });
});
