"use strict";

import Icon from './icon.react';
import PopoverWithTrigger from './popover_with_trigger.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'VisualizationSettings',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.object.isRequired,
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
        setDisplayFn: React.PropTypes.func.isRequired,
        setChartColorFn: React.PropTypes.func.isRequired
    },

    visualizationTypeNames: {
        'scalar':  { displayName: 'Number',      iconName: 'number' },
        'table':   { displayName: 'Table',       iconName: 'table' },
        'line':    { displayName: 'Line',        iconName: 'line' },
        'bar':     { displayName: 'Bar',         iconName: 'bar' },
        'pie':     { displayName: 'Pie',         iconName: 'pie' },
        'area':    { displayName: 'Area',        iconName: 'area' },
        'state':   { displayName: 'State map',   iconName: 'statemap' },
        'country': { displayName: 'Country map', iconName: 'countrymap' },
        'pin_map': { displayName: 'Pin map',     iconName: 'pinmap' }
    },

    getDefaultProps: function() {
        return {
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
    },

    setDisplay: function(type) {
        // notify our parent about our change
        this.props.setDisplayFn(type);
        this.refs.displayPopover.toggleModal();
    },

    setChartColor: function(color) {
        // tell parent about our new color
        this.props.setChartColorFn(color);
        this.refs.colorPopover.toggleModal();
    },

    hasLatitudeAndLongitudeColumns: function(columnDefs) {
        var hasLatitude = false,
            hasLongitude = false;
        columnDefs.forEach(function(col, index) {
            if (col.special_type &&
                    col.special_type === "latitude") {
                hasLatitude = true;

            } else if (col.special_type &&
                    col.special_type === "longitude") {
                hasLongitude = true;
            }
        });

        return (hasLatitude && hasLongitude);
    },

    isSensibleChartDisplay: function(display) {
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
                return (data && this.hasLatitudeAndLongitudeColumns(data.cols));
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
    },

    renderChartTypePicker: function() {
        var tetherOptions = {
            attachment: 'top left',
            targetAttachment: 'bottom left',
            targetOffset: '5px 25px'
        };

        var iconName = this.visualizationTypeNames[this.props.card.display].iconName;
        var triggerElement = (
            <span className="px2 py2 text-bold cursor-pointer text-default flex align-center">
                <Icon name={iconName} width="24px" height="24px"/>
                {this.visualizationTypeNames[this.props.card.display].displayName}
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
            var displayName = this.visualizationTypeNames[type].displayName;
            var iconName = this.visualizationTypeNames[type].iconName;
            return (
                <li className={classes} key={index} onClick={this.setDisplay.bind(null, type)}>
                    <Icon name={iconName} width="24px" height="24px"/>
                    <span className="ml1">{displayName}</span>
                </li>
            );
        });
        return (
            <div className="GuiBuilder-section">
                <span className="GuiBuilder-section-label Query-label">Visualization</span>
                <PopoverWithTrigger ref="displayPopover"
                                    className="PopoverBody PopoverBody--withArrow ChartType-popover"
                                    tetherOptions={tetherOptions}
                                    triggerElement={triggerElement}
                                    triggerClasses="flex align-center">
                    <ul className="">
                        {displayOptions}
                    </ul>
                </PopoverWithTrigger>
            </div>
        );
    },

    renderChartColorPicker: function() {
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

            var currentColor = this.props.card.visualization_settings.bar && this.props.card.visualization_settings.bar.color || null;
            var triggerElement = (
                <span className="px2 py2 text-bold cursor-pointer text-default flex align-center">
                    <div className="ColorWell rounded bordered" style={{backgroundColor:currentColor}}></div>
                    Color
                    <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
                </span>
            )

            var tetherOptions = {
                attachment: 'middle left',
                targetAttachment: 'middle right',
                targetOffset: '0 6px'
            };

            return (
                <div className="GuiBuilder-section">
                    <span className="GuiBuilder-section-label Query-label">Color</span>
                    <PopoverWithTrigger ref="colorPopover"
                                        className="PopoverBody"
                                        tetherOptions={tetherOptions}
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
    },

    render: function() {
        if (this.props.result && this.props.result.error === undefined) {
            return (
                <div className="GuiBuilder">
                    {this.renderChartTypePicker()}
                    {this.renderChartColorPicker()}
                </div>
            );
        } else {
            return false;
        }
    }
});
