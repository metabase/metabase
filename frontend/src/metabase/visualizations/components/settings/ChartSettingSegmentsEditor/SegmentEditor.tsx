import { t } from "ttag";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import { ActionIcon, Box, Group, Icon, Stack, Tooltip } from "metabase/ui";
import { trackDynamicGoalUnset } from "metabase/visualizations/analytics";
import { getSegmentColor } from "metabase/viz-core";
import type {
  ColumnSettings,
  DatasetData,
  DatasetQuery,
  GoalSegment,
  ReferencedEntity,
  VisualizationDisplay,
} from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";
import { useDynamicGoalSource } from "../GoalValueInput";

import { SegmentBoundInput } from "./SegmentBoundInput";

type Props = {
  canRemove: boolean;
  colors: string[];
  data: DatasetData | undefined;
  datasetQuery: DatasetQuery | undefined;
  display: VisualizationDisplay;
  formatOptions: ColumnSettings | undefined;
  index: number;
  referencedEntities: ReferencedEntity[];
  segment: GoalSegment;
  onChange: (changes: Partial<GoalSegment>) => void;
  onRemove: () => void;
};

export function SegmentEditor({
  canRemove,
  colors,
  data,
  datasetQuery,
  display,
  formatOptions,
  index,
  referencedEntities,
  segment,
  onChange,
  onRemove,
}: Props) {
  const minSource = useDynamicGoalSource(segment.min);
  const maxSource = useDynamicGoalSource(segment.max);

  const handleRemove = () => {
    if (minSource != null) {
      trackDynamicGoalUnset(display, minSource);
    }

    if (maxSource != null) {
      trackDynamicGoalUnset(display, maxSource);
    }

    onRemove();
  };

  return (
    <Stack gap="sm">
      <ChartSettingInput
        aria-label={t`Range ${index + 1} label`}
        leftSection={
          <ColorSelector
            pillSize="small"
            value={getSegmentColor(segment)}
            colors={colors}
            onChange={(newColor) => {
              onChange({ color: newColor });
            }}
          />
        }
        placeholder={t`Value ${index + 1}`}
        rightSection={
          canRemove ? (
            <Tooltip label={t`Remove range`}>
              <ActionIcon
                aria-label={t`Remove range ${index + 1}`}
                size="sm"
                variant="subtle"
                onClick={handleRemove}
              >
                <Icon name="trash" />
              </ActionIcon>
            </Tooltip>
          ) : undefined
        }
        value={segment.label}
        onChange={(label) => onChange({ label })}
      />

      <Group align="flex-start" gap="sm" wrap="nowrap">
        <SegmentBoundInput
          aria-label={t`Range ${index + 1} minimum`}
          data={data}
          datasetQuery={datasetQuery}
          display={display}
          formatOptions={formatOptions}
          id={`segment-min-${index}`}
          placeholder={t`Min`}
          referencedEntities={referencedEntities}
          value={segment.min}
          onChange={(min) => onChange({ min })}
        />

        <Box pt={12}>
          <Icon name="arrow_right" size={12} c="text-secondary" />
        </Box>

        <SegmentBoundInput
          aria-label={t`Range ${index + 1} maximum`}
          data={data}
          datasetQuery={datasetQuery}
          display={display}
          formatOptions={formatOptions}
          id={`segment-max-${index}`}
          placeholder={t`Max`}
          referencedEntities={referencedEntities}
          value={segment.max}
          onChange={(max) => onChange({ max })}
        />
      </Group>
    </Stack>
  );
}
