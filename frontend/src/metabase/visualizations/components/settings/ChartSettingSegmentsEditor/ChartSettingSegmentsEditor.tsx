import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { Button, Icon, Stack, Text } from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getAccentColors } from "metabase/ui/colors/groups";
import type { ChartSettingSegmentsEditorProps } from "metabase/viz-core";
import {
  getGoalSegmentBounds,
  getUnansweredGoalEntities,
} from "metabase/viz-core";
import type { GoalSegment } from "metabase-types/api";

import { SegmentEditor } from "./SegmentEditor";

export const ChartSettingSegmentsEditor = ({
  data,
  datasetQuery,
  display,
  formatOptions,
  value: segments,
  onChange,
  canRemoveAll = false,
}: ChartSettingSegmentsEditorProps) => {
  const updateSegment = (index: number, changes: Partial<GoalSegment>) =>
    onChange([
      ...segments.slice(0, index),
      { ...segments[index], ...changes },
      ...segments.slice(index + 1),
    ]);

  const canRemove = segments.length > 1 || canRemoveAll;
  const colors = getColorPalette();

  const referencedEntities =
    data !== undefined
      ? getUnansweredGoalEntities(data, getGoalSegmentBounds(segments))
      : [];

  return (
    <Stack gap="lg">
      {segments.length > 0 ? (
        <Stack gap="lg">
          {segments.map((segment, index) => (
            <SegmentEditor
              key={index}
              canRemove={canRemove}
              colors={colors}
              data={data}
              datasetQuery={datasetQuery}
              display={display}
              formatOptions={formatOptions}
              index={index}
              referencedEntities={referencedEntities}
              segment={segment}
              onChange={(changes) => updateSegment(index, changes)}
              onRemove={() => {
                onChange(
                  segments.filter(
                    (_value, segmentIndex) => segmentIndex !== index,
                  ),
                );
              }}
            />
          ))}
        </Stack>
      ) : (
        <Text
          ta="center"
          c="text-secondary"
          mt="2.5rem"
          mb="3rem"
          lh="1.25rem"
        >{t`Add color ranges to make this number change color depending on it's value`}</Text>
      )}

      <Button
        size="lg"
        leftSection={<Icon name="add" />}
        fullWidth
        variant="subtle"
        onClick={() => onChange(segments.concat(newSegment(segments)))}
      >
        {t`Add a range`}
      </Button>
    </Stack>
  );
};

export function getColorPalette() {
  return [
    ...getAccentColors(),
    Color(color("feedback-negative")).hex(),
    Color(color("feedback-warning")).hex(),
    Color(color("feedback-positive")).hex(),
  ];
}

function newSegment(segments: GoalSegment[]): GoalSegment {
  const palette = getColorPalette();
  const lastSegment = segments[segments.length - 1];
  const lastMax =
    typeof lastSegment?.max === "number" && Number.isFinite(lastSegment.max)
      ? lastSegment.max
      : null;
  const lastColorIndex = lastSegment
    ? _.findIndex(palette, (color) => color === lastSegment.color)
    : -1;
  const nextColor =
    lastColorIndex >= 0
      ? palette[(lastColorIndex + 1) % palette.length]
      : palette[0];

  return {
    min: lastMax !== null ? lastMax : 0,
    max: lastMax !== null ? lastMax * 2 : 1,
    color: nextColor,
    label: "",
  };
}
