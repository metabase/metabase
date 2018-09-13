import React from "react";

import { t } from "c-3po";
import _ from "underscore";

import colors, { normal } from "metabase/lib/colors";

import ColorPicker from "metabase/components/ColorPicker";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import NumericInput from "metabase/components/NumericInput";

const ChartSettingGaugeSegments = ({ value: segments, onChange }) => {
  const onChangeProperty = (index, property, value) =>
    onChange([
      ...segments.slice(0, index),
      { ...segments[index], [property]: value },
      ...segments.slice(index + 1),
    ]);
  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Color</th>
            <th>Min</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment, index) => [
            <tr>
              <td>
                <ColorPicker
                  value={segment.color}
                  onChange={color => onChangeProperty(index, "color", color)}
                  triggerSize={28}
                  padding={2}
                  colors={getColorPalette()}
                />
              </td>
              <td>
                <NumericInput
                  type="number"
                  className="input full"
                  value={segment.min}
                  onChange={value => onChangeProperty(index, "min", value)}
                  placeholder={t`Min`}
                />
              </td>
              <td>
                <NumericInput
                  type="number"
                  className="input full"
                  value={segment.max}
                  onChange={value => onChangeProperty(index, "max", value)}
                  placeholder={t`Max`}
                />
              </td>
              <td>
                {segments.length > 1 && (
                  <Icon
                    name="close"
                    className="cursor-pointer text-grey-2 text-grey-4-hover ml2"
                    onClick={() =>
                      onChange(segments.filter((v, i) => i !== index))
                    }
                  />
                )}
              </td>
            </tr>,
            <tr>
              <td colSpan={3} className="pb2">
                <input
                  type="text"
                  className="input full"
                  value={segment.label}
                  onChange={e =>
                    onChangeProperty(index, "label", e.target.value)
                  }
                  placeholder={t`Label for this range (optional)`}
                />
              </td>
            </tr>,
          ])}
        </tbody>
      </table>
      <Button
        borderless
        icon="add"
        onClick={() => onChange(segments.concat(newSegment(segments)))}
      >
        {t`Add a range`}
      </Button>
    </div>
  );
};

function getColorPalette() {
  return [
    colors["error"],
    colors["warning"],
    colors["success"],
    ...Object.values(normal).slice(0, 9),
    colors["bg-medium"],
  ];
}

function newSegment(segments) {
  const palette = getColorPalette();
  const lastSegment = segments[segments.length - 1];
  const lastColorIndex = lastSegment
    ? _.findIndex(palette, color => color === lastSegment.color)
    : -1;
  const nextColor =
    lastColorIndex >= 0
      ? palette[lastColorIndex + 1 % palette.length]
      : palette[0];

  return {
    min: lastSegment ? lastSegment.max : 0,
    max: lastSegment ? lastSegment.max * 2 : 1,
    color: nextColor,
    label: "",
  };
}

export default ChartSettingGaugeSegments;
