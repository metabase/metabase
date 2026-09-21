/* eslint-disable jest/expect-expect -- snapshotQuery() asserts via toMatchSnapshot */
import type { DateFilterValue } from "metabase/querying/common/types";
import type { Query } from "metabase-lib";

import { buildTimeseriesBreakoutQuery } from "./ConversationsByDayChart";
import { buildAuditViewsFixture } from "./audit-views-fixture";
import { summarize } from "./query-summary";
import {
  type StatsFilters,
  buildGroupBreakoutQuery,
  buildSourceBreakoutQuery,
  buildTenantBreakoutQuery,
  tableForMetric,
} from "./query-utils";

const RELATIVE_LAST_30_DAYS: DateFilterValue = {
  type: "relative",
  unit: "day",
  value: -30,
  options: { includeCurrent: true },
};

const SPECIFIC_SINGLE_DAY: DateFilterValue = {
  type: "specific",
  operator: "=",
  values: [new Date(2026, 3, 17)],
  hasTime: false,
};

const USER_ID = 42;
const TENANT_ID = 7;
const GROUP_ID = 5;

const METRICS = ["conversations", "messages", "tokens"] as const;

const ALL_FILTERS: Partial<StatsFilters> = {
  dateFilter: RELATIVE_LAST_30_DAYS,
  userId: USER_ID,
  tenantId: TENANT_ID,
  groupId: GROUP_ID,
};

const fx = buildAuditViewsFixture();

const dataSources = (metric: StatsFilters["metric"]) => ({
  provider: fx.provider,
  table: tableForMetric(metric, fx.conversations, fx.usageLog),
  groupMembersTable: fx.groupMembers,
});

const filtersFor = (
  metric: StatsFilters["metric"],
  overrides: Partial<StatsFilters> = {},
): StatsFilters => ({
  metric,
  dateFilter: RELATIVE_LAST_30_DAYS,
  ...overrides,
});

const snapshotQuery = (q: Query) => {
  expect(summarize(q)).toMatchSnapshot();
};

describe("buildSourceBreakoutQuery", () => {
  describe("by metric", () => {
    it.each(METRICS)("%s", (metric) =>
      snapshotQuery(
        buildSourceBreakoutQuery({
          ...filtersFor(metric),
          ...dataSources(metric),
          breakoutColumn: "source_name",
        }),
      ),
    );
  });

  describe("single filter", () => {
    it.each([
      {
        name: "dateFilter specific",
        overrides: { dateFilter: SPECIFIC_SINGLE_DAY },
      },
      { name: "userId", overrides: { userId: USER_ID } },
      { name: "tenantId", overrides: { tenantId: TENANT_ID } },
      { name: "groupId", overrides: { groupId: GROUP_ID } },
    ])("$name", ({ overrides }) =>
      snapshotQuery(
        buildSourceBreakoutQuery({
          ...filtersFor("conversations", overrides),
          ...dataSources("conversations"),
          breakoutColumn: "source_name",
        }),
      ),
    );
  });

  describe("by breakoutColumn", () => {
    it.each(["profile_name", "user_display_name", "ip_address"] as const)(
      "%s",
      (breakoutColumn) =>
        snapshotQuery(
          buildSourceBreakoutQuery({
            ...filtersFor("conversations"),
            ...dataSources("conversations"),
            breakoutColumn,
          }),
        ),
    );
  });

  it("all filters", () =>
    snapshotQuery(
      buildSourceBreakoutQuery({
        ...filtersFor("tokens", ALL_FILTERS),
        ...dataSources("tokens"),
        breakoutColumn: "source_name",
      }),
    ));
});

describe("buildGroupBreakoutQuery", () => {
  describe("by metric", () => {
    it.each(METRICS)("%s", (metric) =>
      snapshotQuery(
        buildGroupBreakoutQuery({
          ...filtersFor(metric),
          ...dataSources(metric),
          excludeAllUsers: true,
        }),
      ),
    );
  });

  it("excludeAllUsers=false", () =>
    snapshotQuery(
      buildGroupBreakoutQuery({
        ...filtersFor("conversations"),
        ...dataSources("conversations"),
        excludeAllUsers: false,
      }),
    ));

  it("all filters", () =>
    snapshotQuery(
      buildGroupBreakoutQuery({
        ...filtersFor("tokens", ALL_FILTERS),
        ...dataSources("tokens"),
        excludeAllUsers: true,
      }),
    ));
});

describe("buildTenantBreakoutQuery", () => {
  describe("by metric", () => {
    it.each(METRICS)("%s", (metric) =>
      snapshotQuery(
        buildTenantBreakoutQuery({
          ...filtersFor(metric),
          ...dataSources(metric),
        }),
      ),
    );
  });

  it("all filters", () =>
    snapshotQuery(
      buildTenantBreakoutQuery({
        ...filtersFor("tokens", ALL_FILTERS),
        ...dataSources("tokens"),
      }),
    ));
});

describe("buildTimeseriesBreakoutQuery", () => {
  describe("by metric", () => {
    it.each(METRICS)("%s", (metric) =>
      snapshotQuery(
        buildTimeseriesBreakoutQuery({
          ...filtersFor(metric),
          ...dataSources(metric),
          bucketName: "day",
        }),
      ),
    );
  });

  it("bucket by hour", () =>
    snapshotQuery(
      buildTimeseriesBreakoutQuery({
        ...filtersFor("conversations", { dateFilter: SPECIFIC_SINGLE_DAY }),
        ...dataSources("conversations"),
        bucketName: "hour",
      }),
    ));

  it("all filters", () =>
    snapshotQuery(
      buildTimeseriesBreakoutQuery({
        ...filtersFor("tokens", ALL_FILTERS),
        ...dataSources("tokens"),
        bucketName: "day",
      }),
    ));
});
