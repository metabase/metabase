import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route, withRouteProps } from "metabase/router";
import type { ClickObject } from "metabase-lib";
import type { Dataset, RawSeries, RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { AUDIT_DB_ID } from "../../constants";
import {
  ADMIN_GROUP,
  ALL_USERS_GROUP,
  BOBBY,
  BOBBY_TENANT,
  DATA_GROUP,
  ROBERT,
  ROBERT_TENANT,
  selectFilterOption,
} from "../../tests/fixtures";

import { ConversationStatsPage } from "./ConversationStatsPage";
import { buildAuditViewsFixture } from "./audit-views-fixture";

jest.mock("metabase/admin/ai/MetabotAdminLayout", () => ({
  MetabotAdminLayout: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("metabase/visualizations/components/Visualization", () => {
  type StubProps = {
    rawSeries?: RawSeries | null;
    handleVisualizationClick?: (clicked: ClickObject | null) => void;
  };

  const StubVisualization = ({
    rawSeries,
    handleVisualizationClick,
  }: StubProps) => {
    const data = rawSeries?.[0]?.data;
    const dimensionIndex =
      data?.cols.findIndex((col) => col.source === "breakout") ?? -1;

    if (!data || dimensionIndex < 0) {
      return <div data-testid="visualization" />;
    }

    const dimensionColumn = data.cols[dimensionIndex];

    return (
      <div data-testid="visualization">
        {data.rows.map((row, index) => (
          <button
            key={index}
            onClick={() =>
              handleVisualizationClick?.({
                dimensions: [
                  { value: row[dimensionIndex], column: dimensionColumn },
                ],
              })
            }
          >
            {String(row[dimensionIndex])}
          </button>
        ))}
      </div>
    );
  };

  return { __esModule: true, default: StubVisualization };
});

const RoutedConversationStatsPage = withRouteProps(ConversationStatsPage);

const STATS_PATH = "/admin/metabot/usage-auditing";
const CONVERSATIONS_PATH = "/admin/metabot/usage-auditing/conversations";

const { database: auditDatabase } = buildAuditViewsFixture();

const FIELD_NAME_BY_ID = new Map(
  (auditDatabase.tables ?? []).flatMap((table) =>
    (table.fields ?? []).map(
      (field) => [Number(field.id), field.name] as const,
    ),
  ),
);

function fieldIdByName(tableName: string, fieldName: string): number {
  const table = auditDatabase.tables?.find(({ name }) => name === tableName);
  const field = table?.fields?.find(({ name }) => name === fieldName);
  if (field == null) {
    throw new Error(`No field ${tableName}.${fieldName} in the audit fixture`);
  }
  return Number(field.id);
}

const CONVERSATIONS_USER_ID_FIELD_ID = fieldIdByName(
  "v_metabot_conversations",
  "user_id",
);
const CONVERSATIONS_TENANT_ID_FIELD_ID = fieldIdByName(
  "v_metabot_conversations",
  "tenant_id",
);

const DAY_BUCKETS = ["2026-04-15T00:00:00", "2026-04-16T00:00:00"];
const HOUR_BUCKETS = ["2026-04-17T09:00:00", "2026-04-17T10:00:00"];
const SINGLE_DAY = "2026-04-17";

const BREAKOUT_VALUES: Record<string, RowValue[]> = {
  source_name: ["Slackbot", "Internal"],
  profile_name: ["NLQ", "SQL"],
  user_display_name: ["Bobby Tables", "Robert Tableton"],
  ip_address: ["10.0.0.1", "10.0.0.2"],
  tenant_id: [BOBBY_TENANT.id, ROBERT_TENANT.id],
  group_name: ["Administrators", "data"],
};

type FieldRef = [string, { "temporal-unit"?: string }, number];
type FilterClause = [string, object, FieldRef, ...unknown[]];
type RequestStage = {
  aggregation?: unknown[];
  breakout?: FieldRef[];
  filters?: FilterClause[];
  joins?: unknown[];
};

function parseStage(body: unknown): RequestStage | null {
  if (typeof body !== "string") {
    return null;
  }
  return JSON.parse(body).stages?.[0] ?? null;
}

function getBreakoutValues(stage: RequestStage): RowValue[] {
  const [breakout] = stage.breakout ?? [];
  if (!breakout) {
    return [];
  }
  const columnName = FIELD_NAME_BY_ID.get(breakout[2]);
  if (columnName === "created_at") {
    return breakout[1]?.["temporal-unit"] === "hour"
      ? HOUR_BUCKETS
      : DAY_BUCKETS;
  }
  const values = BREAKOUT_VALUES[columnName ?? ""];
  if (!values) {
    throw new Error(
      `Unexpected breakout column in dataset request: ${String(columnName)}`,
    );
  }
  return values;
}

function buildDatasetResponse(body: unknown): Dataset {
  const stage = parseStage(body);
  const values = stage ? getBreakoutValues(stage) : [];
  const aggregationNames =
    (stage?.aggregation ?? []).length > 1 ? ["sum", "sum_2"] : ["count"];

  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ source: "breakout", name: "dimension" }),
        ...aggregationNames.map((name) =>
          createMockColumn({ source: "aggregation", name }),
        ),
      ],
      rows: values.map((value, index) => [
        value,
        ...aggregationNames.map((_, offset) => (index + 1) * 10 + offset),
      ]),
    }),
    database_id: AUDIT_DB_ID,
    row_count: values.length,
  });
}

function getDatasetStages(): RequestStage[] {
  return fetchMock.callHistory
    .calls("dataset")
    .map((call) => parseStage(call.options?.body))
    .filter((stage): stage is RequestStage => stage != null);
}

function getFilteredFieldIds(): number[] {
  return getDatasetStages().flatMap((stage) =>
    (stage.filters ?? []).map((filter) => filter[2]?.[2]),
  );
}

type SetupOpts = {
  initialRoute?: string;
  hasTenants?: boolean;
};

function setup({
  initialRoute = STATS_PATH,
  hasTenants = false,
}: SetupOpts = {}) {
  setupEnterprisePlugins();

  fetchMock.get(`path:/api/database/${AUDIT_DB_ID}/metadata`, auditDatabase);
  fetchMock.post(
    "path:/api/dataset",
    (call) => buildDatasetResponse(call?.options.body),
    { name: "dataset" },
  );
  setupUsersEndpoints([BOBBY, ROBERT]);
  setupGroupsEndpoint([ALL_USERS_GROUP, ADMIN_GROUP, DATA_GROUP]);
  setupTenantEntpoints([BOBBY_TENANT, ROBERT_TENANT]);

  return renderWithProviders(
    <>
      <Route path={STATS_PATH} element={<RoutedConversationStatsPage />} />
      <Route
        path={CONVERSATIONS_PATH}
        element={<div data-testid="conversations-page" />}
      />
    </>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            audit_app: true,
            tenants: hasTenants,
          }),
          "use-tenants": hasTenants,
        }),
      }),
    },
  );
}

async function findChartCard(title: string): Promise<HTMLElement> {
  const { parentElement } = await screen.findByText(title);
  if (!parentElement) {
    throw new Error(`No chart card found for "${title}"`);
  }
  return parentElement;
}

async function drillInto(chartTitle: string, dimensionLabel: string) {
  const card = await findChartCard(chartTitle);
  await userEvent.click(
    await within(card).findByRole("button", { name: dimensionLabel }),
  );
}

function chartTitles(label: string): string[] {
  const lowerLabel = label.toLowerCase();
  return [
    `${label} by day`,
    `${label} by source`,
    `${label} by profile`,
    `Groups with most ${lowerLabel}`,
    `Users with most ${lowerLabel}`,
    `IP addresses with most ${lowerLabel}`,
  ];
}

describe("ConversationStatsPage", () => {
  describe("charts", () => {
    it("renders every conversation chart with the Conversations tab selected", async () => {
      setup();

      expect(
        await screen.findByRole("heading", { name: "Usage stats" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Conversations" }),
      ).toHaveAttribute("aria-selected", "true");

      for (const title of chartTitles("Conversations")) {
        expect(await screen.findByText(title)).toBeInTheDocument();
      }
    });

    it.each([
      { tab: "Tokens", metric: "tokens" },
      { tab: "Messages", metric: "messages" },
    ])(
      "switches to the $metric charts and records the metric in the url",
      async ({ tab, metric }) => {
        const { history } = setup();

        await screen.findByText("Conversations by day");
        await userEvent.click(screen.getByRole("tab", { name: tab }));

        expect(screen.getByRole("tab", { name: tab })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        for (const title of chartTitles(tab)) {
          expect(await screen.findByText(title)).toBeInTheDocument();
        }
        await waitFor(() => {
          expect(history?.getCurrentLocation().query).toMatchObject({
            metric,
          });
        });
      },
    );

    it("buckets the timeseries by hour for a single-day date filter", async () => {
      setup({ initialRoute: `${STATS_PATH}?date=${SINGLE_DAY}` });

      expect(
        await screen.findByText("Conversations by hour"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Conversations by day"),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByText("Users with most conversations"),
      ).toBeInTheDocument();
    });

    it("buckets the timeseries by hour after picking the Today shortcut", async () => {
      setup();

      await screen.findByText("Conversations by day");
      await selectFilterOption("conversation-filters-date-select", "Today");

      expect(
        await screen.findByText("Conversations by hour"),
      ).toBeInTheDocument();
    });

    it("keeps daily buckets after picking a multi-day shortcut", async () => {
      setup({ initialRoute: `${STATS_PATH}?date=${SINGLE_DAY}` });

      await screen.findByText("Conversations by hour");
      await selectFilterOption(
        "conversation-filters-date-select",
        "Last 7 days",
      );

      expect(
        await screen.findByText("Conversations by day"),
      ).toBeInTheDocument();
    });
  });

  describe("tenants", () => {
    it("hides the tenant filter and tenant chart when tenants are disabled", async () => {
      setup();

      await screen.findByText("Conversations by day");

      expect(
        screen.queryByTestId("conversation-filters-tenant-select"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Tenants with most conversations"),
      ).not.toBeInTheDocument();
    });

    it("shows the tenant filter and labels tenant bars with tenant names", async () => {
      setup({ hasTenants: true });

      expect(
        await screen.findByDisplayValue("All tenants"),
      ).toBeInTheDocument();

      const card = await findChartCard("Tenants with most conversations");
      expect(
        await within(card).findByRole("button", { name: BOBBY_TENANT.name }),
      ).toBeInTheDocument();
      expect(
        within(card).getByRole("button", { name: ROBERT_TENANT.name }),
      ).toBeInTheDocument();
    });

    it("filters the charts by the selected tenant", async () => {
      const { history } = setup({ hasTenants: true });

      await screen.findByText("Conversations by day");
      await selectFilterOption(
        "conversation-filters-tenant-select",
        BOBBY_TENANT.name,
      );

      await waitFor(() => {
        expect(history?.getCurrentLocation().query).toMatchObject({
          tenant: String(BOBBY_TENANT.id),
        });
      });
      await waitFor(() => {
        expect(getFilteredFieldIds()).toContain(
          CONVERSATIONS_TENANT_ID_FIELD_ID,
        );
      });
    });
  });

  describe("filters", () => {
    it("applies the selected user to the url and to the chart queries", async () => {
      const { history } = setup();

      await screen.findByText("Conversations by day");
      await selectFilterOption(
        "conversation-filters-user-select",
        "Robert Tableton",
      );

      await waitFor(() => {
        expect(history?.getCurrentLocation().query).toMatchObject({
          user: String(ROBERT.id),
        });
      });
      await waitFor(() => {
        expect(getFilteredFieldIds()).toContain(CONVERSATIONS_USER_ID_FIELD_ID);
      });
    });

    it("joins group members when a group is selected", async () => {
      const { history } = setup();

      await screen.findByText("Conversations by day");
      await selectFilterOption("conversation-filters-group-select", "data");

      await waitFor(() => {
        expect(history?.getCurrentLocation().query).toMatchObject({
          group: String(DATA_GROUP.id),
        });
      });
      await waitFor(() => {
        const joinedStages = getDatasetStages().filter(
          (stage) => (stage.joins ?? []).length > 0,
        );
        expect(joinedStages.length).toBeGreaterThan(0);
      });
    });
  });

  describe("drill-through to the conversations list", () => {
    it.each([
      {
        chart: "Users with most conversations",
        label: "Bobby Tables",
        query: { user: String(BOBBY.id) },
      },
      {
        chart: "Groups with most conversations",
        label: "Administrators",
        query: { group: String(ADMIN_GROUP.id) },
      },
      {
        chart: "Tenants with most conversations",
        label: BOBBY_TENANT.name,
        query: { tenant: String(BOBBY_TENANT.id) },
        setupOpts: { hasTenants: true },
      },
      {
        chart: "Conversations by day",
        label: "2026-04-16T00:00:00",
        query: { date: "2026-04-16" },
      },
      {
        chart: "Conversations by hour",
        label: "2026-04-17T10:00:00",
        query: { date: "2026-04-17T10:00:00~2026-04-17T11:00:00" },
        setupOpts: { initialRoute: `${STATS_PATH}?date=${SINGLE_DAY}` },
      },
    ])(
      "drills from the $chart chart",
      async ({ chart, label, query, setupOpts }) => {
        const { history } = setup(setupOpts);

        await drillInto(chart, label);

        expect(history?.getCurrentLocation().pathname).toBe(CONVERSATIONS_PATH);
        expect(history?.getCurrentLocation().query).toEqual(query);
      },
    );

    it("carries the active filters over to the conversations list", async () => {
      const { history } = setup({
        initialRoute: `${STATS_PATH}?date=past6days~&group=${ADMIN_GROUP.id}`,
      });

      await drillInto("Users with most conversations", "Bobby Tables");

      expect(history?.getCurrentLocation().query).toEqual({
        date: "past6days~",
        group: String(ADMIN_GROUP.id),
        user: String(BOBBY.id),
      });
    });

    it("does not drill on charts without a dimension handler", async () => {
      const { history } = setup();

      await drillInto("IP addresses with most conversations", "10.0.0.1");

      expect(history?.getCurrentLocation().pathname).toBe(STATS_PATH);
    });
  });
});
