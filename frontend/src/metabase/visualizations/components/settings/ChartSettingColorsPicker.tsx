import { Component } from "react";

import CS from "metabase/css/core/index.css";

import { ChartSettingColorPicker } from "./ChartSettingColorPicker";

interface ChartSettingColorsPickerProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  seriesValues: string[];
  seriesTitles: string[];
}

export class ChartSettingColorsPicker extends Component<ChartSettingColorsPickerProps> {
  render() {
    const { value, onChange, seriesValues, seriesTitles } = this.props;
    return (
      <div>
        {seriesValues.map((key, index) => (
          <ChartSettingColorPicker
            className={CS.mb1}
            key={index}
            onChange={(color) =>
              onChange({
                ...value,
                [key]: color,
              })
            }
            title={seriesTitles[index]}
            value={value[key]}
          />
        ))}
      </div>
    );
  }
}
