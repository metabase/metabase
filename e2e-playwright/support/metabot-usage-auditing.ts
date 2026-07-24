/**
 * Helpers for the Metabot usage-auditing port
 * (e2e/test/scenarios/metabot/usage-auditing.cy.spec.ts).
 *
 * The spec drives the EE "Usage stats" admin page and its conversations list:
 * six ECharts cards per metric (conversations / messages / tokens), group /
 * user / tenant / date filters, chart-drill-through into the conversations
 * table, and the conversation detail view. Data is seeded deterministically
 * through the testing API (POST /api/testing/metabot/seed-usage-auditing),
 * which writes MetabotConversation / MetabotMessage / AiUsageLog rows straight
 * into the app DB — no external infra. The charts themselves query the EE
 * audit database (id 13371337), which an EE build loads at startup.
 */
import type { APIRequestContext, Locator, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { selectDropdown } from "./dashboard";
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { main } from "./ui";

// === instance-data constants (ports of cypress_sample_instance_data.js) ===

function findUserId(email: string): number {
  const user = SAMPLE_INSTANCE_DATA.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`${email} not found in cypress_sample_instance_data`);
  }
  return Number(user.id);
}

/** Port of ADMIN_USER_ID (cypress_sample_instance_data.js). */
export const ADMIN_USER_ID = findUserId("admin@metabase.test");
/** Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
export const NORMAL_USER_ID = findUserId("normal@metabase.test");
/** Port of ADMINISTRATORS_GROUP_ID (cypress_sample_instance_data.js). */
export const ADMINISTRATORS_GROUP_ID = Number(
  SAMPLE_INSTANCE_DATA.groups.find((g) => g.name === "Administrators")?.id,
);

// === spec-level constants ===

export type UsageStatsMetric = "conversations" | "messages" | "tokens";

export type SeedUsageAuditingResponse = {
  inserted: number;
  date: string;
};

export type SeedUsageAuditingRequest = {
  user_id: number;
  second_user_id: number;
  tenant_id?: number;
  second_tenant_id?: number;
};

export type UsageAuditingTenant = {
  id: number;
  name: string;
  slug: string;
};

export type UsageAuditingTenants = {
  bobbyTenant: UsageAuditingTenant;
  robertTenant: UsageAuditingTenant;
};

export const METRIC_TAB_NAMES: Record<UsageStatsMetric, string> = {
  conversations: "Conversations",
  messages: "Messages",
  tokens: "Tokens",
};

export const BOBBY_TENANT = {
  name: "Bobby Analytics",
  slug: "bobby-analytics",
};
export const ROBERT_TENANT = {
  name: "Robert Analytics",
  slug: "robert-analytics",
};
export const TENANT_CONVERSATIONS_CHART_TITLE = "Tenants with most conversations";

// The usage-stats page only waits for the audit metadata before rendering; each
// chart then fires its own adhoc /api/dataset query and mounts ECharts. With six
// charts rendering at once, the chart-container mount can blow past the default
// timeout under CI CPU contention. Give the readiness assertion a generous
// budget rather than racing the render (mirrors the Cypress CHART_RENDER_TIMEOUT).
export const CHART_RENDER_TIMEOUT = 12000;

export const METRIC_CHART_TITLES: Record<UsageStatsMetric, string[]> = {
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

export type DateFilterLabel =
  | "Today"
  | "Yesterday"
  | "Last 7 days"
  | "Last 30 days"
  | "Previous month"
  | "Previous 3 months"
  | "Previous 12 months";

export const DATE_FILTER_CASES: DateFilterLabel[] = ["Today", "Last 7 days"];

// must match the title seeded by testing_api/api.clj
const SEEDED_CONVERSATION_TITLE = "E2E usage auditing conversation";

export const MAIN_PROFILE_LABELS: string[] = [
  "Internal",
  "Slackbot",
  "SQL",
  "NLQ",
  "Embedding",
  "Transforms codegen",
];

// The ECharts symbol-circle path (data-point markers on timeseries charts).
// Mirrors CIRCLE_PATH in e2e-visual-tests-helpers.js.
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

// === response predicates ===
// Cypress registered aliases once and re-`cy.wait`ed them; Playwright must
// register each waitForResponse *before* the triggering action (PORTING rule 2).
// These predicates are the shared matchers the helpers register against.

function isAuditMetadataResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/api/database/13371337/metadata"
  );
}

function isDatasetResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/dataset"
  );
}

function isConversationsResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    new URL(response.url()).pathname ===
      "/api/ee/metabot-analytics/conversations"
  );
}

function isConversationDetailResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    /^\/api\/ee\/metabot-analytics\/conversations\/.+/.test(
      new URL(response.url()).pathname,
    )
  );
}

type WaitTarget = "dataset" | "conversations";

function predicateFor(target: WaitTarget): (response: Response) => boolean {
  return target === "conversations"
    ? isConversationsResponse
    : isDatasetResponse;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// === seeding / tenant setup (ports of the spec-local cy.request helpers) ===

export async function seedUsageAuditingData(
  api: MetabaseApi,
  request: SeedUsageAuditingRequest = {
    user_id: ADMIN_USER_ID,
    second_user_id: NORMAL_USER_ID,
  },
): Promise<SeedUsageAuditingResponse> {
  const response = await api.post(
    "/api/testing/metabot/seed-usage-auditing",
    request,
  );
  return (await response.json()) as SeedUsageAuditingResponse;
}

async function createUsageAuditingTenant(
  api: MetabaseApi,
  { name, slug }: Omit<UsageAuditingTenant, "id">,
): Promise<UsageAuditingTenant> {
  const response = await api.post("/api/ee/tenant", { name, slug });
  return (await response.json()) as UsageAuditingTenant;
}

export async function setupUsageAuditingTenants(
  api: MetabaseApi,
): Promise<UsageAuditingTenants> {
  await api.updateSetting("use-tenants", true);

  const bobbyTenant = await createUsageAuditingTenant(api, BOBBY_TENANT);
  const robertTenant = await createUsageAuditingTenant(api, ROBERT_TENANT);
  await seedUsageAuditingData(api, {
    user_id: ADMIN_USER_ID,
    second_user_id: NORMAL_USER_ID,
    tenant_id: bobbyTenant.id,
    second_tenant_id: robertTenant.id,
  });
  return { bobbyTenant, robertTenant };
}

// === navigation ===

export async function visitUsageStatsPage(
  page: Page,
  path = "/admin/metabot/usage-auditing",
): Promise<void> {
  const auditMetadata = page.waitForResponse(isAuditMetadataResponse);
  await page.goto(path);
  await auditMetadata;
}

export async function visitConversationsPage(
  page: Page,
  path = "/admin/metabot/usage-auditing/conversations",
): Promise<void> {
  const conversations = page.waitForResponse(isConversationsResponse);
  await page.goto(path);
  const response = await conversations;
  expect(response.status()).toBe(200);
}

// === chart readiness ===

/** Port of getChartCard: the parent of the chart's title text. */
export function getChartCard(page: Page, title: string): Locator {
  return main(page).getByText(title, { exact: true }).locator("..");
}

/** Port of assertChartRendered: the chart card mounts its container + <svg>. */
export async function assertChartRendered(
  page: Page,
  title: string,
): Promise<void> {
  const titleEl = main(page).getByText(title, { exact: true });
  await titleEl.scrollIntoViewIfNeeded();
  await expect(titleEl).toBeVisible();

  const container = titleEl
    .locator("..")
    .getByTestId(/^(chart|row-chart)-container$/);
  await expect(container).toBeVisible({ timeout: CHART_RENDER_TIMEOUT });
  await expect(container.locator("svg").first()).toBeAttached();
}

export async function assertMetricChartsRendered(
  page: Page,
  metric: UsageStatsMetric,
): Promise<void> {
  for (const title of METRIC_CHART_TITLES[metric]) {
    await assertChartRendered(page, title);
  }
}

function getMetricTimeseriesTitle(
  metric: UsageStatsMetric,
  dateLabel: DateFilterLabel,
): string {
  const timeseriesUnit =
    dateLabel === "Today" || dateLabel === "Yesterday" ? "hour" : "day";
  return `${METRIC_TAB_NAMES[metric]} by ${timeseriesUnit}`;
}

export async function assertMetricChartsRenderedForDate(
  page: Page,
  metric: UsageStatsMetric,
  dateLabel: DateFilterLabel,
): Promise<void> {
  await assertChartRendered(page, getMetricTimeseriesTitle(metric, dateLabel));
  for (const title of METRIC_CHART_TITLES[metric].slice(1)) {
    await assertChartRendered(page, title);
  }
}

// === filters ===

export async function selectMetricTab(
  page: Page,
  metric: Exclude<UsageStatsMetric, "conversations">,
): Promise<void> {
  const dataset = page.waitForResponse(isDatasetResponse);
  await main(page)
    .getByRole("tab", { name: METRIC_TAB_NAMES[metric], exact: true })
    .click();
  await expect.poll(() => page.url()).toContain(`metric=${metric}`);
  await dataset;
}

export async function selectGroupFilter(
  page: Page,
  groupName: string,
): Promise<void> {
  const dataset = page.waitForResponse(isDatasetResponse);
  await main(page).getByTestId("conversation-filters-group-select").click();
  await selectDropdown(page)
    .getByRole("option", { name: groupName, exact: true })
    .click();
  await expect.poll(() => page.url()).toContain("group=");
  await dataset;
}

export async function selectUserFilter(
  page: Page,
  userName: string,
  waitFor: WaitTarget = "dataset",
): Promise<void> {
  const response = page.waitForResponse(predicateFor(waitFor));
  await main(page).getByTestId("conversation-filters-user-select").click();
  await selectDropdown(page)
    .getByRole("option", { name: userName, exact: true })
    .click();
  // Anchor on the select reflecting the newly chosen user before waiting (a bare
  // url check is a no-op after a drill-through, which already carries the user).
  await expect(
    main(page).getByTestId("conversation-filters-user-select"),
  ).toHaveValue(userName);
  await response;
}

export async function selectTenantFilter(
  page: Page,
  tenantName: string,
  waitFor: WaitTarget = "dataset",
): Promise<void> {
  const response = page.waitForResponse(predicateFor(waitFor));
  await main(page).getByTestId("conversation-filters-tenant-select").click();
  await selectDropdown(page)
    .getByRole("option", { name: tenantName, exact: true })
    .click();
  await expect.poll(() => page.url()).toContain("tenant=");
  await response;
}

export async function selectDateFilter(
  page: Page,
  dateLabel: DateFilterLabel,
  waitFor: WaitTarget = "dataset",
): Promise<void> {
  const response = page.waitForResponse(predicateFor(waitFor));
  await main(page).getByTestId("conversation-filters-date-select").click();
  await selectDropdown(page)
    .getByRole("option", { name: dateLabel, exact: true })
    .click();
  await expect(
    main(page).getByTestId("conversation-filters-date-select"),
  ).toHaveValue(dateLabel);
  await response;
}

// === conversations table assertions ===

export async function assertConversationTableContains(
  page: Page,
  labels: readonly string[],
): Promise<void> {
  const table = main(page).getByRole("table");
  for (const label of labels) {
    await expect(
      table.getByText(label, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
}

export async function assertConversationTableDoesNotContain(
  page: Page,
  labels: readonly string[],
): Promise<void> {
  const table = main(page).getByRole("table");
  for (const label of labels) {
    // cy.contains(label) is a case-sensitive substring — mirror with a
    // case-sensitive regex rather than getByText's case-insensitive matching.
    await expect(table.getByText(new RegExp(escapeRegExp(label)))).toHaveCount(
      0,
    );
  }
}

export async function assertTodayConversationTable(page: Page): Promise<void> {
  await assertConversationTableContains(page, [
    "Bobby Tables",
    "NLQ",
    "Slackbot",
    "Transforms codegen",
    "10.0.0.1",
    "10.0.0.6",
    "10.0.0.7",
  ]);
  await assertConversationTableDoesNotContain(page, [
    "Robert Tableton",
    "Internal",
    "10.0.0.2",
    "10.0.0.3",
    "10.0.0.99",
  ]);
}

export async function assertLatestHourConversationTable(
  page: Page,
): Promise<void> {
  await assertConversationTableContains(page, [
    "Bobby Tables",
    "Transforms codegen",
    "10.0.0.7",
  ]);
  await assertConversationTableDoesNotContain(page, [
    "Robert Tableton",
    "NLQ",
    "10.0.0.1",
    "10.0.0.2",
    "10.0.0.3",
    "10.0.0.99",
  ]);
}

export async function assertHourDateFilterInUrl(page: Page): Promise<void> {
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).search).get("date"))
    .toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:00:00~\d{4}-\d{2}-\d{2}T\d{2}:00:00$/,
    );
}

// === chart drill-through ===
// The caller registers the conversations wait BEFORE invoking these (the drill
// click lives inside), then awaits it after — see the drill tests.

/**
 * Port of clickLastTimeseriesChartDot: drill by clicking the last symbol circle
 * on a timeseries chart. Anchors on the chart being rendered first, since the
 * page only waits for audit metadata (the dataset query + ECharts render can
 * still be in flight).
 */
export async function clickLastTimeseriesChartDot(
  page: Page,
  title: string,
): Promise<void> {
  await assertChartRendered(page, title);
  const circles = getChartCard(page, title).locator(
    `path[d="${CIRCLE_PATH}"]`,
  );
  await expect(circles.first()).toBeVisible();
  await circles.last().click();
}

/**
 * Port of clickRowChartBarForLabel: drill by clicking the row-chart bar whose
 * vertical band contains the axis label's midpoint. Row charts measure their
 * size asynchronously (ExplicitSize), first rendering zero-width bars before
 * laying out at final geometry, so retry until exactly one measured
 * (non-zero-width) bar lines up with the label before clicking.
 */
export async function clickRowChartBarForLabel(
  page: Page,
  title: string,
  label: string,
): Promise<void> {
  await assertChartRendered(page, title);
  const card = getChartCard(page, title);
  const labelEl = card.getByText(label, { exact: true });
  await labelEl.scrollIntoViewIfNeeded();

  // ECharts row-chart bars carry role="graphics-symbol" — an SVG ARIA graphics
  // role Playwright's getByRole type union doesn't list, so match by attribute.
  const bars = card.locator('[role="graphics-symbol"]');
  let targetIndex = -1;
  await expect(async () => {
    const labelBox = await labelEl.boundingBox();
    expect(labelBox).not.toBeNull();
    const labelMidY = labelBox!.y + labelBox!.height / 2;

    const count = await bars.count();
    const matches: number[] = [];
    for (let i = 0; i < count; i++) {
      const barBox = await bars.nth(i).boundingBox();
      if (
        barBox &&
        barBox.width > 0 &&
        barBox.y <= labelMidY &&
        labelMidY <= barBox.y + barBox.height
      ) {
        matches.push(i);
      }
    }
    expect(matches).toHaveLength(1);
    targetIndex = matches[0];
  }).toPass();

  await bars.nth(targetIndex).click({ position: { x: 2, y: 2 } });
}

// === conversation detail ===

export async function openConversationFromProfile(
  page: Page,
  profileLabel: string,
): Promise<void> {
  const detail = page.waitForResponse(isConversationDetailResponse);
  const row = page
    .locator("tbody")
    .locator("tr")
    .filter({ hasText: profileLabel })
    .first();
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  await row.click();
  const response = await detail;
  expect(response.status()).toBe(200);
}

export async function assertConversationDetailProfile(
  page: Page,
  profileLabel: string,
): Promise<void> {
  const scope = main(page);
  await expect(
    scope.getByRole("heading", { name: SEEDED_CONVERSATION_TITLE, exact: true }),
  ).toBeVisible();
  await expect(scope.getByText(profileLabel, { exact: true }).first()).toBeVisible();
  await expect(scope.getByText("Total tokens", { exact: true })).toBeVisible();
}

/** Register a wait for the conversations-list GET before a drill click. */
export function waitForConversationsResponse(page: Page): Promise<Response> {
  return page.waitForResponse(isConversationsResponse);
}

/** Register a wait for a table-sort conversations GET before the sort click. */
export function waitForConversationsRequest(page: Page): Promise<Response> {
  return page.waitForResponse(isConversationsResponse);
}
