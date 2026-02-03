import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { getAccentColors } from "metabase/lib/colors/groups";
import { Box, Button, Icon, NumberInput, Text } from "metabase/ui";
import type { ScalarSegment } from "metabase-types/api";

import { ChartSettingInput } from "../ChartSettingInput";

import S from "./ChartSettingSegmentsEditor.module.css";

export interface ChartSettingSegmentsEditorProps {
  value: ScalarSegment[];
  onChange: (value: ScalarSegment[]) => void;
  canRemoveAll?: boolean;
}

export const ChartSettingSegmentsEditor = ({
  value: segments,
  onChange,
  canRemoveAll = false,
}: ChartSettingSegmentsEditorProps) => {
  const onChangeProperty = (
    index: number,
    property: keyof ScalarSegment,
    value: number | string,
  ) =>
    onChange([
      ...segments.slice(0, index),
      { ...segments[index], [property]: value },
      ...segments.slice(index + 1),
    ]);

  return (
    <Box px="1.5rem">
      {segments.length > 0 ? (
        <table className={S.Table}>
          <thead>
            <tr>
              <th />
              <th>{t`Label`}</th>
              <th>{t`Min`}</th>
              <th>{t`Max`}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment, index) => (
              <tr key={index}>
                <td>
                  <ColorSelector
                    pillSize="large"
                    className={S.ColorPill}
                    value={segment.color}
                    colors={getColorPalette()}
                    onChange={(color) =>
                      onChangeProperty(index, "color", color)
                    }
                  />
                </td>
                <td>
                  <ChartSettingInput
                    value={segment.label}
                    placeholder={t`Label for this range (optional)`}
                    onChange={(val) => onChangeProperty(index, "label", val)}
                  />
                </td>
                <td>
                  <NumberInput
                    className={CS.full}
                    value={segment.min}
                    onBlur={(e) => {
                      const newValue = parseFloat(e.target.value);
                      if (newValue !== segment.min) {
                        onChangeProperty(index, "min", newValue);
                      }
                    }}
                    placeholder={t`Min`}
                    w="4rem"
                  />
                </td>
                <td>
                  <NumberInput
                    className={CS.full}
                    value={segment.max}
                    onBlur={(e) => {
                      const newValue = parseFloat(e.target.value);
                      if (newValue !== segment.max) {
                        onChangeProperty(index, "max", newValue);
                      }
                    }}
                    placeholder={t`Max`}
                    w="4rem"
                  />
                </td>
                <td>
                  {(segments.length > 1 || canRemoveAll) && (
                    <Button
                      leftSection={<Icon name="trash" c="text-tertiary" />}
                      onClick={() =>
                        onChange(segments.filter((v, i) => i !== index))
                      }
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </Box>
  );
};

function getColorPalette() {
  return [
    ...getAccentColors(),
    Color(color("error")).hex(),
    Color(color("warning")).hex(),
    Color(color("success")).hex(),
    Color(color("background-tertiary")).hex(),
  ];
}

function newSegment(segments: ScalarSegment[]) {
  const palette = getColorPalette();
  const lastSegment = segments[segments.length - 1];
  const lastColorIndex = lastSegment
    ? _.findIndex(palette, (color) => color === lastSegment.color)
    : -1;
  const nextColor =
    lastColorIndex >= 0
      ? palette[(lastColorIndex + 1) % palette.length]
      : palette[0];

  return {
    min: lastSegment ? lastSegment.max : 0,
    max: lastSegment ? lastSegment.max * 2 : 1,
    color: nextColor,
    label: "",
  };
}
