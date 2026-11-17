import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  NotebookCell,
  NotebookCellItem,
} from "metabase/querying/notebook/components/NotebookCell";
import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  Group,
  Icon,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import Visualization from "metabase/visualizations/components/Visualization";
import { RowChart } from "metabase/visualizations/visualizations/RowChart";
import { registerVisualization } from "metabase/viz-core";
import type { IconName, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  FCT_ORDERS,
  type JoinVersionMode,
  ORDERS_TOTAL,
  PLANS,
  type Plan,
  formatMoney,
  getRevenueByPlan,
} from "./sample-data";

registerVisualization(RowChart);

const JOIN_COLOR = "background_surface-brand-strong";
const SUMMARIZE_COLOR = "core-summarize";
const JOIN_TITLE_COLOR: ColorName = "text-brand";
const SUMMARIZE_TITLE_COLOR: ColorName = "core-summarize";

type ModeCopy = {
  label: string;
  breakout: string;
  help: string;
  sql: string;
};

const getModeCopy = (mode: JoinVersionMode): ModeCopy => {
  switch (mode) {
    case "at-event":
      return {
        label: t`At order date`,
        breakout: t`Customer at order date → Plan`,
        help: t`Matches the version whose Valid From and Valid To contain the order’s main date (Order Date). Each order matches one version.`,
        sql: `LEFT JOIN dim_customer c
  ON o.customer_id = c.customer_id
 AND o.order_date >= c.valid_from
 AND (o.order_date < c.valid_to
      OR c.valid_to IS NULL)`,
      };
    case "current":
      return {
        label: t`Current`,
        breakout: t`Customer now → Plan`,
        help: t`Matches the current version (Is Current). Past orders are grouped by the plan the customer is on today.`,
        sql: `LEFT JOIN dim_customer c
  ON o.customer_id = c.customer_id
 AND c.is_current`,
      };
    case "every":
      return {
        label: t`Every version`,
        breakout: t`Dim Customer → Plan`,
        help: t`Repeats each order once per version of its customer. Use it to audit, not to sum.`,
        sql: `LEFT JOIN dim_customer c
  ON o.customer_id = c.customer_id`,
      };
  }
};

const MODES: JoinVersionMode[] = ["at-event", "current", "every"];

function getSeries(totals: Record<Plan, number>): RawSeries {
  return [
    {
      card: createMockCard({
        name: t`Revenue by plan`,
        display: "row",
        visualization_settings: {
          "graph.dimensions": ["plan"],
          "graph.metrics": ["sum"],
          "graph.show_values": true,
        },
      }),
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "plan",
            display_name: t`Plan`,
            base_type: "type/Text",
            source: "breakout",
          }),
          createMockColumn({
            name: "sum",
            display_name: t`Sum of Amount`,
            base_type: "type/Float",
            source: "aggregation",
          }),
        ],
        rows: PLANS.map((plan) => [plan, totals[plan]]),
      }),
    },
  ];
}

function NotebookStepBlock({
  title,
  titleColor,
  children,
}: {
  title: string;
  titleColor: ColorName;
  children: ReactNode;
}) {
  return (
    <Stack gap="sm">
      <Text fw="bold" c={titleColor}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function ColumnItem({
  table,
  column,
  color,
}: {
  table?: string;
  column: string;
  color: string;
}) {
  return (
    <NotebookCellItem color={color}>
      <Stack gap={2}>
        {table && (
          <Text fz={11} lh={1} c="text-primary-inverse">
            {table}
          </Text>
        )}
        <Text fw="bold" lh={1} c="text-primary-inverse">
          {column}
        </Text>
      </Stack>
    </NotebookCellItem>
  );
}

interface JoinNotebookProps {
  isHistoryAware: boolean;
  mode: JoinVersionMode;
  onModeChange: (mode: JoinVersionMode) => void;
}

function JoinNotebook({
  isHistoryAware,
  mode,
  onModeChange,
}: JoinNotebookProps) {
  const copy = getModeCopy(mode);
  return (
    <Stack gap="xl">
      <NotebookStepBlock title={t`Data`} titleColor={JOIN_TITLE_COLOR}>
        <NotebookCell color={JOIN_COLOR}>
          <NotebookCellItem
            color={JOIN_COLOR}
          >{t`Fct Orders`}</NotebookCellItem>
        </NotebookCell>
      </NotebookStepBlock>

      <NotebookStepBlock title={t`Join data`} titleColor={JOIN_TITLE_COLOR}>
        <Flex gap="sm">
          <NotebookCell color={JOIN_COLOR} flex={1}>
            <Group gap={6} wrap="nowrap">
              <NotebookCellItem color={JOIN_COLOR} disabled>
                {t`Fct Orders`}
              </NotebookCellItem>
              <Icon name="join_left_outer" c="text-brand" size={28} />
              <NotebookCellItem color={JOIN_COLOR}>
                <Group gap="xs" wrap="nowrap">
                  {t`Dim Customer`}
                  {isHistoryAware && <Icon name="history" size={14} />}
                </Group>
              </NotebookCellItem>
            </Group>
          </NotebookCell>
          <Flex align="center">
            <Text c="text-brand-strong" fw="bold">{t`on`}</Text>
          </Flex>
          <NotebookCell color={JOIN_COLOR} flex={1}>
            <Group gap="xs" wrap="nowrap">
              <ColumnItem
                table={t`Fct Orders`}
                column={t`Customer ID`}
                color={JOIN_COLOR}
              />
              <Text fw="bold" c="text-brand">
                =
              </Text>
              <ColumnItem
                table={t`Dim Customer`}
                column={t`Customer ID`}
                color={JOIN_COLOR}
              />
            </Group>
          </NotebookCell>
        </Flex>
        {isHistoryAware && (
          <NotebookCell
            color={JOIN_COLOR}
            direction="column"
            align="stretch"
            gap="sm"
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs">
                <Icon name="history" c="text-brand" />
                <Text fw="bold">{t`Match each order to the customer’s…`}</Text>
              </Group>
              <Badge
                color="brand"
                variant="light"
              >{t`Dim Customer is a history table`}</Badge>
            </Group>
            <SegmentedControl
              value={mode}
              onChange={(value) => {
                const nextMode = MODES.find((candidate) => candidate === value);
                if (nextMode) {
                  onModeChange(nextMode);
                }
              }}
              data={MODES.map((value) => ({
                value,
                label: getModeCopy(value).label,
              }))}
            />
            <Text size="sm" c="text-secondary">
              {copy.help}
            </Text>
          </NotebookCell>
        )}
      </NotebookStepBlock>

      <NotebookStepBlock
        title={t`Summarize`}
        titleColor={SUMMARIZE_TITLE_COLOR}
      >
        <Flex gap="sm">
          <NotebookCell color={SUMMARIZE_COLOR} flex={1}>
            <NotebookCellItem
              color={SUMMARIZE_COLOR}
            >{t`Sum of Amount`}</NotebookCellItem>
          </NotebookCell>
          <Flex align="center">
            <Text c="core-summarize" fw="bold">{t`by`}</Text>
          </Flex>
          <NotebookCell color={SUMMARIZE_COLOR} flex={1}>
            <NotebookCellItem color={SUMMARIZE_COLOR}>
              {isHistoryAware ? copy.breakout : t`Dim Customer → Plan`}
            </NotebookCellItem>
          </NotebookCell>
        </Flex>
      </NotebookStepBlock>
    </Stack>
  );
}

function TotalCheck({
  total,
  matchedRowCount,
}: {
  total: number;
  matchedRowCount: number;
}) {
  const isExact = total === ORDERS_TOTAL;
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Icon
        name={isExact ? "check_filled" : "warning_triangle_filled"}
        c={isExact ? "feedback-positive" : "feedback-negative"}
      />
      <Text size="sm">
        {isExact
          ? t`Total ${formatMoney(total)} matches the ${FCT_ORDERS.length} orders in Fct Orders.`
          : t`Total ${formatMoney(total)} is ${(total / ORDERS_TOTAL).toFixed(2)}× the ${formatMoney(ORDERS_TOTAL)} in Fct Orders. ${FCT_ORDERS.length} orders became ${matchedRowCount} rows after the join.`}
      </Text>
    </Group>
  );
}

function ResultPanel({
  mode,
  showSql,
}: {
  mode: JoinVersionMode;
  showSql: boolean;
}) {
  const { ref, width } = useElementSize();
  const { totals, total, matchedRowCount } = getRevenueByPlan(mode);
  return (
    <Stack gap="md" p="lg" h="100%">
      <Text fw="bold">{t`Preview`}</Text>
      <Box ref={ref} h={220}>
        {width > 0 && (
          <Visualization
            rawSeries={getSeries(totals)}
            width={width}
            height={220}
          />
        )}
      </Box>
      <TotalCheck total={total} matchedRowCount={matchedRowCount} />
      {showSql && (
        <Code block fz="xs">
          {getModeCopy(mode).sql}
        </Code>
      )}
    </Stack>
  );
}

interface QuestionHeaderProps {
  title: string;
  actionIcon: IconName;
  actionLabel: string;
}

function QuestionHeader({
  title,
  actionIcon,
  actionLabel,
}: QuestionHeaderProps) {
  return (
    <Group
      justify="space-between"
      px="lg"
      py="md"
      bd="1px solid var(--mb-color-border-neutral)"
      style={{ borderInline: 0, borderTop: 0 }}
    >
      <Stack gap={2}>
        <Text size="sm" c="text-secondary">{t`Our analytics`}</Text>
        <Title order={3}>{title}</Title>
      </Stack>
      <Group gap="sm">
        <Button leftSection={<Icon name={actionIcon} />}>{actionLabel}</Button>
        <Button variant="filled">{t`Save`}</Button>
      </Group>
    </Group>
  );
}

interface VersionAwareJoinProps {
  isHistoryAware: boolean;
  initialMode?: JoinVersionMode;
}

export function VersionAwareJoin({
  isHistoryAware,
  initialMode = "at-event",
}: VersionAwareJoinProps) {
  const [mode, setMode] = useState<JoinVersionMode>(
    isHistoryAware ? initialMode : "every",
  );
  return (
    <Flex direction="column" h="100%">
      <QuestionHeader
        title={t`Revenue by plan`}
        actionIcon="play"
        actionLabel={t`Visualize`}
      />
      <Flex flex={1} mih={0}>
        <Box flex={1} p="xl" miw={0} style={{ overflowY: "auto" }}>
          <JoinNotebook
            isHistoryAware={isHistoryAware}
            mode={mode}
            onModeChange={setMode}
          />
        </Box>
        <Box
          w={480}
          bd="1px solid var(--mb-color-border-neutral)"
          style={{ borderBlock: 0, borderRight: 0 }}
          bg="background_page-secondary"
        >
          <ResultPanel mode={mode} showSql={isHistoryAware} />
        </Box>
      </Flex>
    </Flex>
  );
}
