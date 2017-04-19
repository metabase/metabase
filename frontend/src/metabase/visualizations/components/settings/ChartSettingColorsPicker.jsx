import React, { Component } from "react";

import ChartSettingColorPicker from "./ChartSettingColorPicker.jsx";

export default class ChartSettingColorsPicker extends Component {
    render() {
        const { value, onChange, seriesTitles } = this.props;
        return (
            <div>
                { seriesTitles.map((title, index) =>
                    <ChartSettingColorPicker
                        key={index}
                        onChange={color =>
                            onChange([
                                ...value.slice(0, index),
                                color,
                                ...value.slice(index + 1)
                            ])
                        }
                        title={title}
                        value={value[index]}
                    />
                )}
            </div>
        );
    }
}
