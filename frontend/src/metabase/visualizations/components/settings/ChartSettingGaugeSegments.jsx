import React from "react";

import { t } from "c-3po";

import { normal } from "metabase/lib/colors";

import ColorPicker from "metabase/components/ColorPicker";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

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
                {" "}
                <ColorPicker
                  value={segment.color}
                  onChange={color => onChangeProperty(index, "color", color)}
                  padding={2}
                />
              </td>
              <td>
                <input
                  type="number"
                  className="input full"
                  value={segment.min}
                  onChange={e =>
                    onChangeProperty(index, "min", parseFloat(e.target.value))
                  }
                  placeholder={t`Min`}
                />
              </td>
              <td>
                <input
                  type="number"
                  className="input full"
                  value={segment.max}
                  onChange={e =>
                    onChangeProperty(index, "max", parseFloat(e.target.value))
                  }
                  placeholder={t`Max`}
                />
              </td>
              <td>
                <Icon
                  name="close"
                  className="cursor-pointer text-grey-2 text-grey-4-hover ml2"
                  onClick={() =>
                    onChange(segments.filter((v, i) => i !== index))
                  }
                />
              </td>
            </tr>,
            <tr>
              <td colSpan={3}>
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
        onClick={() =>
          onChange(
            segments.concat({
              min: segments[segments.length - 1].max,
              max: segments[segments.length - 1].max * 2,
              color: normal.gray,
              label: "",
            }),
          )
        }
      >
        {t`Add a range`}
      </Button>
    </div>
  );
};

export default ChartSettingGaugeSegments;
