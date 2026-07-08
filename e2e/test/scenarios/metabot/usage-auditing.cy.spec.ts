const { H } = cy;

import {
  ADMINISTRATORS_GROUP_ID,
  ADMIN_USER_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";

type UsageStatsMetric = "conversations" | "messages" | "tokens";
type SeedUsageAuditingResponse = {
  inserted: number;
  date: string;
};
type SeedUsageAuditingRequest = {
  user_id: number;
  second_user_id: number;
  tenant_id?: number;
  second_tenant_id?: number;
};
type UsageAuditingTenant = {
  id: number;
  name: string;
  slug: string;
};
type UsageAuditingTenants = {
  bobbyTenant: UsageAuditingTenant;
  robertTenant: UsageAuditingTenant;
};

const METRIC_TAB_NAMES: Record<UsageStatsMetric, string> = {
  conversations: "Conversations",
  messages: "Messages",
  tokens: "Tokens",
};

const BOBBY_TENANT = {
  name: "Bobby Analytics",
  slug: "bobby-analytics",
};
const ROBERT_TENANT = {
  name: "Robert Analytics",
  slug: "robert-analytics",
};
const TENANT_CONVERSATIONS_CHART_TITLE = "Tenants with most conversations";

// The usage-stats page only waits for the audit metadata before rendering; each
// chart then fires its own adhoc /api/dataset query and mounts ECharts. With six
// charts rendering at once, the [data-testid="chart-container"] mount can blow
// past Cypress's default 4s under CI CPU contention. Give the container readiness
// assertion a generous budget rather than racing the render.
const CHART_RENDER_TIMEOUT = 12000;

const METRIC_CHART_TITLES: Record<UsageStatsMetric, string[]> = {
  conversations: [
    "Conversations by day",
    "Conversations by source",
    "Conversations by profile",
    "Groups with most conversations",
    "Users with most conversations",
    "IP addresses with most conversations",
  ],
  messages: [
    "Messages by day",
    "Messages by source",
    "Messages by profile",
    "Groups with most messages",
    "Users with most messages",
    "IP addresses with most messages",
  ],
  tokens: [
    "Tokens by day",
    "Tokens by source",
    "Tokens by profile",
    "Groups with most tokens",
    "Users with most tokens",
    "IP addresses with most tokens",
  ],
};

type DateFilterLabel =
  | "Today"
  | "Yesterday"
  | "Last 7 days"
  | "Last 30 days"
  | "Previous month"
  | "Previous 3 months"
  | "Previous 12 months";

const DATE_FILTER_CASES: DateFilterLabel[] = ["Today", "Last 7 days"];

const MAIN_PROFILE_LABELS: string[] = [
  "Internal",
  "Slackbot",
  "SQL",
  "NLQ",
  "Embedding",
  "Transforms codegen",
];

function visitUsageStatsPage(path = "/admin/metabot/usage-auditing"): void {
  cy.intercept("GET", "/api/database/13371337/metadata*").as("auditMetadata");
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.visit(path);
  cy.wait("@auditMetadata");
}

function interceptConversationsApi(): void {
  cy.intercept("GET", "/api/ee/metabot-analytics/conversations?*").as(
    "conversations",
  );
  cy.intercept("GET", "/api/ee/metabot-analytics/conversations/*").as(
    "conversationDetail",
  );
}

function waitForConversations(): void {
  cy.wait("@conversations").its("response.statusCode").should("eq", 200);
}

function seedUsageAuditingData(
  request: SeedUsageAuditingRequest = {
    user_id: ADMIN_USER_ID,
    second_user_id: NORMAL_USER_ID,
  },
): Cypress.Chainable<Cypress.Response<SeedUsageAuditingResponse>> {
  return cy
    .request<SeedUsageAuditingResponse>(
      "POST",
      "/api/testing/metabot/seed-usage-auditing",
      request,
    )
    .as("usageAuditingSeed");
}

function getUsageAuditingSeed(): Cypress.Chainable<
  Cypress.Response<SeedUsageAuditingResponse>
> {
  return cy.get<Cypress.Response<SeedUsageAuditingResponse>>(
    "@usageAuditingSeed",
  );
}

function createUsageAuditingTenant({
  name,
  slug,
}: Omit<UsageAuditingTenant, "id">): Cypress.Chainable<UsageAuditingTenant> {
  return cy
    .request<UsageAuditingTenant>("POST", "/api/ee/tenant", { name, slug })
    .its("body");
}

function setupUsageAuditingTenants(): Cypress.Chainable<UsageAuditingTenants> {
  H.updateSetting("use-tenants", true);

  return createUsageAuditingTenant(BOBBY_TENANT).then((bobbyTenant) => {
    return createUsageAuditingTenant(ROBERT_TENANT).then((robertTenant) => {
      return seedUsageAuditingData({
        user_id: ADMIN_USER_ID,
        second_user_id: NORMAL_USER_ID,
        tenant_id: bobbyTenant.id,
        second_tenant_id: robertTenant.id,
      }).then(() => ({ bobbyTenant, robertTenant }));
    });
  });
}

function visitConversationsPage(
  path = "/admin/metabot/usage-auditing/conversations",
): void {
  interceptConversationsApi();
  cy.visit(path);
  waitForConversations();
}

function getChartCard(title: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return H.main()
    .findByText(title)
    .scrollIntoView()
    .should("be.visible")
    .parent();
}

function assertChartRendered(title: string): void {
  getChartCard(title).within(() => {
    cy.findByTestId(/^(chart|row-chart)-container$/, {
      timeout: CHART_RENDER_TIMEOUT,
    })
      .should("be.visible")
      .find("svg")
      .should("exist");
  });
}

function assertMetricChartsRendered(metric: UsageStatsMetric): void {
  METRIC_CHART_TITLES[metric].forEach(assertChartRendered);
}

function selectMetricTab(
  metric: Exclude<UsageStatsMetric, "conversations">,
): void {
  H.main().findByRole("tab", { name: METRIC_TAB_NAMES[metric] }).realClick();
  cy.url().should("include", `metric=${metric}`);
  cy.wait("@dataset");
}

function getMetricTimeseriesTitle(
  metric: UsageStatsMetric,
  dateLabel: DateFilterLabel,
): string {
  const timeseriesUnit =
    dateLabel === "Today" || dateLabel === "Yesterday" ? "hour" : "day";

  return `${METRIC_TAB_NAMES[metric]} by ${timeseriesUnit}`;
}

function assertMetricChartsRenderedForDate(
  metric: UsageStatsMetric,
  dateLabel: DateFilterLabel,
): void {
  assertChartRendered(getMetricTimeseriesTitle(metric, dateLabel));
  METRIC_CHART_TITLES[metric].slice(1).forEach((title) => {
    assertChartRendered(title);
  });
}

function selectGroupFilter(groupName: string): void {
  H.main().findByTestId("conversation-filters-group-select").realClick();
  H.selectDropdown().findByText(groupName).realClick();
  cy.url().should("include", "group=");
  cy.wait("@dataset");
}

function selectUserFilter(userName: string, waitAlias = "@dataset"): void {
  H.main().findByTestId("conversation-filters-user-select").realClick();
  H.selectDropdown().findByText(userName).realClick();
  // Anchor on the select reflecting the newly chosen user before waiting. A bare
  // `url includes "user="` check is a no-op after a drill-through (the URL already
  // carries the drilled user), so it doesn't gate on the filter actually switching
  // and the conversations request/table can be read mid-transition. Mirrors
  // selectDateFilter.
  H.main()
    .findByTestId("conversation-filters-user-select")
    .should("have.value", userName);
  cy.wait(waitAlias);
}

function selectTenantFilter(tenantName: string, waitAlias = "@dataset"): void {
  H.main().findByTestId("conversation-filters-tenant-select").realClick();
  H.selectDropdown().findByText(tenantName).realClick();
  cy.url().should("include", "tenant=");
  cy.wait(waitAlias);
}

function selectDateFilter(
  dateLabel: DateFilterLabel,
  waitAlias = "@dataset",
): void {
  H.main().findByTestId("conversation-filters-date-select").realClick();
  H.selectDropdown().findByText(dateLabel).realClick();
  H.main()
    .findByTestId("conversation-filters-date-select")
    .should("have.value", dateLabel);
  cy.wait(waitAlias);
}

function assertConversationTableContains(labels: readonly string[]): void {
  H.main()
    .findByRole("table")
    .within(() => {
      labels.forEach((label) => {
        cy.findAllByText(label)
          .filter(":visible")
          .should("have.length.greaterThan", 0);
      });
    });
}

function assertConversationTableDoesNotContain(
  labels: readonly string[],
): void {
  H.main()
    .findByRole("table")
    .within(() => {
      labels.forEach((label) => {
        cy.contains(label).should("not.exist");
      });
    });
}

function assertTodayConversationTable(): void {
  assertConversationTableContains([
    "Bobby Tables",
    "NLQ",
    "Slackbot",
    "Transforms codegen",
    "10.0.0.1",
    "10.0.0.6",
    "10.0.0.7",
  ]);
  assertConversationTableDoesNotContain([
    "Robert Tableton",
    "Internal",
    "10.0.0.2",
    "10.0.0.3",
    "10.0.0.99",
  ]);
}

function assertLatestHourConversationTable(): void {
  assertConversationTableContains([
    "Bobby Tables",
    "Transforms codegen",
    "10.0.0.7",
  ]);
  assertConversationTableDoesNotContain([
    "Robert Tableton",
    "NLQ",
    "10.0.0.1",
    "10.0.0.2",
    "10.0.0.3",
    "10.0.0.99",
  ]);
}

function assertHourDateFilterInUrl(): void {
  cy.location("search").then((search) => {
    const date = new URLSearchParams(search).get("date");

    expect(date).to.match(
      /^\d{4}-\d{2}-\d{2}T\d{2}:00:00~\d{4}-\d{2}-\d{2}T\d{2}:00:00$/,
    );
  });
}

function clickLastTimeseriesChartDot(title: string): void {
  // Anchor on the chart being fully rendered before drilling: the page only
  // waits for the audit metadata, so the chart's dataset query + ECharts render
  // can still be in flight. Without this, cartesianChartCircle() races the
  // render and times out looking for [data-testid="chart-container"].
  assertChartRendered(title);
  getChartCard(title).within(() => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.cartesianChartCircle()
      .should("have.length.greaterThan", 0)
      .last()
      .realClick();
  });
}

function clickRowChartBarForLabel(title: string, label: string): void {
  // Drill by clicking the bar element itself rather than coordinate-clicking the
  // container at a fixed offset from the axis label. Two things made the old
  // `labelRect.right + 30` approach flaky:
  //   - The page only waits for the audit metadata, so the chart's dataset query
  //     + ECharts render could still be in flight.
  //   - Row charts measure their size asynchronously (ExplicitSize, throttled),
  //     so they first render with zero-width bars before re-laying out at the
  //     final geometry — and assertChartRendered only proves the <svg> exists,
  //     it passes in both the unmeasured and measured states.
  // A pixel coordinate computed in either window lands off the bar: the
  // drill-through never fires and cy.wait("@conversations") times out, or a
  // near-miss drills a neighboring group. Instead wait for the measured
  // (non-zero-width) bar whose vertical band contains the label's midpoint and
  // realClick it — Cypress re-resolves its center at click time and retries for
  // actionability, so the click can't miss.
  assertChartRendered(title);
  getChartCard(title).within(() => {
    cy.findByText(label).then(([labelEl]) => {
      cy.findAllByRole("graphics-symbol")
        .filter((_index, barEl) => {
          const labelRect = labelEl.getBoundingClientRect();
          const labelMidY = labelRect.top + labelRect.height / 2;
          const barRect = barEl.getBoundingClientRect();
          return (
            barRect.width > 0 &&
            barRect.top <= labelMidY &&
            labelMidY <= barRect.bottom
          );
        })
        .should("have.length", 1)
        .realClick({ scrollBehavior: false });
    });
  });
}

function openConversationFromProfile(profileLabel: string): void {
  cy.get("tbody")
    .contains("tr", profileLabel)
    .scrollIntoView()
    .should("be.visible")
    .realClick();
  cy.wait("@conversationDetail").its("response.statusCode").should("eq", 200);
}

function assertConversationDetailProfile(profileLabel: string): void {
  H.main().within(() => {
    cy.findByRole("heading", { name: /Conversation with/ }).should(
      "be.visible",
    );
    cy.findByText(profileLabel).should("be.visible");
    cy.findByText("Total tokens").should("be.visible");
  });
}

describe("scenarios > metabot > usage auditing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    seedUsageAuditingData();
  });

  it("shows conversation usage stats charts", () => {
    visitUsageStatsPage();

    H.main().within(() => {
      cy.findByRole("heading", { name: "Usage stats" }).should("be.visible");
      cy.findByRole("tab", { name: "Conversations" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });
    assertMetricChartsRendered("conversations");
  });

  it("renders usage stats charts for selected date shortcuts on conversations", () => {
    visitUsageStatsPage();

    const metric = "conversations";

    DATE_FILTER_CASES.forEach((label) => {
      cy.log(`${METRIC_TAB_NAMES[metric]} date filter: ${label}`);
      selectDateFilter(label);

      assertMetricChartsRenderedForDate(metric, label);
    });
  });

  it("renders usage stats charts for selected date shortcuts on tokens", () => {
    visitUsageStatsPage();

    const metric = "tokens";
    selectMetricTab(metric);

    DATE_FILTER_CASES.forEach((label) => {
      cy.log(`${METRIC_TAB_NAMES[metric]} date filter: ${label}`);
      selectDateFilter(label);

      assertMetricChartsRenderedForDate(metric, label);
    });
  });

  it("renders usage stats charts for selected date shortcuts on messages", () => {
    visitUsageStatsPage();

    const metric = "messages";
    selectMetricTab(metric);

    DATE_FILTER_CASES.forEach((label) => {
      cy.log(`${METRIC_TAB_NAMES[metric]} date filter: ${label}`);
      selectDateFilter(label);

      assertMetricChartsRenderedForDate(metric, label);
    });
  });

  it("filters conversation charts by group", () => {
    visitUsageStatsPage();
    selectGroupFilter("Administrators");

    assertMetricChartsRendered("conversations");

    selectGroupFilter("data");

    assertMetricChartsRendered("conversations");
  });

  it("filters conversation charts by user", () => {
    visitUsageStatsPage();
    selectUserFilter("Robert Tableton");

    assertMetricChartsRendered("conversations");

    selectUserFilter("Bobby Tables");

    assertMetricChartsRendered("conversations");
  });

  it("shows tenant filters and tenant charts when tenants are enabled", () => {
    setupUsageAuditingTenants().then(() => {
      visitUsageStatsPage();

      H.main().findByDisplayValue("All tenants").should("be.visible");
      assertChartRendered(TENANT_CONVERSATIONS_CHART_TITLE);
    });
  });

  it("filters conversation charts by tenant", () => {
    setupUsageAuditingTenants().then(({ bobbyTenant, robertTenant }) => {
      visitUsageStatsPage();

      selectTenantFilter(bobbyTenant.name);
      assertMetricChartsRendered("conversations");
      assertChartRendered(TENANT_CONVERSATIONS_CHART_TITLE);

      selectTenantFilter(robertTenant.name);
      assertMetricChartsRendered("conversations");
      assertChartRendered(TENANT_CONVERSATIONS_CHART_TITLE);
    });
  });

  it("filters the conversations list by tenant", () => {
    setupUsageAuditingTenants().then(({ bobbyTenant, robertTenant }) => {
      visitConversationsPage(
        "/admin/metabot/usage-auditing/conversations?date=past7days~",
      );

      H.main().findByDisplayValue("All tenants").should("be.visible");
      selectTenantFilter(bobbyTenant.name, "@conversations");
      cy.location("search").should("include", `tenant=${bobbyTenant.id}`);
      assertConversationTableContains([
        "Bobby Tables",
        "Internal",
        "NLQ",
        "Slackbot",
        "Transforms codegen",
        "10.0.0.1",
        "10.0.0.2",
        "10.0.0.6",
        "10.0.0.7",
      ]);
      assertConversationTableDoesNotContain([
        "Robert Tableton",
        "10.0.0.3",
        "10.0.0.4",
        "10.0.0.5",
      ]);

      selectTenantFilter(robertTenant.name, "@conversations");
      cy.location("search").should("include", `tenant=${robertTenant.id}`);
      assertConversationTableContains([
        "Robert Tableton",
        "SQL",
        "Documents",
        "Embedding",
        "10.0.0.3",
        "10.0.0.4",
        "10.0.0.5",
      ]);
      assertConversationTableDoesNotContain([
        "Bobby Tables",
        "10.0.0.1",
        "10.0.0.2",
        "10.0.0.6",
        "10.0.0.7",
      ]);
    });
  });

  it("drills through from the tenants chart to the conversations list", () => {
    setupUsageAuditingTenants().then(({ bobbyTenant, robertTenant }) => {
      visitUsageStatsPage("/admin/metabot/usage-auditing?date=past7days~");
      interceptConversationsApi();

      assertMetricChartsRendered("conversations");

      clickRowChartBarForLabel(
        TENANT_CONVERSATIONS_CHART_TITLE,
        bobbyTenant.name,
      );

      waitForConversations();
      cy.location("pathname").should(
        "eq",
        "/admin/metabot/usage-auditing/conversations",
      );
      cy.location("search").should("include", `tenant=${bobbyTenant.id}`);
      H.main().findByDisplayValue(bobbyTenant.name).should("be.visible");
      assertConversationTableContains([
        "Bobby Tables",
        "Internal",
        "NLQ",
        "Slackbot",
        "Transforms codegen",
        "10.0.0.1",
        "10.0.0.2",
        "10.0.0.6",
        "10.0.0.7",
      ]);
      assertConversationTableDoesNotContain([
        robertTenant.name,
        "Robert Tableton",
        "10.0.0.3",
        "10.0.0.4",
        "10.0.0.5",
      ]);
    });
  });

  it("drills through from the groups chart to the conversations list", () => {
    visitUsageStatsPage("/admin/metabot/usage-auditing?date=past7days~");
    interceptConversationsApi();

    assertMetricChartsRendered("conversations");

    clickRowChartBarForLabel(
      "Groups with most conversations",
      "Administrators",
    );

    waitForConversations();
    cy.location("pathname").should(
      "eq",
      "/admin/metabot/usage-auditing/conversations",
    );
    cy.location("search").should("include", `group=${ADMINISTRATORS_GROUP_ID}`);
    H.main().findByDisplayValue("Administrators").should("be.visible");
    assertConversationTableContains([
      "Bobby Tables",
      "Internal",
      "NLQ",
      "10.0.0.1",
      "10.0.0.2",
    ]);
    assertConversationTableDoesNotContain([
      "Robert Tableton",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
      "10.0.0.99",
    ]);
  });

  it("drills through from conversation charts to the conversations list and updates list filters", () => {
    visitUsageStatsPage();
    interceptConversationsApi();

    assertMetricChartsRendered("conversations");

    clickRowChartBarForLabel("Users with most conversations", "Bobby Tables");

    waitForConversations();
    cy.location("pathname").should(
      "eq",
      "/admin/metabot/usage-auditing/conversations",
    );
    cy.location("search").should("include", `user=${ADMIN_USER_ID}`);
    H.main().findByDisplayValue("Bobby Tables").should("be.visible");
    assertConversationTableContains([
      "Bobby Tables",
      "Internal",
      "NLQ",
      "10.0.0.1",
      "10.0.0.2",
    ]);
    assertConversationTableDoesNotContain([
      "Robert Tableton",
      "10.0.0.3",
      "10.0.0.99",
    ]);

    selectUserFilter("Robert Tableton", "@conversations");
    assertConversationTableContains([
      "Robert Tableton",
      "SQL",
      "Documents",
      "Embedding",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
    ]);
    assertConversationTableDoesNotContain(["Bobby Tables", "10.0.0.1"]);

    selectDateFilter("Yesterday", "@conversations");
    assertConversationTableContains([
      "Robert Tableton",
      "SQL",
      "Documents",
      "10.0.0.3",
      "10.0.0.4",
    ]);
    assertConversationTableDoesNotContain([
      "Embedding",
      "10.0.0.5",
      "Bobby Tables",
    ]);
  });

  it("drills through from the conversations by day chart to the conversations list", () => {
    getUsageAuditingSeed().then(({ body }) => {
      visitUsageStatsPage("/admin/metabot/usage-auditing?date=past7days~");
      interceptConversationsApi();

      clickLastTimeseriesChartDot("Conversations by day");

      waitForConversations();
      cy.location("pathname").should(
        "eq",
        "/admin/metabot/usage-auditing/conversations",
      );
      cy.location("search").should("include", `date=${body.date}`);
      assertTodayConversationTable();
    });
  });

  it("drills through from the conversations by hour chart to the conversations list", () => {
    getUsageAuditingSeed().then(({ body }) => {
      visitUsageStatsPage(`/admin/metabot/usage-auditing?date=${body.date}`);
      interceptConversationsApi();

      clickLastTimeseriesChartDot("Conversations by hour");

      waitForConversations();
      cy.location("pathname").should(
        "eq",
        "/admin/metabot/usage-auditing/conversations",
      );
      assertHourDateFilterInUrl();
      assertLatestHourConversationTable();
    });
  });

  it("opens conversation details from the list for each main profile", () => {
    visitConversationsPage(
      "/admin/metabot/usage-auditing/conversations?date=past7days~",
    );

    MAIN_PROFILE_LABELS.forEach((profileLabel, index) => {
      cy.log(`Profile: ${profileLabel}`);
      H.main()
        .findByRole("heading", { name: "Conversations" })
        .should("be.visible");

      openConversationFromProfile(profileLabel);
      assertConversationDetailProfile(profileLabel);

      if (index < MAIN_PROFILE_LABELS.length - 1) {
        cy.go("back");
        cy.location("pathname").should(
          "eq",
          "/admin/metabot/usage-auditing/conversations",
        );
      }
    });
  });

  it("sorts the conversations table by each sortable column", () => {
    const sortableColumns: Array<{ headerLabel: RegExp; sortBy: string }> = [
      { headerLabel: /^User/, sortBy: "user" },
      { headerLabel: /^Profile/, sortBy: "profile_id" },
      { headerLabel: /^Date/, sortBy: "created_at" },
      { headerLabel: /^Messages/, sortBy: "message_count" },
      { headerLabel: /^Tokens/, sortBy: "total_tokens" },
      { headerLabel: /^IP/, sortBy: "ip_address" },
    ];

    visitConversationsPage();

    for (const { headerLabel, sortBy } of sortableColumns) {
      H.main()
        .findByRole("table")
        .findByRole("button", { name: headerLabel })
        .click();

      cy.wait("@conversations")
        .its("request.url")
        .should("include", `sort_by=${sortBy}`);
    }
  });

  it("shows message usage stats charts", () => {
    visitUsageStatsPage();
    H.main().findByRole("tab", { name: "Messages" }).realClick();

    cy.url().should("include", "metric=messages");
    H.main()
      .findByRole("tab", { name: "Messages" })
      .should("have.attr", "aria-selected", "true");
    assertMetricChartsRendered("messages");
  });

  it("shows token usage stats charts", () => {
    visitUsageStatsPage();
    H.main().findByRole("tab", { name: "Tokens" }).realClick();

    cy.url().should("include", "metric=tokens");
    H.main()
      .findByRole("tab", { name: "Tokens" })
      .should("have.attr", "aria-selected", "true");
    assertMetricChartsRendered("tokens");
  });

  it("uses hourly stats for a single-day date filter", () => {
    getUsageAuditingSeed().then(({ body }) => {
      visitUsageStatsPage(`/admin/metabot/usage-auditing?date=${body.date}`);

      H.main().within(() => {
        cy.findByRole("heading", { name: "Usage stats" }).should("be.visible");
        cy.findByText("Conversations by day").should("not.exist");
      });
      assertChartRendered("Conversations by hour");
      METRIC_CHART_TITLES.conversations.slice(1).forEach((title) => {
        assertChartRendered(title);
      });
    });
  });
});
