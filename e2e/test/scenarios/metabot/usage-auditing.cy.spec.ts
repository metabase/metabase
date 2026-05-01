const { H } = cy;

import {
  ADMINISTRATORS_GROUP_ID,
  ADMIN_USER_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";

type UsageStatsMetric = "conversations" | "messages" | "tokens";
type ChartLabelKey = "source" | "profile" | "user" | "ip";
type ChartLabels = Partial<Record<ChartLabelKey, string[]>>;
type CompleteChartLabels = Record<ChartLabelKey, string[]>;
type CartesianChartLabelKey = Extract<ChartLabelKey, "source" | "profile">;
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

const METRIC_PRIMARY_SERIES_COLORS: Record<UsageStatsMetric, string> = {
  conversations: "#509EE3",
  messages: "#F9D45C",
  tokens: "#A989C5",
};

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

const BOBBY_CHART_LABELS: CompleteChartLabels = {
  source: ["Slackbot", "Metabot"],
  profile: ["Internal", "NLQ"],
  user: ["Bobby Tables"],
  ip: ["10.0.0.1", "10.0.0.2"],
};

const ROBERT_CHART_LABELS: CompleteChartLabels = {
  source: ["SQL", "Documents"],
  profile: ["SQL", "Documents", "Embedding"],
  user: ["Robert Tableton"],
  ip: ["10.0.0.3", "10.0.0.4", "10.0.0.5"],
};

const DATE_FILTER_SHORTCUTS = [
  "Today",
  "Yesterday",
  "Previous week",
  "Previous 7 days",
  "Previous 30 days",
  "Previous month",
  "Previous 3 months",
  "Previous 12 months",
] as const;

type DateFilterLabel = (typeof DATE_FILTER_SHORTCUTS)[number];

const DATE_FILTER_BUTTON_LABEL = new RegExp(DATE_FILTER_SHORTCUTS.join("|"));

const TODAY_CHART_LABELS: CompleteChartLabels = {
  source: ["Slackbot", "Metabot"],
  profile: ["NLQ", "Slackbot", "Transforms codegen"],
  user: ["Bobby Tables"],
  ip: ["10.0.0.1", "10.0.0.6", "10.0.0.7"],
};

const PREVIOUS_WEEK_CHART_LABELS: CompleteChartLabels = {
  source: ["Metabot"],
  profile: ["NLQ"],
  user: ["Bobby Tables"],
  ip: ["10.0.0.1"],
};

const RECENT_CHART_LABELS: CompleteChartLabels = {
  source: ["Slackbot", "Metabot", "SQL", "Documents"],
  profile: ["Internal", "NLQ", "SQL", "Documents"],
  user: ["Bobby Tables", "Robert Tableton"],
  ip: ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5"],
};

const OUT_OF_BOUNDS_CHART_LABELS: ChartLabels = {
  ip: ["10.0.0.99"],
};

const DATE_FILTER_CASES: Array<{
  label: DateFilterLabel;
  chartLabels: ChartLabels;
}> = [
  { label: "Today", chartLabels: TODAY_CHART_LABELS },
  { label: "Previous week", chartLabels: PREVIOUS_WEEK_CHART_LABELS },
];

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
    cy.findByTestId(/^(chart|row-chart)-container$/)
      .should("be.visible")
      .find("svg")
      .should("exist");
  });
}

function assertChartContains(title: string, labels: readonly string[]): void {
  getChartCard(title).within(() => {
    labels.forEach((label) => {
      cy.findAllByText(label)
        .filter(":visible")
        .should("have.length.greaterThan", 0);
    });
  });
}

function getUniqueCartesianChartBarPaths(
  title: string,
  metric: UsageStatsMetric,
): Cypress.Chainable<SVGPathElement[]> {
  return getChartCard(title)
    .findByTestId("chart-container")
    .find<SVGPathElement>(
      `path[fill="${METRIC_PRIMARY_SERIES_COLORS[metric]}"]`,
    )
    .should("have.length.greaterThan", 0)
    .then(($paths) => {
      const seen = new Set<string>();
      const barPaths = $paths.toArray().filter((path) => {
        const { left, top, width, height } = path.getBoundingClientRect();

        if (width < 8 || height < 8) {
          return false;
        }

        const key = [
          Math.round(left),
          Math.round(top),
          Math.round(width),
          Math.round(height),
        ].join(":");

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

      expect(barPaths, `${title} bar paths`).to.have.length.greaterThan(0);

      return barPaths;
    });
}

function getCartesianChartTooltipText(
  title: string,
  metric: UsageStatsMetric,
): Cypress.Chainable<string> {
  let tooltipText = "";
  let previousTooltipText: string | undefined;

  return getUniqueCartesianChartBarPaths(title, metric)
    .each(($path) => {
      const path = $path[0];
      const { left, top, width, height } = path.getBoundingClientRect();
      const eventOptions = {
        clientX: left + width / 2,
        clientY: top + height / 2,
        force: true,
      };

      cy.wrap(path)
        .trigger("mouseover", eventOptions)
        .trigger("mousemove", eventOptions);

      return H.echartsTooltip()
        .should(($tooltip) => {
          if (previousTooltipText) {
            expect($tooltip.text(), `${title} tooltip text`).not.to.eq(
              previousTooltipText,
            );
          }
        })
        .then(($tooltip) => {
          previousTooltipText = $tooltip.text();
          tooltipText += `\n${previousTooltipText}`;
        });
    })
    .then(() => tooltipText);
}

function assertCartesianChartContains(
  title: string,
  metric: UsageStatsMetric,
  labels: readonly string[],
): void {
  getCartesianChartTooltipText(title, metric).then((tooltipText) => {
    labels.forEach((label) => {
      expect(tooltipText, `${title} tooltip text`).to.include(label);
    });
  });
}

function assertCartesianChartDoesNotContain(
  title: string,
  metric: UsageStatsMetric,
  labels: readonly string[],
): void {
  getCartesianChartTooltipText(title, metric).then((tooltipText) => {
    labels.forEach((label) => {
      expect(tooltipText, `${title} tooltip text`).not.to.include(label);
    });
  });
}

function assertChartDoesNotContain(
  title: string,
  labels: readonly string[],
): void {
  getChartCard(title).within(() => {
    labels.forEach((label) => {
      cy.contains(label).should("not.exist");
    });
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

function getMetricBreakoutTitle(
  metric: UsageStatsMetric,
  labelKey: ChartLabelKey,
): string {
  switch (labelKey) {
    case "source":
      return `${METRIC_TAB_NAMES[metric]} by source`;
    case "profile":
      return `${METRIC_TAB_NAMES[metric]} by profile`;
    case "user":
      return `Users with most ${metric}`;
    case "ip":
      return `IP addresses with most ${metric}`;
  }
}

function isCartesianChartLabelKey(
  labelKey: ChartLabelKey,
): labelKey is CartesianChartLabelKey {
  return labelKey === "source" || labelKey === "profile";
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

function assertMetricChartLabels(
  metric: UsageStatsMetric,
  chartLabels: ChartLabels,
): void {
  Object.entries(chartLabels).forEach(([labelKey, labels]) => {
    if (labels?.length) {
      const chartLabelKey = labelKey as ChartLabelKey;
      const title = getMetricBreakoutTitle(metric, chartLabelKey);

      if (isCartesianChartLabelKey(chartLabelKey) && labels.length > 1) {
        assertCartesianChartContains(title, metric, labels);
      } else {
        assertChartContains(title, labels);
      }
    }
  });
}

function assertMetricChartLabelsAbsent(
  metric: UsageStatsMetric,
  chartLabels: ChartLabels,
): void {
  Object.entries(chartLabels).forEach(([labelKey, labels]) => {
    if (labels?.length) {
      const chartLabelKey = labelKey as ChartLabelKey;
      const title = getMetricBreakoutTitle(metric, chartLabelKey);

      if (isCartesianChartLabelKey(chartLabelKey) && labels.length > 1) {
        assertCartesianChartDoesNotContain(title, metric, labels);
      } else {
        assertChartDoesNotContain(title, labels);
      }
    }
  });
}

function assertConversationChartLabels(chartLabels: ChartLabels): void {
  assertMetricChartLabels("conversations", chartLabels);
}

function assertBobbyOnlyChartLabels(): void {
  assertChartContains("Conversations by source", BOBBY_CHART_LABELS.source);
  assertChartDoesNotContain(
    "Conversations by source",
    ROBERT_CHART_LABELS.source,
  );
  assertChartContains("Conversations by profile", BOBBY_CHART_LABELS.profile);
  assertChartDoesNotContain(
    "Conversations by profile",
    ROBERT_CHART_LABELS.profile,
  );
  assertChartContains("Users with most conversations", BOBBY_CHART_LABELS.user);
  assertChartDoesNotContain(
    "Users with most conversations",
    ROBERT_CHART_LABELS.user,
  );
  assertChartContains(
    "IP addresses with most conversations",
    BOBBY_CHART_LABELS.ip,
  );
  assertChartDoesNotContain(
    "IP addresses with most conversations",
    ROBERT_CHART_LABELS.ip,
  );
}

function assertRobertOnlyChartLabels(): void {
  assertChartContains("Conversations by source", ROBERT_CHART_LABELS.source);
  assertChartDoesNotContain(
    "Conversations by source",
    BOBBY_CHART_LABELS.source,
  );
  assertChartContains("Conversations by profile", ROBERT_CHART_LABELS.profile);
  assertChartDoesNotContain(
    "Conversations by profile",
    BOBBY_CHART_LABELS.profile,
  );
  assertChartContains(
    "Users with most conversations",
    ROBERT_CHART_LABELS.user,
  );
  assertChartDoesNotContain(
    "Users with most conversations",
    BOBBY_CHART_LABELS.user,
  );
  assertChartContains(
    "IP addresses with most conversations",
    ROBERT_CHART_LABELS.ip,
  );
  assertChartDoesNotContain(
    "IP addresses with most conversations",
    BOBBY_CHART_LABELS.ip,
  );
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
  cy.url().should("include", "user=");
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
  H.main().findByRole("button", { name: DATE_FILTER_BUTTON_LABEL }).realClick();
  H.popover().findByRole("button", { name: dateLabel }).realClick();
  H.main().findByRole("button", { name: dateLabel }).should("be.visible");
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
  getChartCard(title).within(() => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.cartesianChartCircle()
      .should("have.length.greaterThan", 0)
      .last()
      .realClick();
  });
}

function clickRowChartBarForLabel(title: string, label: string): void {
  getChartCard(title).within(() => {
    cy.findByTestId("row-chart-container").then(($container) => {
      cy.findByText(label).then(($label) => {
        const containerRect = $container[0].getBoundingClientRect();
        const labelRect = $label[0].getBoundingClientRect();
        const x = labelRect.right - containerRect.left + 30;
        const y = labelRect.top - containerRect.top + labelRect.height / 2;

        cy.wrap($container).realClick({ x, y, scrollBehavior: false });
      });
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
    assertConversationChartLabels(RECENT_CHART_LABELS);
  });

  it("renders usage stats charts for selected date shortcuts on conversations", () => {
    visitUsageStatsPage();

    const metric = "conversations";

    DATE_FILTER_CASES.forEach(({ label, chartLabels }) => {
      cy.log(`${METRIC_TAB_NAMES[metric]} date filter: ${label}`);
      selectDateFilter(label);

      assertMetricChartsRenderedForDate(metric, label);
      assertMetricChartLabels(metric, chartLabels);
      assertMetricChartLabelsAbsent(metric, OUT_OF_BOUNDS_CHART_LABELS);
    });
  });

  it("renders usage stats charts for selected date shortcuts on tokens", () => {
    visitUsageStatsPage();

    const metric = "tokens";
    selectMetricTab(metric);

    DATE_FILTER_CASES.forEach(({ label, chartLabels }) => {
      cy.log(`${METRIC_TAB_NAMES[metric]} date filter: ${label}`);
      selectDateFilter(label);

      assertMetricChartsRenderedForDate(metric, label);
      assertMetricChartLabels(metric, chartLabels);
      assertMetricChartLabelsAbsent(metric, OUT_OF_BOUNDS_CHART_LABELS);
    });
  });

  it("renders usage stats charts for selected date shortcuts on messages", () => {
    visitUsageStatsPage();

    const metric = "messages";
    selectMetricTab(metric);

    DATE_FILTER_CASES.forEach(({ label, chartLabels }) => {
      cy.log(`${METRIC_TAB_NAMES[metric]} date filter: ${label}`);
      selectDateFilter(label);

      assertMetricChartsRenderedForDate(metric, label);
      assertMetricChartLabels(metric, chartLabels);
      assertMetricChartLabelsAbsent(metric, OUT_OF_BOUNDS_CHART_LABELS);
    });
  });

  it("filters conversation charts by group", () => {
    visitUsageStatsPage();
    selectGroupFilter("Administrators");

    assertMetricChartsRendered("conversations");
    assertBobbyOnlyChartLabels();

    selectGroupFilter("data");

    assertMetricChartsRendered("conversations");
    assertRobertOnlyChartLabels();
  });

  it("filters conversation charts by user", () => {
    visitUsageStatsPage();
    selectUserFilter("Robert Tableton");

    assertMetricChartsRendered("conversations");
    assertRobertOnlyChartLabels();

    selectUserFilter("Bobby Tables");

    assertMetricChartsRendered("conversations");
    assertBobbyOnlyChartLabels();
  });

  it("shows tenant filters and tenant charts when tenants are enabled", () => {
    setupUsageAuditingTenants().then(({ bobbyTenant, robertTenant }) => {
      visitUsageStatsPage();

      H.main().findByDisplayValue("All tenants").should("be.visible");
      assertChartRendered(TENANT_CONVERSATIONS_CHART_TITLE);
      assertChartContains(TENANT_CONVERSATIONS_CHART_TITLE, [
        bobbyTenant.name,
        robertTenant.name,
      ]);
      assertChartContains("Groups with most conversations", ["All Users"]);
    });
  });

  it("filters conversation charts by tenant", () => {
    setupUsageAuditingTenants().then(({ bobbyTenant, robertTenant }) => {
      visitUsageStatsPage();

      selectTenantFilter(bobbyTenant.name);
      assertMetricChartsRendered("conversations");
      assertChartContains(TENANT_CONVERSATIONS_CHART_TITLE, [bobbyTenant.name]);
      assertChartDoesNotContain(TENANT_CONVERSATIONS_CHART_TITLE, [
        robertTenant.name,
      ]);
      assertBobbyOnlyChartLabels();

      selectTenantFilter(robertTenant.name);
      assertChartContains(TENANT_CONVERSATIONS_CHART_TITLE, [
        robertTenant.name,
      ]);
      assertChartDoesNotContain(TENANT_CONVERSATIONS_CHART_TITLE, [
        bobbyTenant.name,
      ]);
      assertRobertOnlyChartLabels();
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
