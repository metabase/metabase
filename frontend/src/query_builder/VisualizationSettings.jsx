import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import visualizations from "metabase/visualizations";
import { getDefaultColor, getDefaultColorHarmony } from "metabase/lib/visualization_settings";

import cx from "classnames";

export default class VisualizationSettings extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.setChartColor = this.setChartColor.bind(this);
        this.setDisplay = this.setDisplay.bind(this);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        setDisplayFn: PropTypes.func.isRequired,
        setChartColorFn: PropTypes.func.isRequired
    };

    setDisplay(type) {
        // notify our parent about our change
        this.props.setDisplayFn(type);
        this.refs.displayPopover.toggle();
    }

    setChartColor(color) {
        // tell parent about our new color
        this.props.setChartColorFn(color);
        this.refs.colorPopover.toggle();
    }

    renderChartTypePicker() {
        let { result, card } = this.props;
        let visualization = visualizations.get(card.display);

        var triggerElement = (
            <span className="px2 py1 text-bold cursor-pointer text-default flex align-center">
                <Icon name={visualization.iconName} width="24px" height="24px"/>
                {visualization.displayName}
                <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
            </span>
        );

        return (
            <div className="relative">
                <span className="GuiBuilder-section-label Query-label">Visualization</span>
                <PopoverWithTrigger
                    ref="displayPopover"
                    className="ChartType-popover"
                    triggerElement={triggerElement}
                    triggerClasses="flex align-center"
                >
                    <ul className="pt1 pb1">
                        { Array.from(visualizations).map(([vizType, viz], index) =>
                            <li
                                key={index}
                                className={cx('p2 flex align-center cursor-pointer bg-brand-hover text-white-hover', {
                                    'ChartType--selected': vizType === card.display,
                                    'ChartType--notSensible': !(result && result.data && viz.isSensible(result.data.cols, result.data.rows))
                                })}
                                onClick={this.setDisplay.bind(null, vizType)}
                            >
                                <Icon name={viz.iconName} width="24px" height="24px"/>
                                <span className="ml1">{viz.displayName}</span>
                            </li>
                        )}
                    </ul>
                </PopoverWithTrigger>
            </div>
        );
    }

    renderChartColorPicker() {
        if (this.props.card.display === "line" || this.props.card.display === "area" || this.props.card.display === "bar") {
            var colors = getDefaultColorHarmony();
            var colorItems = [];
            for (var i=0; i < colors.length; i++) {
                var color = colors[i];
                var localStyles = {
                    "backgroundColor": color
                };

                colorItems.push((
                    <li key={i} className="CardSettings-colorBlock" style={localStyles} onClick={this.setChartColor.bind(null, color)}></li>
                ));
            }

            // TODO: currently we set all chart type colors to the same value so bar color always works
            var currentColor = this.props.card.visualization_settings.bar && this.props.card.visualization_settings.bar.color || getDefaultColor();
            var triggerElement = (
                <span className="px2 py1 text-bold cursor-pointer text-default flex align-center">
                    <div className="ColorWell rounded bordered" style={{backgroundColor:currentColor}}></div>
                    Color
                    <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
                </span>
            )

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
                            {colorItems}
                        </ol>
                    </PopoverWithTrigger>
                </div>
            );

        } else {
            return false;
        }
    }

    render() {
        if (this.props.result && this.props.result.error === undefined) {
            return (
                <div className="VisualizationSettings flex align-center">
                    {this.renderChartTypePicker()}
                    {this.renderChartColorPicker()}
                </div>
            );
        } else {
            return false;
        }
    }
}
