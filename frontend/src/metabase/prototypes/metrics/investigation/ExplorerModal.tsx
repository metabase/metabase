import { useState } from "react";

import {
  Badge,
  Box,
  Button,
  FixedSizeIcon,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";

import { MultiLineChart } from "./TrendChart";
import {
  type InvestigationNode,
  SERIES_COLORS,
  type Series,
  breakoutSeriesOf,
  formatValue,
  seriesOf,
} from "./data";

type Filter = { tabId: string; prefix: string; label: string };

const TIME_TAB = "time";

/**
 * The Metric Explorer opened from investigation mode, with the node, breakout
 * and focus it was opened with. Mock numbers, same as the tree.
 */
export function ExplorerModal({
  node,
  initialTabId,
  filter,
  periodLabel,
  onClose,
}: {
  node: InvestigationNode;
  initialTabId: string;
  filter: Filter | null;
  periodLabel: string;
  onClose: () => void;
}) {
  const [tabId, setTabId] = useState(initialTabId);
  const filterItem = filter
    ? node.breakouts
        .find((tab) => tab.id === filter.tabId)
        ?.items.find((item) => item.label === filter.label)
    : undefined;
  const scale = filterItem?.share ?? 1;
  const tab = node.breakouts.find((candidate) => candidate.id === tabId);

  const series: Series[] = !tab
    ? [{ label: node.name, values: seriesOf(node, scale) }]
    : breakoutSeriesOf(node, tab, tab.id === filter?.tabId ? 1 : scale).filter(
        (line) => tab.id !== filter?.tabId || line.label === filter.label,
      );

  return (
    <Modal
      opened
      onClose={onClose}
      size="80rem"
      padding="xl"
      title={
        <Group gap="sm">
          <FixedSizeIcon name="external" c="text-secondary" />
          <Text fw={700}>Metric Explorer</Text>
        </Group>
      }
    >
      <Stack gap="lg">
        <Group gap="sm">
          <Badge
            size="lg"
            variant="light"
            color={node.kind === "metric" ? "brand" : "summarize"}
            leftSection={
              <FixedSizeIcon
                name={node.kind === "metric" ? "metric" : "ruler"}
                size={12}
              />
            }
            style={{ textTransform: "none" }}
          >
            {node.name}
          </Badge>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<FixedSizeIcon name="add" />}
          >
            Add metric
          </Button>
        </Group>

        <Group gap="sm">
          <Badge
            size="lg"
            variant="default"
            leftSection={<FixedSizeIcon name="calendar" size={12} />}
            style={{ textTransform: "none" }}
          >
            {periodLabel}
          </Badge>
          {filter && (
            <Badge
              size="lg"
              variant="default"
              leftSection={<FixedSizeIcon name="filter" size={12} />}
              style={{ textTransform: "none" }}
            >
              {filter.prefix} {filter.label}
            </Badge>
          )}
          <Button
            variant="subtle"
            size="xs"
            leftSection={<FixedSizeIcon name="filter" />}
          >
            Add filter
          </Button>
        </Group>

        <SegmentedControl
          value={tabId}
          onChange={setTabId}
          data={[
            { value: TIME_TAB, label: "Time" },
            ...node.breakouts.map((breakout) => ({
              value: breakout.id,
              label: breakout.label,
            })),
          ]}
          style={{ alignSelf: "flex-start" }}
        />

        <Box>
          <MultiLineChart
            series={series}
            format={(value) => formatValue(node, value)}
          />
          {tab && <Legend series={series} />}
        </Box>
      </Stack>
    </Modal>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <Group gap="md" mt="sm">
      {series.map((line, i) => (
        <Group key={line.label} gap={6} wrap="nowrap">
          <Box
            w={10}
            h={10}
            style={{
              borderRadius: 2,
              background: SERIES_COLORS[i % SERIES_COLORS.length],
            }}
          />
          <Text fz="xs" c="text-secondary">
            {line.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}
