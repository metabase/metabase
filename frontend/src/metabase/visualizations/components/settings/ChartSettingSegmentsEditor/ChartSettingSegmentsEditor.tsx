import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import {
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getAccentColors } from "metabase/ui/colors/groups";
import { resolveGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData, GoalSegment, GoalValue } from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";

import { GoalValueInput, StaticGoalValueInput } from "./GoalValueInput";

export type ChartSettingSegmentsEditorProps = {
  allowQuestionReference?: boolean;
  data?: DatasetData;
  value: GoalSegment[];
  onChange: (value: GoalSegment[]) => void;
  canRemoveAll?: boolean;
};

export const ChartSettingSegmentsEditor = ({
  allowQuestionReference = false,
  data,
  value: segments,
  onChange,
  canRemoveAll = false,
}: ChartSettingSegmentsEditorProps) => {
  const onChangeProperty = (
    index: number,
    property: keyof GoalSegment,
    value: GoalValue | null,
  ) =>
    onChange([
      ...segments.slice(0, index),
      { ...segments[index], [property]: value },
      ...segments.slice(index + 1),
    ]);

  const canRemove = segments.length > 1 || canRemoveAll;
  const canReferenceEntities = allowQuestionReference && data != null;

  return (
    <Stack px="lg" gap="lg">
      {segments.length > 0 ? (
        <Stack gap="lg">
          {segments.map((segment, index) => (
            <Stack key={index} gap="sm">
              <ChartSettingInput
                placeholder={t`Value ${index + 1}`}
                value={segment.label}
                onChange={(label) => onChangeProperty(index, "label", label)}
                leftSection={
                  <ColorSelector
                    value={segment.color}
                    colors={getColorPalette()}
                    onChange={(newColor) =>
                      onChangeProperty(index, "color", newColor)
                    }
                  />
                }
                rightSection={
                  canRemove ? (
                    <Tooltip label={t`Remove range`}>
                      <UnstyledButton
                        aria-label={t`Remove range`}
                        display="flex"
                        c="text-secondary"
                        onClick={() =>
                          onChange(segments.filter((v, i) => i !== index))
                        }
                      >
                        <Icon name="trash" size={16} />
                      </UnstyledButton>
                    </Tooltip>
                  ) : undefined
                }
              />

              <Group gap="sm" wrap="nowrap" align="center">
                <Box flex={1} miw={0}>
                  {canReferenceEntities ? (
                    <GoalValueInput
                      id={`segment-min-${index}`}
                      aria-label={t`Min`}
                      placeholder={t`Min`}
                      value={segment.min}
                      onChange={(newValue) =>
                        onChangeProperty(index, "min", newValue)
                      }
                      data={data}
                      allowQuestionReference
                    />
                  ) : (
                    <StaticGoalValueInput
                      id={`segment-min-${index}`}
                      ariaLabel={t`Min`}
                      placeholder={t`Min`}
                      value={segment.min}
                      onCommit={(newValue) =>
                        onChangeProperty(index, "min", newValue)
                      }
                    />
                  )}
                </Box>
                <Icon name="arrow_right" size={12} c="text-secondary" />
                <Box flex={1} miw={0}>
                  {canReferenceEntities ? (
                    <GoalValueInput
                      id={`segment-max-${index}`}
                      aria-label={t`Max`}
                      placeholder={t`Max`}
                      value={segment.max}
                      onChange={(newValue) =>
                        onChangeProperty(index, "max", newValue)
                      }
                      data={data}
                      allowQuestionReference
                    />
                  ) : (
                    <StaticGoalValueInput
                      id={`segment-max-${index}`}
                      ariaLabel={t`Max`}
                      placeholder={t`Max`}
                      value={segment.max}
                      onCommit={(newValue) =>
                        onChangeProperty(index, "max", newValue)
                      }
                    />
                  )}
                </Box>
              </Group>

              {data != null && hasResolutionError(segment, data) && (
                <Text c="error" fz="sm">
                  {t`Couldn't load the referenced value`}
                </Text>
              )}
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
      <Group justify="center">
        <Button
          variant="subtle"
          leftSection={<Icon name="add" />}
          onClick={() => onChange(segments.concat(newSegment(segments)))}
        >
          {t`Add a range`}
        </Button>
      </Group>
    </Stack>
  );
};

function hasResolutionError(segment: GoalSegment, data: DatasetData): boolean {
  return (
    resolveGoalValue(segment.min, data).error != null ||
    resolveGoalValue(segment.max, data).error != null
  );
}

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
