import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import {
  Box,
  Button,
  Card,
  Group,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getAccentColors } from "metabase/ui/colors/groups";
import type { DatasetColumn, GoalSegment, GoalValue } from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";

import S from "./ChartSettingSegmentsEditor.module.css";
import { SegmentBoundInput } from "./SegmentBoundInput";

export type ChartSettingSegmentsEditorProps = {
  allowQuestionReference?: boolean;
  columns?: DatasetColumn[];
  value: GoalSegment[];
  onChange: (value: GoalSegment[]) => void;
  canRemoveAll?: boolean;
};

export const ChartSettingSegmentsEditor = ({
  allowQuestionReference = false,
  columns,
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

  return (
    <Stack px="lg">
      {segments.length > 0 ? (
        <Stack>
          {segments.map((segment, index) => (
            <Card key={index} shadow="none" withBorder>
              <Stack>
                <Group align="center" gap="sm" wrap="nowrap">
                  <ColorSelector
                    pillSize="large"
                    className={S.ColorPill}
                    value={segment.color}
                    colors={getColorPalette()}
                    onChange={(color) =>
                      onChangeProperty(index, "color", color)
                    }
                  />

                  <Box flex={1} miw={0}>
                    <ChartSettingInput
                      placeholder={t`Label for this range (optional)`}
                      value={segment.label}
                      onChange={(val) => onChangeProperty(index, "label", val)}
                    />
                  </Box>

                  {canRemove && (
                    <Tooltip label={t`Remove range`}>
                      <Button
                        aria-label={t`Remove range`}
                        leftSection={<Icon name="trash" c="text-disabled" />}
                        onClick={() =>
                          onChange(segments.filter((v, i) => i !== index))
                        }
                      />
                    </Tooltip>
                  )}
                </Group>

                <SimpleGrid cols={2} spacing="sm">
                  <SegmentBoundInput
                    id={`segment-min-${index}`}
                    label={t`Min`}
                    value={segment.min}
                    onChange={(value) => onChangeProperty(index, "min", value)}
                    columns={columns}
                    allowQuestionReference={allowQuestionReference}
                  />

                  <SegmentBoundInput
                    id={`segment-max-${index}`}
                    label={t`Max`}
                    value={segment.max}
                    onChange={(value) => onChangeProperty(index, "max", value)}
                    columns={columns}
                    allowQuestionReference={allowQuestionReference}
                  />
                </SimpleGrid>
              </Stack>
            </Card>
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
        onClick={() => onChange(segments.concat(newSegment(segments)))}
        w="100%"
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
