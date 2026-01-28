/* eslint-disable react/prop-types */
import { Component } from "react";

import CS from "metabase/css/core/index.css";

import { ChartSettingColorPicker } from "./ChartSettingColorPicker";

export class ChartSettingColorsPicker extends Component {
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
