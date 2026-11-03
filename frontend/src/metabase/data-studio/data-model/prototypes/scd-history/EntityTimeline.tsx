import { t } from "ttag";

import { Box, Group, Icon, Stack, Text, Timeline } from "metabase/ui";

import {
  type CustomerVersion,
  FCT_ORDERS,
  PLAN_COLORS,
  REGION_COLORS,
  TODAY,
  formatMoney,
  getVersionOn,
  getVersions,
  sum,
} from "./sample-data";

const TRACKED_ATTRIBUTES = ["plan", "region", "name"] as const;
type TrackedAttribute = (typeof TRACKED_ATTRIBUTES)[number];

type AttributeRun = {
  value: string;
  from: string;
  to: string | null;
};

const LABEL_WIDTH = 64;
const CHART_WIDTH = 720;
const LANE_HEIGHT = 22;
const TIMELINE_START = "2025-01-01";
const AXIS_TICKS = ["2025-01-01", "2025-07-01", "2026-01-01", "2026-07-01"];

function getRuns(versions: CustomerVersion[], attribute: TrackedAttribute) {
  return versions.reduce<AttributeRun[]>((runs, version) => {
    const last = runs.at(-1);
    if (last && last.value === version[attribute]) {
      return [...runs.slice(0, -1), { ...last, to: version.validTo }];
    }
    return [
      ...runs,
      {
        value: version[attribute],
        from: version.validFrom,
        to: version.validTo,
      },
    ];
  }, []);
}

interface EntityTimelineProps {
  customerId: string;
  asOf: string;
}

export function EntityTimeline({ customerId, asOf }: EntityTimelineProps) {
  const versions = getVersions(customerId);
  const orders = FCT_ORDERS.filter((order) => order.customerId === customerId);
  const chartWidth = CHART_WIDTH;
  const start = Date.parse(TIMELINE_START);
  const end = Date.parse(TODAY);
  const x = (isoDate: string) =>
    LABEL_WIDTH +
    ((Date.parse(isoDate) - start) / (end - start)) *
      (chartWidth - LABEL_WIDTH - 8);
  const maxAmount = Math.max(...orders.map((order) => order.amount));
  const changes = versions.slice(1).map((version, index) => {
    const previous = versions[index];
    return {
      date: version.validFrom,
      diffs: TRACKED_ATTRIBUTES.filter(
        (attribute) => previous[attribute] !== version[attribute],
      ).map((attribute) => ({
        attribute,
        from: previous[attribute],
        to: version[attribute],
      })),
    };
  });

  const lanes: {
    attribute: "plan" | "region";
    colorOf: (value: string) => string;
  }[] = [
    {
      attribute: "plan",
      colorOf: (value) =>
        Object.entries(PLAN_COLORS).find(([plan]) => plan === value)?.[1] ??
        "var(--mb-color-border-neutral)",
    },
    {
      attribute: "region",
      colorOf: (value) =>
        Object.entries(REGION_COLORS).find(
          ([region]) => region === value,
        )?.[1] ?? "var(--mb-color-border-neutral)",
    },
  ];

  return (
    <Stack gap="lg">
      <Group gap="xl">
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">{t`Versions`}</Text>
          <Text fw="bold" size="xl">
            {versions.length}
          </Text>
        </Stack>
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">{t`Orders`}</Text>
          <Text fw="bold" size="xl">
            {orders.length}
          </Text>
        </Stack>
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">{t`Revenue`}</Text>
          <Text fw="bold" size="xl">
            {formatMoney(sum(orders.map((order) => order.amount)))}
          </Text>
        </Stack>
      </Group>
      <Box>
        <svg viewBox={`0 0 ${chartWidth} 150`} width="100%" role="img">
          {lanes.map(({ attribute, colorOf }, laneIndex) => {
            const y = laneIndex * (LANE_HEIGHT + 6);
            return (
              <g key={attribute}>
                <text
                  x={0}
                  y={y + 15}
                  fontSize={12}
                  fill="var(--mb-color-text-secondary)"
                >
                  {attribute}
                </text>
                {getRuns(versions, attribute).map((run) => {
                  const x0 = x(run.from);
                  const x1 = x(run.to ?? TODAY);
                  return (
                    <g key={run.from}>
                      <rect
                        x={x0}
                        y={y}
                        width={Math.max(1, x1 - x0 - 2)}
                        height={LANE_HEIGHT}
                        rx={4}
                        fill={colorOf(run.value)}
                        opacity={run.to === null ? 1 : 0.55}
                      />
                      {x1 - x0 > 60 && (
                        <text
                          x={x0 + 8}
                          y={y + 15}
                          fontSize={12}
                          fontWeight={700}
                          fill="var(--mb-color-text-primary-inverse)"
                        >
                          {run.value}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          <text
            x={0}
            y={84}
            fontSize={12}
            fill="var(--mb-color-text-secondary)"
          >
            {t`orders`}
          </text>
          <line
            x1={LABEL_WIDTH}
            x2={chartWidth - 8}
            y1={108}
            y2={108}
            stroke="var(--mb-color-border-neutral)"
          />
          {versions.slice(1).map((version) => (
            <line
              key={version.customerKey}
              x1={x(version.validFrom)}
              x2={x(version.validFrom)}
              y1={60}
              y2={112}
              stroke="var(--mb-color-border-neutral-strong)"
              strokeDasharray="2 3"
            />
          ))}
          {orders.map((order) => {
            const version = getVersionOn(order.customerId, order.orderDate);
            return (
              <circle
                key={order.orderId}
                cx={x(order.orderDate)}
                cy={108 - (order.amount / maxAmount) * 38}
                r={4}
                fill={version ? PLAN_COLORS[version.plan] : "currentColor"}
              >
                <title>{`${order.orderDate} · ${formatMoney(order.amount)}`}</title>
              </circle>
            );
          })}
          {AXIS_TICKS.map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={128}
              fontSize={11}
              textAnchor="middle"
              fill="var(--mb-color-text-secondary)"
            >
              {tick.slice(0, 7)}
            </text>
          ))}
          <line
            x1={x(asOf)}
            x2={x(asOf)}
            y1={0}
            y2={114}
            stroke="var(--mb-color-core-filter)"
            strokeWidth={2}
          />
          <text
            x={Math.min(x(asOf), chartWidth - 70)}
            y={146}
            fontSize={11}
            fontWeight={700}
            textAnchor="middle"
            fill="var(--mb-color-text-filter)"
          >
            {asOf === TODAY ? t`today` : t`as of ${asOf}`}
          </text>
        </svg>
      </Box>
      <Timeline bulletSize={20} lineWidth={2}>
        {changes.map((change) => (
          <Timeline.Item
            key={change.date}
            bullet={<Icon name="history" size={12} />}
            title={change.diffs
              .map(({ attribute, from, to }) => `${attribute}: ${from} → ${to}`)
              .join(", ")}
          >
            <Text size="sm" c="text-secondary">
              {change.date}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Stack>
  );
}
