import React from "react";

import { t } from "c-3po";

import { normal } from "metabase/lib/colors";

import ColorPicker from "metabase/components/ColorPicker";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

const ChartSettingGaugeSegments = ({ value: segments, onChange }) => (
  <div>
    {segments.map((segment, index) => [
      <ChartSettingGaugeSegmentValue
        key={`value:${index}`}
        segment={segment}
        segments={segments}
        index={index}
        onChange={onChange}
      />,
      index !== segments.length - 1 && (
        <ChartSettingGaugeSegmentColor
          key={`color:${index}`}
          segment={segment}
          segments={segments}
          index={index}
          onChange={onChange}
        />
      ),
    ])}
    <Button
      borderless
      icon="add"
      onClick={() =>
        onChange(
          segments.concat({
            value: segments[segments.length - 1].value * 2,
            color: normal.gray,
          }),
        )
      }
    >
      {t`Add a segment`}
    </Button>
  </div>
);

export default ChartSettingGaugeSegments;

const ChartSettingGaugeSegmentValue = ({
  segment,
  segments,
  index,
  onChange,
}) => (
  <div className="flex align-center">
    <input
      type="number"
      className="input block my1"
      value={segment.value}
      onChange={e =>
        onChange([
          ...segments.slice(0, index),
          { ...segment, value: parseFloat(e.target.value) },
          ...segments.slice(index + 1),
        ])
      }
    />
    {segments.length > 2 && (
      <Icon
        name="close"
        className="cursor-pointer text-grey-2 text-grey-4-hover ml2"
        onClick={() => onChange(segments.filter((v, i) => i !== index))}
      />
    )}
  </div>
);

const ChartSettingGaugeSegmentColor = ({
  segment,
  segments,
  index,
  onChange,
}) => (
  <ColorPicker
    value={segment.color}
    onChange={color =>
      onChange([
        ...segments.slice(0, index),
        { ...segment, color },
        ...segments.slice(index + 1),
      ])
    }
  />
);
