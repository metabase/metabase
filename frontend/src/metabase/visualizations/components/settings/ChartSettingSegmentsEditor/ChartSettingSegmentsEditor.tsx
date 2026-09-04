import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getAccentColors } from "metabase/ui/colors/groups";
import type { ChartSettingSegmentsEditorProps } from "metabase/viz-core";
import { getSegmentColor, getUnansweredGoalEntities } from "metabase/viz-core";
import type { GoalSegment } from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";
import { ICON_BUTTON_SIZE } from "../GoalValueInput/constants";

import { SegmentBoundInput } from "./SegmentBoundInput";

export const ChartSettingSegmentsEditor = ({
  data,
  datasetQuery,
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

  const referencedEntities =
    data != null ? getUnansweredGoalEntities(data, segments) : [];

  return (
    <Stack gap="lg">
      {segments.length > 0 ? (
        <Stack gap="lg">
          {segments.map((segment, index) => (
            <Stack gap="sm" key={index}>
              <ChartSettingInput
                aria-label={t`Range ${index + 1} label`}
                leftSection={
                  <ColorSelector
                    pillSize="small"
                    value={getSegmentColor(segment)}
                    colors={getColorPalette()}
                    onChange={(newColor) => {
                      updateSegment(index, { color: newColor });
                    }}
                  />
                }
                placeholder={t`Value ${index + 1}`}
                rightSection={
                  canRemove ? (
                    <Tooltip label={t`Remove range`}>
                      <ActionIcon
                        aria-label={t`Remove range ${index + 1}`}
                        size={ICON_BUTTON_SIZE}
                        onClick={() => {
                          const newSegments = segments.filter(
                            (_v, segmentIndex) => segmentIndex !== index,
                          );
                          onChange(newSegments);
                        }}
                      >
                        <Icon name="trash" />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
                value={segment.label}
                onChange={(label) => updateSegment(index, { label })}
              />

              <Group align="flex-start" gap="sm" wrap="nowrap">
                <SegmentBoundInput
                  aria-label={t`Range ${index + 1} minimum`}
                  data={data}
                  datasetQuery={datasetQuery}
                  id={`segment-min-${index}`}
                  placeholder={t`Min`}
                  referencedEntities={referencedEntities}
                  value={segment.min}
                  onChange={(min) => updateSegment(index, { min })}
                />

                <Box pt={12}>
                  <Icon name="arrow_right" size={12} c="text-secondary" />
                </Box>

                <SegmentBoundInput
                  aria-label={t`Range ${index + 1} maximum`}
                  data={data}
                  datasetQuery={datasetQuery}
                  id={`segment-max-${index}`}
                  placeholder={t`Max`}
                  referencedEntities={referencedEntities}
                  value={segment.max}
                  onChange={(max) => updateSegment(index, { max })}
                />
              </Group>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Text
          ta="center"
          c="text-secondary"
          mt="2.5rem"
          mb="3rem"
          lh="1.25rem"
          px="1.5rem"
        >{t`Add color ranges to make this number change color depending on it's value`}</Text>
      )}

      <Button
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

function getColorPalette() {
  return [
    ...getAccentColors(),
    Color(color("feedback-negative")).hex(),
    Color(color("feedback-warning")).hex(),
    Color(color("feedback-positive")).hex(),
    Color(color("background_page-tertiary")).hex(),
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
