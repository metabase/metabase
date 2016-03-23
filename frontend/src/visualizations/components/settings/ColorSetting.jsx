import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import { getDefaultColor, getDefaultColorHarmony } from "metabase/lib/visualization_settings";

export default (options = {}) => class ColorSetting extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    setChartColor(color) {
        const { settings } = this.props;

        if (color === getDefaultColor()) {
            color = undefined;
        }

        this.props.onUpdateVisualizationSettings({
            ...settings,
            line: {
                ...(settings.line || {}),
                lineColor: color,
                marker_fillColor: color,
                marker_lineColor: color,
            },
            area: {
                ...(settings.area || {}),
                fillColor: color
            },
            bar: {
                ...(settings.bar || {}),
                color: color
            }
        });

        this.refs.colorPopover.toggle();
    }

    render() {
        var colors = getDefaultColorHarmony();

        // TODO: currently we set all chart type colors to the same value so bar color always works
        var currentColor = this.props.settings.bar && this.props.settings.bar.color || getDefaultColor();
        var triggerElement = (
            <span className="px2 py1 text-bold cursor-pointer text-default flex align-center">
                <div className="ColorWell rounded bordered" style={{ backgroundColor: currentColor }}></div>
                Color
                <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
            </span>
        );

        return (
            <div className="relative">
                <span className="GuiBuilder-section-label Query-label">Color</span>
                <PopoverWithTrigger ref="colorPopover"
                                    hasArrow={false}
                                    tetherOptions={{
                                        attachment: 'middle left',
                                        targetAttachment: 'middle right',
                                        targetOffset: '0 0',
                                        constraints: [{ to: 'window', attachment: 'together', pin: ['left', 'right']}]
                                    }}
                                    triggerElement={triggerElement}
                                    triggerClasses="flex align-center">
                    <ol className="p1">
                        {colors.map((color, i) =>
                            <li key={i} className="CardSettings-colorBlock" style={{ backgroundColor: color }} onClick={() => this.setChartColor(color)}></li>
                        )}
                    </ol>
                </PopoverWithTrigger>
            </div>
        );
    }
}
