import { t } from "ttag";
import { noop } from "underscore";

import { Alert, Box, Group, Loader, Select, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { Legend } from "metabase/visualizations/components/legend/Legend";
import { getPathColors } from "metabase/viz-core";

import type { FunnelPaths } from "../../funnel-paths/use-funnel-paths";
import type { Step } from "../../spec/types";
import { getFunnelStepLabel } from "../../sql/analyses/funnel";
import {
  type FunnelPathsRange,
  getOutcomeLabels,
} from "../../sql/analyses/funnel-paths";

import { NO_CLICK_ACTIONS, SupportingPanel } from "./SupportingPanel";

const CHART_HEIGHT_PX = 480;

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
}: FunnelPathsPanelProps) => (
  <SupportingPanel
    title={t`Paths`}
    focusId={focusId}
    controls={
      steps.length > 2 ? (
        <RangePicker steps={steps} range={range} onChange={onChangeRange} />
      ) : undefined
    }
  >
    <FunnelPathsBody paths={paths} />
  </SupportingPanel>
);

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
    <Stack gap="md">
      <PathsLegend />
      <Box h={CHART_HEIGHT_PX}>
        <Visualization
          rawSeries={[paths.series]}
          isQueryBuilder={false}
          mode={NO_CLICK_ACTIONS}
          onChangeCardAndRun={noop}
        />
      </Box>
    </Stack>
  );
};

/** How the flows are colored. The events' colors are subtler, and left to the docs. */
const PathsLegend = () => {
  const colors = getPathColors();
  const outcomes = getOutcomeLabels();
  return (
    <Legend
      items={[
        { key: "converted", color: colors.converted, name: outcomes.converted },
        { key: "dropped", color: colors.dropped, name: outcomes.notConverted },
      ]}
    />
  );
};
