const { H } = cy;

import {
  ADMIN_USER_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";

type SeedUsageAuditingResponse = {
  inserted: number;
  date: string;
};

// must match the title seeded by testing_api/api.clj
const SEEDED_CONVERSATION_TITLE = "E2E usage auditing conversation";

// The usage-stats page only waits for the audit metadata before rendering; each
// chart then fires its own adhoc /api/dataset query and mounts ECharts. With six
// charts rendering at once, the [data-testid="chart-container"] mount can blow
// past Cypress's default 4s under CI CPU contention. Give the container readiness
// assertion a generous budget rather than racing the render.
const CHART_RENDER_TIMEOUT = 12000;

const CONVERSATION_CHART_TITLES = [
  "Conversations by day",
  "Conversations by source",
  "Conversations by profile",
  "Groups with most conversations",
  "Users with most conversations",
  "IP addresses with most conversations",
];

function seedUsageAuditingData(): void {
  cy.request<SeedUsageAuditingResponse>(
    "POST",
    "/api/testing/metabot/seed-usage-auditing",
    { user_id: ADMIN_USER_ID, second_user_id: NORMAL_USER_ID },
  );
}

function visitUsageStatsPage(): void {
  cy.intercept("GET", "/api/database/13371337/metadata*").as("auditMetadata");
  cy.visit("/admin/metabot/usage-auditing");
  cy.wait("@auditMetadata");
}

function visitConversationsPage(): void {
  cy.intercept("GET", "/api/ee/metabot-analytics/conversations?*").as(
    "conversations",
  );
  cy.intercept("GET", "/api/ee/metabot-analytics/conversations/*").as(
    "conversationDetail",
  );
  cy.visit("/admin/metabot/usage-auditing/conversations?date=past7days~");
  cy.wait("@conversations").its("response.statusCode").should("eq", 200);
}

function assertChartRendered(title: string): void {
  H.main()
    .findByText(title)
    .scrollIntoView()
    .should("be.visible")
    .parent()
    .within(() => {
      cy.findByTestId(/^(chart|row-chart)-container$/, {
        timeout: CHART_RENDER_TIMEOUT,
      })
        .should("be.visible")
        .find("svg")
        .should("exist");
    });
}

describe("scenarios > metabot > usage auditing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    seedUsageAuditingData();
  });

  it("renders the usage stats charts from the audit views", () => {
    visitUsageStatsPage();

    H.main().within(() => {
      cy.findByRole("heading", { name: "Usage stats" }).should("be.visible");
      cy.findByRole("tab", { name: "Conversations" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    CONVERSATION_CHART_TITLES.forEach(assertChartRendered);
  });

  it("lists the seeded conversations and opens their details", () => {
    visitConversationsPage();

    H.main()
      .findByRole("table")
      .within(() => {
        ["Bobby Tables", "Robert Tableton", "NLQ", "10.0.0.1"].forEach(
          (label) => {
            cy.findAllByText(label)
              .filter(":visible")
              .should("have.length.greaterThan", 0);
          },
        );
      });

    cy.get("tbody")
      .contains("tr", "NLQ")
      .scrollIntoView()
      .should("be.visible")
      .realClick();
    cy.wait("@conversationDetail").its("response.statusCode").should("eq", 200);

    H.main().within(() => {
      cy.findByRole("heading", { name: SEEDED_CONVERSATION_TITLE }).should(
        "be.visible",
      );
      cy.findByText("NLQ").should("be.visible");
      cy.findByText("Total tokens").should("be.visible");
    });
  });
});
