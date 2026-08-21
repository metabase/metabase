import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import { main } from "../support/ui";
import {
  ADMINISTRATORS_GROUP_ID,
  ADMIN_USER_ID,
  DATE_FILTER_CASES,
  MAIN_PROFILE_LABELS,
  METRIC_CHART_TITLES,
  TENANT_CONVERSATIONS_CHART_TITLE,
  assertChartRendered,
  assertConversationDetailProfile,
  assertConversationTableContains,
  assertConversationTableDoesNotContain,
  assertHourDateFilterInUrl,
  assertLatestHourConversationTable,
  assertMetricChartsRendered,
  assertMetricChartsRenderedForDate,
  assertTodayConversationTable,
  clickLastTimeseriesChartDot,
  clickRowChartBarForLabel,
  openConversationFromProfile,
  seedUsageAuditingData,
  selectDateFilter,
  selectGroupFilter,
  selectMetricTab,
  selectTenantFilter,
  selectUserFilter,
  setupUsageAuditingTenants,
  visitConversationsPage,
  visitUsageStatsPage,
  waitForConversationsRequest,
  waitForConversationsResponse,
} from "../support/metabot-usage-auditing";

const CONVERSATIONS_PATHNAME = "/admin/metabot/usage-auditing/conversations";

// EE token gate — the usage-auditing charts, tenants and audit DB are EE. The
// jar activates the token via cypress.env.json.
test.skip(
  !resolveToken("pro-self-hosted"),
  "requires the pro-self-hosted token",
);

test.describe("scenarios > metabot > usage auditing", () => {
  let seedDate: string;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    const seed = await seedUsageAuditingData(mb.api);
    seedDate = seed.date;
  });

  test("shows conversation usage stats charts", async ({ page }) => {
    await visitUsageStatsPage(page);

    await expect(
      main(page).getByRole("heading", { name: "Usage stats" }),
    ).toBeVisible();
    await expect(
      main(page).getByRole("tab", { name: "Conversations", exact: true }),
    ).toHaveAttribute("aria-selected", "true");

    await assertMetricChartsRendered(page, "conversations");
  });

  test("renders usage stats charts for selected date shortcuts on conversations", async ({
    page,
  }) => {
    await visitUsageStatsPage(page);

    const metric = "conversations";
    for (const label of DATE_FILTER_CASES) {
      await selectDateFilter(page, label);
      await assertMetricChartsRenderedForDate(page, metric, label);
    }
  });

  test("renders usage stats charts for selected date shortcuts on tokens", async ({
    page,
  }) => {
    await visitUsageStatsPage(page);

    const metric = "tokens";
    await selectMetricTab(page, metric);

    for (const label of DATE_FILTER_CASES) {
      await selectDateFilter(page, label);
      await assertMetricChartsRenderedForDate(page, metric, label);
    }
  });

  test("renders usage stats charts for selected date shortcuts on messages", async ({
    page,
  }) => {
    await visitUsageStatsPage(page);

    const metric = "messages";
    await selectMetricTab(page, metric);

    for (const label of DATE_FILTER_CASES) {
      await selectDateFilter(page, label);
      await assertMetricChartsRenderedForDate(page, metric, label);
    }
  });

  test("filters conversation charts by group", async ({ page }) => {
    await visitUsageStatsPage(page);
    await selectGroupFilter(page, "Administrators");
    await assertMetricChartsRendered(page, "conversations");

    await selectGroupFilter(page, "data");
    await assertMetricChartsRendered(page, "conversations");
  });

  test("filters conversation charts by user", async ({ page }) => {
    await visitUsageStatsPage(page);
    await selectUserFilter(page, "Robert Tableton");
    await assertMetricChartsRendered(page, "conversations");

    await selectUserFilter(page, "Bobby Tables");
    await assertMetricChartsRendered(page, "conversations");
  });

  test("shows tenant filters and tenant charts when tenants are enabled", async ({
    page,
    mb,
  }) => {
    await setupUsageAuditingTenants(mb.api);
    await visitUsageStatsPage(page);

    await expect(
      main(page).getByTestId("conversation-filters-tenant-select"),
    ).toHaveValue("All tenants");
    await assertChartRendered(page, TENANT_CONVERSATIONS_CHART_TITLE);
  });

  test("filters conversation charts by tenant", async ({ page, mb }) => {
    const { bobbyTenant, robertTenant } = await setupUsageAuditingTenants(
      mb.api,
    );
    await visitUsageStatsPage(page);

    await selectTenantFilter(page, bobbyTenant.name);
    await assertMetricChartsRendered(page, "conversations");
    await assertChartRendered(page, TENANT_CONVERSATIONS_CHART_TITLE);

    await selectTenantFilter(page, robertTenant.name);
    await assertMetricChartsRendered(page, "conversations");
    await assertChartRendered(page, TENANT_CONVERSATIONS_CHART_TITLE);
  });

  test("filters the conversations list by tenant", async ({ page, mb }) => {
    const { bobbyTenant, robertTenant } = await setupUsageAuditingTenants(
      mb.api,
    );
    await visitConversationsPage(
      page,
      `${CONVERSATIONS_PATHNAME}?date=past7days~`,
    );

    await expect(
      main(page).getByTestId("conversation-filters-tenant-select"),
    ).toHaveValue("All tenants");

    await selectTenantFilter(page, bobbyTenant.name, "conversations");
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(`tenant=${bobbyTenant.id}`);
    await assertConversationTableContains(page, [
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
    await assertConversationTableDoesNotContain(page, [
      "Robert Tableton",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
    ]);

    await selectTenantFilter(page, robertTenant.name, "conversations");
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(`tenant=${robertTenant.id}`);
    await assertConversationTableContains(page, [
      "Robert Tableton",
      "SQL",
      "Documents",
      "Embedding",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
    ]);
    await assertConversationTableDoesNotContain(page, [
      "Bobby Tables",
      "10.0.0.1",
      "10.0.0.2",
      "10.0.0.6",
      "10.0.0.7",
    ]);
  });

  test("drills through from the tenants chart to the conversations list", async ({
    page,
    mb,
  }) => {
    const { bobbyTenant, robertTenant } = await setupUsageAuditingTenants(
      mb.api,
    );
    await visitUsageStatsPage(
      page,
      "/admin/metabot/usage-auditing?date=past7days~",
    );

    await assertMetricChartsRendered(page, "conversations");

    const conversations = waitForConversationsResponse(page);
    await clickRowChartBarForLabel(
      page,
      TENANT_CONVERSATIONS_CHART_TITLE,
      bobbyTenant.name,
    );
    expect((await conversations).status()).toBe(200);

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(CONVERSATIONS_PATHNAME);
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(`tenant=${bobbyTenant.id}`);
    await expect(
      main(page).getByTestId("conversation-filters-tenant-select"),
    ).toHaveValue(bobbyTenant.name);
    await assertConversationTableContains(page, [
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
    await assertConversationTableDoesNotContain(page, [
      robertTenant.name,
      "Robert Tableton",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
    ]);
  });

  test("drills through from the groups chart to the conversations list", async ({
    page,
  }) => {
    await visitUsageStatsPage(
      page,
      "/admin/metabot/usage-auditing?date=past7days~",
    );

    await assertMetricChartsRendered(page, "conversations");

    const conversations = waitForConversationsResponse(page);
    await clickRowChartBarForLabel(
      page,
      "Groups with most conversations",
      "Administrators",
    );
    expect((await conversations).status()).toBe(200);

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(CONVERSATIONS_PATHNAME);
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(`group=${ADMINISTRATORS_GROUP_ID}`);
    await expect(
      main(page).getByTestId("conversation-filters-group-select"),
    ).toHaveValue("Administrators");
    await assertConversationTableContains(page, [
      "Bobby Tables",
      "Internal",
      "NLQ",
      "10.0.0.1",
      "10.0.0.2",
    ]);
    await assertConversationTableDoesNotContain(page, [
      "Robert Tableton",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
      "10.0.0.99",
    ]);
  });

  test("drills through from conversation charts to the conversations list and updates list filters", async ({
    page,
  }) => {
    await visitUsageStatsPage(page);

    await assertMetricChartsRendered(page, "conversations");

    const conversations = waitForConversationsResponse(page);
    await clickRowChartBarForLabel(
      page,
      "Users with most conversations",
      "Bobby Tables",
    );
    expect((await conversations).status()).toBe(200);

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(CONVERSATIONS_PATHNAME);
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(`user=${ADMIN_USER_ID}`);
    await expect(
      main(page).getByTestId("conversation-filters-user-select"),
    ).toHaveValue("Bobby Tables");
    await assertConversationTableContains(page, [
      "Bobby Tables",
      "Internal",
      "NLQ",
      "10.0.0.1",
      "10.0.0.2",
    ]);
    await assertConversationTableDoesNotContain(page, [
      "Robert Tableton",
      "10.0.0.3",
      "10.0.0.99",
    ]);

    await selectUserFilter(page, "Robert Tableton", "conversations");
    await assertConversationTableContains(page, [
      "Robert Tableton",
      "SQL",
      "Documents",
      "Embedding",
      "10.0.0.3",
      "10.0.0.4",
      "10.0.0.5",
    ]);
    await assertConversationTableDoesNotContain(page, [
      "Bobby Tables",
      "10.0.0.1",
    ]);

    await selectDateFilter(page, "Yesterday", "conversations");
    await assertConversationTableContains(page, [
      "Robert Tableton",
      "SQL",
      "Documents",
      "10.0.0.3",
      "10.0.0.4",
    ]);
    await assertConversationTableDoesNotContain(page, [
      "Embedding",
      "10.0.0.5",
      "Bobby Tables",
    ]);
  });

  test("drills through from the conversations by day chart to the conversations list", async ({
    page,
  }) => {
    await visitUsageStatsPage(
      page,
      "/admin/metabot/usage-auditing?date=past7days~",
    );

    const conversations = waitForConversationsResponse(page);
    await clickLastTimeseriesChartDot(page, "Conversations by day");
    expect((await conversations).status()).toBe(200);

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(CONVERSATIONS_PATHNAME);
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(`date=${seedDate}`);
    await assertTodayConversationTable(page);
  });

  test("drills through from the conversations by hour chart to the conversations list", async ({
    page,
  }) => {
    await visitUsageStatsPage(
      page,
      `/admin/metabot/usage-auditing?date=${seedDate}`,
    );

    const conversations = waitForConversationsResponse(page);
    await clickLastTimeseriesChartDot(page, "Conversations by hour");
    expect((await conversations).status()).toBe(200);

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(CONVERSATIONS_PATHNAME);
    await assertHourDateFilterInUrl(page);
    await assertLatestHourConversationTable(page);
  });

  test("opens conversation details from the list for each main profile", async ({
    page,
  }) => {
    await visitConversationsPage(
      page,
      `${CONVERSATIONS_PATHNAME}?date=past7days~`,
    );

    for (let index = 0; index < MAIN_PROFILE_LABELS.length; index++) {
      const profileLabel = MAIN_PROFILE_LABELS[index];
      await expect(
        main(page).getByRole("heading", { name: "Conversations", exact: true }),
      ).toBeVisible();

      await openConversationFromProfile(page, profileLabel);
      await assertConversationDetailProfile(page, profileLabel);

      if (index < MAIN_PROFILE_LABELS.length - 1) {
        await page.goBack();
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(CONVERSATIONS_PATHNAME);
      }
    }
  });

  test("sorts the conversations table by each sortable column", async ({
    page,
  }) => {
    const sortableColumns: Array<{ headerLabel: RegExp; sortBy: string }> = [
      { headerLabel: /^User/, sortBy: "user" },
      { headerLabel: /^Profile/, sortBy: "profile_id" },
      { headerLabel: /^Date/, sortBy: "created_at" },
      { headerLabel: /^Messages/, sortBy: "message_count" },
      { headerLabel: /^Tokens/, sortBy: "total_tokens" },
      { headerLabel: /^IP/, sortBy: "ip_address" },
    ];

    await visitConversationsPage(page);

    for (const { headerLabel, sortBy } of sortableColumns) {
      const conversations = waitForConversationsRequest(page);
      await main(page)
        .getByRole("table")
        .getByRole("button", { name: headerLabel })
        .click();
      const response = await conversations;
      expect(response.request().url()).toContain(`sort_by=${sortBy}`);
    }
  });

  test("shows message usage stats charts", async ({ page }) => {
    await visitUsageStatsPage(page);
    await main(page)
      .getByRole("tab", { name: "Messages", exact: true })
      .click();

    await expect.poll(() => page.url()).toContain("metric=messages");
    await expect(
      main(page).getByRole("tab", { name: "Messages", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await assertMetricChartsRendered(page, "messages");
  });

  test("shows token usage stats charts", async ({ page }) => {
    await visitUsageStatsPage(page);
    await main(page).getByRole("tab", { name: "Tokens", exact: true }).click();

    await expect.poll(() => page.url()).toContain("metric=tokens");
    await expect(
      main(page).getByRole("tab", { name: "Tokens", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await assertMetricChartsRendered(page, "tokens");
  });

  test("uses hourly stats for a single-day date filter", async ({ page }) => {
    await visitUsageStatsPage(
      page,
      `/admin/metabot/usage-auditing?date=${seedDate}`,
    );

    await expect(
      main(page).getByRole("heading", { name: "Usage stats" }),
    ).toBeVisible();
    await expect(
      main(page).getByText("Conversations by day", { exact: true }),
    ).toHaveCount(0);

    await assertChartRendered(page, "Conversations by hour");
    for (const title of METRIC_CHART_TITLES.conversations.slice(1)) {
      await assertChartRendered(page, title);
    }
  });
});
