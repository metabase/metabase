/* eslint-disable react/prop-types */
import { Component } from "react";

import { ChartSettingColorPicker } from "./ChartSettingColorPicker";

export default class ChartSettingColorsPicker extends Component {
  render() {
    const { value, onChange, seriesValues, seriesTitles } = this.props;
    return (
      <div>
        {seriesValues.map((key, index) => (
          <ChartSettingColorPicker
            key={index}
            onChange={color =>
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
