import { useMemo } from "react";
import { t } from "ttag";

import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import {
  Box,
  Flex,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";

// --- Fake data generators ---

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 2, 16);
  d.setDate(d.getDate() - (29 - i));
  return d.toISOString().slice(0, 10);
});

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const SEED_DAILY = DAYS.map((day) => ({
  day,
  conversations: rand(40, 180),
  tokens: rand(80000, 400000),
  messages: rand(120, 600),
  cost: +(Math.random() * 30 + 5).toFixed(2),
  failures: rand(0, 8),
}));

const USERS = [
  "Alice Chen",
  "Bob Martinez",
  "Carol Kim",
  "David Okafor",
  "Elena Petrov",
  "Frank Dubois",
  "Grace Yamamoto",
  "Hank Johansson",
];

const SEED_USERS = USERS.map((user) => ({
  user,
  conversations: rand(15, 120),
  tokens: rand(20000, 200000),
  messages: rand(30, 300),
  cost: +(Math.random() * 40 + 2).toFixed(2),
  failures: rand(0, 5),
}));

const GROUPS = ["Engineering", "Sales", "Marketing", "Analytics", "Executive"];

const SEED_GROUPS = GROUPS.map((group) => ({
  group,
  conversations: rand(30, 250),
  tokens: rand(50000, 500000),
  messages: rand(80, 700),
  cost: +(Math.random() * 60 + 10).toFixed(2),
  failures: rand(0, 12),
}));

const PROFILES = ["nlq", "sql-gen", "omnibot", "agent-api", "mcp"];

const SEED_PROFILES = PROFILES.map((profile) => ({
  profile,
  conversations: rand(20, 200),
  tokens: rand(30000, 300000),
  messages: rand(60, 500),
  cost: +(Math.random() * 50 + 5).toFixed(2),
  failures: rand(0, 10),
}));

// --- Scalar cards ---

function ScalarCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: string;
}) {
  return (
    <Box
      p="lg"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md, 8px)",
        backgroundColor: "var(--mb-color-background-primary)",
      }}
    >
      <Text c="text-secondary" size="sm" fw={500}>
        {label}
      </Text>
      <Text fw={700} size="xl" mt="xs">
        {value}
      </Text>
      {trend && (
        <Text c="success" size="sm" mt="xs">
          {trend}
        </Text>
      )}
    </Box>
  );
}

// --- Chart wrapper ---

function ChartCard({
  title,
  option,
  height = 280,
  onPointClick,
}: {
  title: string;
  option: any;
  height?: number;
  onPointClick?: (params: any) => void;
}) {
  const eventHandlers = useMemo(() => {
    if (!onPointClick) {
      return undefined;
    }
    return [{ eventName: "click" as const, handler: onPointClick }];
  }, [onPointClick]);

  return (
    <Box
      p="lg"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md, 8px)",
        backgroundColor: "var(--mb-color-background-primary)",
      }}
    >
      <Text fw={600} mb="md">
        {title}
      </Text>
      <EChartsRenderer
        option={option}
        width="auto"
        height={height}
        eventHandlers={eventHandlers}
      />
    </Box>
  );
}

// --- Main component ---

export function MetabotConversationStats({
  onDrillDown,
}: {
  onDrillDown: (filters: Record<string, string>) => void;
}) {
  const totals = useMemo(() => {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    return {
      conversations: sum(SEED_DAILY.map((d) => d.conversations)),
      tokens: sum(SEED_DAILY.map((d) => d.tokens)),
      messages: sum(SEED_DAILY.map((d) => d.messages)),
      cost: sum(SEED_DAILY.map((d) => d.cost)),
      failures: sum(SEED_DAILY.map((d) => d.failures)),
    };
  }, []);

  const dailyConversationsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: "category",
        data: SEED_DAILY.map((d) => d.day.slice(5)),
        axisLabel: { fontSize: 11 },
      },
      yAxis: { type: "value", axisLabel: { fontSize: 11 } },
      series: [
        {
          type: "bar",
          data: SEED_DAILY.map((d) => d.conversations),
          itemStyle: { color: "var(--mb-color-brand)", borderRadius: [3, 3, 0, 0] },
          emphasis: { itemStyle: { color: "var(--mb-color-brand-hover)" } },
        },
      ],
    }),
    [],
  );

  const dailyCostOption = useMemo(
    () => ({
      tooltip: { trigger: "axis", valueFormatter: (v: number) => `$${v.toFixed(2)}` },
      grid: { left: 55, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: "category",
        data: SEED_DAILY.map((d) => d.day.slice(5)),
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 11, formatter: (v: number) => `$${v}` },
      },
      series: [
        {
          type: "line",
          data: SEED_DAILY.map((d) => d.cost),
          smooth: true,
          lineStyle: { color: "var(--mb-color-success)", width: 2 },
          itemStyle: { color: "var(--mb-color-success)" },
          areaStyle: { color: "rgba(0,200,100,0.08)" },
        },
      ],
    }),
    [],
  );

  const byUserOption = useMemo(() => {
    const sorted = [...SEED_USERS].sort((a, b) => a.conversations - b.conversations);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 100, right: 20, top: 10, bottom: 10 },
      xAxis: { type: "value", axisLabel: { fontSize: 11 } },
      yAxis: {
        type: "category",
        data: sorted.map((u) => u.user),
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((u) => u.conversations),
          itemStyle: { color: "var(--mb-color-brand)", borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { color: "var(--mb-color-brand-hover)" } },
        },
      ],
    };
  }, []);

  const byGroupOption = useMemo(() => {
    const sorted = [...SEED_GROUPS].sort((a, b) => a.conversations - b.conversations);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 90, right: 20, top: 10, bottom: 10 },
      xAxis: { type: "value", axisLabel: { fontSize: 11 } },
      yAxis: {
        type: "category",
        data: sorted.map((g) => g.group),
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((g) => g.conversations),
          itemStyle: { color: "#A989F5", borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { color: "#8B6FE0" } },
        },
      ],
    };
  }, []);

  const byProfileOption = useMemo(
    () => ({
      tooltip: { trigger: "item" },
      grid: { left: 20, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: "category",
        data: SEED_PROFILES.map((p) => p.profile),
        axisLabel: { fontSize: 11 },
      },
      yAxis: { type: "value", axisLabel: { fontSize: 11 } },
      series: [
        {
          type: "bar",
          data: SEED_PROFILES.map((p) => p.conversations),
          itemStyle: {
            color: (params: any) => {
              const colors = ["#509EE3", "#88BF4D", "#F9D45C", "#EF8C8C", "#A989F5"];
              return colors[params.dataIndex % colors.length];
            },
            borderRadius: [3, 3, 0, 0],
          },
        },
      ],
    }),
    [],
  );

  const handleDailyClick = (params: any) => {
    if (params.name) {
      onDrillDown({ day: `2026-${params.name}` });
    }
  };

  const handleUserClick = (params: any) => {
    if (params.name) {
      onDrillDown({ user: params.name });
    }
  };

  const handleGroupClick = (params: any) => {
    if (params.name) {
      onDrillDown({ group: params.name });
    }
  };

  const handleProfileClick = (params: any) => {
    if (params.name) {
      onDrillDown({ profile: params.name });
    }
  };

  return (
    <Stack gap="lg">
      <SimpleGrid cols={5} spacing="md">
        <ScalarCard
          label={t`Conversations`}
          value={totals.conversations.toLocaleString()}
          trend={t`+12% vs last 30d`}
        />
        <ScalarCard
          label={t`Tokens`}
          value={`${(totals.tokens / 1_000_000).toFixed(1)}M`}
          trend={t`+8% vs last 30d`}
        />
        <ScalarCard
          label={t`Messages`}
          value={totals.messages.toLocaleString()}
          trend={t`+15% vs last 30d`}
        />
        <ScalarCard
          label={t`Cost`}
          value={`$${totals.cost.toFixed(2)}`}
          trend={t`+5% vs last 30d`}
        />
        <ScalarCard
          label={t`Connection Failures`}
          value={totals.failures.toLocaleString()}
        />
      </SimpleGrid>

      <SimpleGrid cols={2} spacing="md">
        <ChartCard
          title={t`Conversations by day`}
          option={dailyConversationsOption}
          onPointClick={handleDailyClick}
        />
        <ChartCard
          title={t`Cost by day`}
          option={dailyCostOption}
          onPointClick={handleDailyClick}
        />
      </SimpleGrid>

      <SimpleGrid cols={2} spacing="md">
        <ChartCard
          title={t`Conversations by user`}
          option={byUserOption}
          height={300}
          onPointClick={handleUserClick}
        />
        <ChartCard
          title={t`Conversations by group`}
          option={byGroupOption}
          height={240}
          onPointClick={handleGroupClick}
        />
      </SimpleGrid>

      <ChartCard
        title={t`Conversations by profile`}
        option={byProfileOption}
        height={240}
        onPointClick={handleProfileClick}
      />
    </Stack>
  );
}
