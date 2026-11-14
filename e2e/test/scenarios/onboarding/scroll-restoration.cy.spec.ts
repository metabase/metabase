const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_CARD_COUNT = 6;
const DASHBOARD_CARD_HEIGHT = 6;

const DASHBOARD_QUESTIONS: StructuredQuestionDetails[] = Array.from(
  { length: DASHBOARD_CARD_COUNT },
  (_, index) => ({
    name: `Orders count ${index + 1}`,
    query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    display: "scalar",
  }),
);

// Full-width cards stacked on top of each other, so the dashboard is several
// screens tall.
const DASHBOARD_CARDS = Array.from(
  { length: DASHBOARD_CARD_COUNT },
  (_, index) => ({
    row: index * DASHBOARD_CARD_HEIGHT,
    col: 0,
    size_x: 24,
    size_y: DASHBOARD_CARD_HEIGHT,
  }),
);

const adminContent = () => cy.findByTestId("admin-layout-content");
const adminSidebar = () => cy.findByTestId("admin-layout-sidebar");

function shouldBeScrolledTo(scrollTop: number) {
  return ($element: JQuery<HTMLElement>) => {
    // Offsets can be fractional on a zoomed page.
    expect($element[0].scrollTop).to.be.closeTo(scrollTop, 1);
  };
}

describe("scenarios > navigation > scroll restoration", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("restores a dashboard's scroll position on back (metabase#79049)", () => {
    H.createDashboardWithQuestions({
      dashboardName: "Tall dashboard",
      questions: DASHBOARD_QUESTIONS,
      cards: DASHBOARD_CARDS,
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.main().scrollTo(0, 500);
      H.main().should(shouldBeScrolledTo(500));

      cy.log("Leave the dashboard, then come back to the same position");
      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should("eq", "/");
      cy.go("back");
      cy.location("pathname").should(
        "match",
        new RegExp(`^/dashboard/${dashboard.id}\\b`),
      );
      H.main().should(shouldBeScrolledTo(500));
    });
  });

  it("starts each admin settings page at the top, and restores positions on back and forward (metabase#71369)", () => {
    cy.visit("/admin/settings/general");
    // The page's headings render before its settings load, and the page is too
    // short to scroll until they do. This setting sits below the fold.
    adminContent().findByText("Enable X-Ray features").should("exist");
    adminContent().scrollTo(0, 300);
    adminContent().should(shouldBeScrolledTo(300));

    cy.log("A new settings page starts at the top");
    adminSidebar()
      .findByRole("link", { name: /Localization/ })
      .click();
    adminContent()
      .findByRole("heading", { name: /Localization/ })
      .should("be.visible");
    adminContent().should(shouldBeScrolledTo(0));
    adminContent().scrollTo(0, 150);
    adminContent().should(shouldBeScrolledTo(150));

    cy.log("Back and forward return to each page's position");
    cy.go("back");
    cy.location("pathname").should("eq", "/admin/settings/general");
    adminContent().should(shouldBeScrolledTo(300));
    cy.go("forward");
    cy.location("pathname").should("eq", "/admin/settings/localization");
    adminContent().should(shouldBeScrolledTo(150));
  });
});
