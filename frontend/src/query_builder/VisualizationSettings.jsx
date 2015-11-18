import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import cx from "classnames";

const VISUALIZATION_TYPE_NAMES = {
    'scalar':  { displayName: 'Number',      iconName: 'number' },
    'table':   { displayName: 'Table',       iconName: 'table' },
    'line':    { displayName: 'Line',        iconName: 'line' },
    'bar':     { displayName: 'Bar',         iconName: 'bar' },
    'pie':     { displayName: 'Pie',         iconName: 'pie' },
    'area':    { displayName: 'Area',        iconName: 'area' },
    'state':   { displayName: 'State map',   iconName: 'statemap' },
    'country': { displayName: 'Country map', iconName: 'countrymap' },
    'pin_map': { displayName: 'Pin map',     iconName: 'pinmap' }
};

export default class VisualizationSettings extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.setChartColor = this.setChartColor.bind(this);
        this.setDisplay = this.setDisplay.bind(this);
    }

    static propTypes = {
        visualizationSettingsApi: PropTypes.object.isRequired,
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        setDisplayFn: PropTypes.func.isRequired,
        setChartColorFn: PropTypes.func.isRequired
    };

    static defaultProps = {
        visualizationTypes: [
            'scalar',
            'table',
            'line',
            'bar',
            'pie',
            'area',
            'state',
            'country',
            'pin_map'
        ]
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

    isSensibleChartDisplay(display) {
        var data = (this.props.result) ? this.props.result.data : null;
        switch (display) {
            case "table":
                // table is always appropriate
                return true;
            case "scalar":
                // a 1x1 data set is appropriate for a scalar
                return (data && data.rows && data.rows.length === 1 && data.cols && data.cols.length === 1);
            case "pin_map":
                // when we have a latitude and longitude a pin map is cool
                return (data && hasLatitudeAndLongitudeColumns(data.cols));
            case "line":
            case "area":
                // if we have 2x2 or more then that's enough to make a line/area chart
                return (data && data.rows && data.rows.length > 1 && data.cols && data.cols.length > 1);
            case "country":
            case "state":
                return (data && data.cols && data.cols.length > 1 && data.cols[0].base_type === "TextField");
            case "bar":
            case "pie":
            default:
                // general check for charts is that they require 2 columns
                return (data && data.cols && data.cols.length > 1);
        }
    }

    renderChartTypePicker() {
        var iconName = VISUALIZATION_TYPE_NAMES[this.props.card.display].iconName;
        var triggerElement = (
            <span className="px2 py1 text-bold cursor-pointer text-default flex align-center">
                <Icon name={iconName} width="24px" height="24px"/>
                {VISUALIZATION_TYPE_NAMES[this.props.card.display].displayName}
                <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
            </span>
        )

        var displayOptions = this.props.visualizationTypes.map((type, index) => {
            var classes = cx({
                'p2': true,
                'flex': true,
                'align-center': true,
                'cursor-pointer': true,
                'bg-brand-hover': true,
                'text-white-hover': true,
                'ChartType--selected': type === this.props.card.display,
                'ChartType--notSensible': !this.isSensibleChartDisplay(type),
            });
            var displayName = VISUALIZATION_TYPE_NAMES[type].displayName;
            var iconName = VISUALIZATION_TYPE_NAMES[type].iconName;
            return (
                <li className={classes} key={index} onClick={this.setDisplay.bind(null, type)}>
                    <Icon name={iconName} width="24px" height="24px"/>
                    <span className="ml1">{displayName}</span>
                </li>
            );
        });
        return (
            <div className="relative">
                <span className="GuiBuilder-section-label Query-label">Visualization</span>
                <PopoverWithTrigger ref="displayPopover"
                                    className="ChartType-popover"
                                    triggerElement={triggerElement}
                                    triggerClasses="flex align-center">
                    <ul className="pt1 pb1">
                        {displayOptions}
                    </ul>
                </PopoverWithTrigger>
            </div>
        );
    }

    renderChartColorPicker() {
        if (this.props.card.display === "line" || this.props.card.display === "area" || this.props.card.display === "bar") {
            var colors = this.props.visualizationSettingsApi.getDefaultColorHarmony();
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
            var currentColor = this.props.card.visualization_settings.bar && this.props.card.visualization_settings.bar.color || this.props.visualizationSettingsApi.getDefaultColor();
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
