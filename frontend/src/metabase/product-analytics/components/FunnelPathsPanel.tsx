import { useEffect, useRef } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { Warnings } from "metabase/common/components/Warnings";
import {
  Alert,
  Box,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import { getClickActionsMode } from "../click-actions-mode";
import type { FunnelPaths } from "../funnel-paths/use-funnel-paths";
import type { Step } from "../spec/types";
import { getFunnelStepLabel } from "../sql/analyses/funnel";
import type { FunnelPathsRange } from "../sql/analyses/funnel-paths";

const CHART_HEIGHT_PX = 480;
const NO_CLICK_ACTIONS = getClickActionsMode();

type FunnelPathsPanelProps = {
  steps: readonly Step[];
  range: FunnelPathsRange;
  paths: FunnelPaths;
  /** Changes with each request to bring the paths into view. */
  focusId: number | undefined;
  onChangeRange: (range: FunnelPathsRange) => void;
};

export const FunnelPathsPanel = ({
  steps,
  range,
  paths,
  focusId,
  onChangeRange,
}: FunnelPathsPanelProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusId !== undefined) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusId]);

  return (
    <Paper
      ref={ref}
      withBorder
      p="lg"
      style={{ flexShrink: 0, scrollMarginTop: "var(--mantine-spacing-md)" }}
      aria-label={t`Paths`}
    >
      <Stack gap="lg">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Title order={4}>{t`Paths`}</Title>
            <Warnings warnings={paths.warnings} size={18} />
          </Group>
          {steps.length > 2 && (
            <RangePicker steps={steps} range={range} onChange={onChangeRange} />
          )}
        </Group>
        <FunnelPathsBody paths={paths} />
      </Stack>
    </Paper>
  );
};

type RangePickerProps = {
  steps: readonly Step[];
  range: FunnelPathsRange;
  onChange: (range: FunnelPathsRange) => void;
};

const RangePicker = ({ steps, range, onChange }: RangePickerProps) => {
  const options = steps.map((step, index) => ({
    value: String(index + 1),
    label: getFunnelStepLabel(index + 1, step.label),
  }));
  const parseStep = (value: string | null) =>
    value !== null ? parseInt(value, 10) : undefined;

  return (
    <Group gap="sm" wrap="nowrap">
      <Select
        data={options.slice(0, -1)}
        value={String(range.start)}
        allowDeselect={false}
        aria-label={t`Starting step`}
        onChange={(value) => {
          const start = parseStep(value);
          if (start !== undefined) {
            onChange({ start, end: Math.max(range.end, start + 1) });
          }
        }}
      />
      <Text c="text-secondary">{t`to`}</Text>
      <Select
        data={options.slice(range.start)}
        value={String(range.end)}
        allowDeselect={false}
        aria-label={t`Ending step`}
        onChange={(value) => {
          const end = parseStep(value);
          if (end !== undefined) {
            onChange({ ...range, end });
          }
        }}
      />
    </Group>
  );
};

const FunnelPathsBody = ({ paths }: { paths: FunnelPaths }) => {
  if (paths.error !== undefined) {
    return <Alert color="error">{paths.error}</Alert>;
  }
  if (paths.isLoading || paths.series === undefined) {
    return (
      <Box ta="center" py="xl">
        <Loader />
      </Box>
    );
  }
  if (paths.series.data.rows.length === 0) {
    return (
      <Text c="text-secondary">{t`No one reached the starting step.`}</Text>
    );
  }
  return (
    <Box h={CHART_HEIGHT_PX}>
      <Visualization
        rawSeries={[paths.series]}
        isQueryBuilder={false}
        mode={NO_CLICK_ACTIONS}
        onChangeCardAndRun={noop}
      />
    </Box>
  );
};
