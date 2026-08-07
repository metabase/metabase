import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getAccentColors } from "metabase/ui/colors/groups";
import type { DatasetData, GoalSegment } from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";

import { SegmentBoundInput } from "./SegmentBoundInput";

const REMOVE_BUTTON_SIZE = 24;
// centers the 12px arrow against the 40px bound inputs next to it
const ARROW_TOP_OFFSET = 14;

export type ChartSettingSegmentsEditorProps = {
  /** Present only for charts whose bounds may reference a column or another entity. */
  data?: DatasetData;
  /** False where another entity's value could never be resolved, e.g. on a dashcard. */
  canReferenceOtherEntities?: boolean;
  value: GoalSegment[];
  onChange: (value: GoalSegment[]) => void;
  canRemoveAll?: boolean;
};

export const ChartSettingSegmentsEditor = ({
  data,
  canReferenceOtherEntities = true,
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

  return (
    <Stack px="lg" gap="lg">
      {segments.length > 0 ? (
        <Stack gap="lg">
          {segments.map((segment, index) => (
            <Stack key={index} gap="sm">
              <ChartSettingInput
                aria-label={t`Range ${index + 1} label`}
                placeholder={t`Value ${index + 1}`}
                value={segment.label}
                onChange={(label) => updateSegment(index, { label })}
                leftSection={
                  <ColorSelector
                    pillSize="small"
                    value={segment.color}
                    colors={getColorPalette()}
                    onChange={(newColor) =>
                      updateSegment(index, { color: newColor })
                    }
                  />
                }
                rightSection={
                  canRemove ? (
                    <Tooltip label={t`Remove range`}>
                      <ActionIcon
                        aria-label={t`Remove range ${index + 1}`}
                        size={REMOVE_BUTTON_SIZE}
                        onClick={() =>
                          onChange(segments.filter((v, i) => i !== index))
                        }
                      >
                        <Icon name="trash" size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
              />

              <Group gap="sm" wrap="nowrap" align="flex-start">
                <SegmentBoundInput
                  id={`segment-min-${index}`}
                  ariaLabel={t`Range ${index + 1} minimum`}
                  placeholder={t`Min`}
                  value={segment.min}
                  data={data}
                  canReferenceOtherEntities={canReferenceOtherEntities}
                  onChange={(min) => updateSegment(index, { min })}
                />
                <Icon
                  name="arrow_right"
                  size={12}
                  c="text-secondary"
                  mt={ARROW_TOP_OFFSET}
                />
                <SegmentBoundInput
                  id={`segment-max-${index}`}
                  ariaLabel={t`Range ${index + 1} maximum`}
                  placeholder={t`Max`}
                  value={segment.max}
                  data={data}
                  canReferenceOtherEntities={canReferenceOtherEntities}
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
        variant="subtle"
        fullWidth
        leftSection={<Icon name="add" />}
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
    min: lastMax ?? 0,
    max: lastMax !== null ? lastMax * 2 : 1,
    color: nextColor,
    label: "",
  };
}
