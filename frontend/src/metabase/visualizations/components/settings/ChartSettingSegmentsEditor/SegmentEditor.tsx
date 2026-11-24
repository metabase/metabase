import { t } from "ttag";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import { ActionIcon, Flex, Group, Icon, Stack, Tooltip } from "metabase/ui";
import { trackDynamicGoalUnset } from "metabase/visualizations/analytics";
import { getSegmentColor } from "metabase/viz-core";
import type {
  ColumnSettings,
  DatasetData,
  GoalForeignEntityRef,
  GoalSegment,
  VisualizationDisplay,
} from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";
import { useDynamicGoalSource } from "../GoalValueInput";
import { INPUT_HEIGHT } from "../constants";

import { SegmentBoundInput } from "./SegmentBoundInput";

type Props = {
  canRemove: boolean;
  colors: string[];
  data: DatasetData | undefined;
  display: VisualizationDisplay;
  formatOptions: ColumnSettings | undefined;
  goalSources: GoalForeignEntityRef[];
  index: number;
  segment: GoalSegment;
  onChange: (changes: Partial<GoalSegment>) => void;
  onRemove: () => void;
};

export function SegmentEditor({
  canRemove,
  colors,
  data,
  display,
  formatOptions,
  goalSources,
  index,
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
          display={display}
          formatOptions={formatOptions}
          goalSources={goalSources}
          id={`segment-min-${index}`}
          placeholder={t`Min`}
          value={segment.min}
          onChange={(min) => onChange({ min })}
        />

        <Flex align="center" h={INPUT_HEIGHT}>
          <Icon name="arrow_right" size={12} c="text-secondary" />
        </Flex>

        <SegmentBoundInput
          aria-label={t`Range ${index + 1} maximum`}
          data={data}
          display={display}
          formatOptions={formatOptions}
          goalSources={goalSources}
          id={`segment-max-${index}`}
          placeholder={t`Max`}
          value={segment.max}
          onChange={(max) => onChange({ max })}
        />
      </Group>
    </Stack>
  );
}
