import React, { Component, PropTypes } from "react";

import ChartSettingColorPicker from "./ChartSettingColorPicker.jsx";

export default class ChartSettingColorsPicker extends Component {
    render() {
        const { value, onChange, seriesTitles } = this.props;
        return (
            <div>
                { seriesTitles.map((title, index) =>
                    <ChartSettingColorPicker
                        key={index}
                        value={value[index]}
                        onChange={(color) => onChange([...value.slice(0, index), color, ...value.slice(index + 1)])}
                        title={title}
                    />
                )}
            </div>
        );
    }
}
