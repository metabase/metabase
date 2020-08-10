import React, { Component } from "react";

import ChartSettingColorPicker from "./ChartSettingColorPicker";

export default class ChartSettingColorsPicker extends Component {
  render() {
    const { value, onChange, seriesTitles } = this.props;
    return (
      <div>
        {seriesTitles.map((title, index) => (
          <ChartSettingColorPicker
            key={index}
            onChange={color =>
              onChange({
                ...value,
                [title]: color,
              })
            }
            title={title}
            value={value[title]}
          />
        ))}
      </div>
    );
  }
}
