import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import visualizations from "metabase/visualizations";

import cx from "classnames";

export default class VisualizationSettings extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.setDisplay = this.setDisplay.bind(this);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        setDisplayFn: PropTypes.func.isRequired,
        onUpdateVisualizationSetting: PropTypes.func.isRequired,
        onUpdateVisualizationSettings: PropTypes.func.isRequired
    };

    setDisplay(type) {
        // notify our parent about our change
        this.props.setDisplayFn(type);
        this.refs.displayPopover.toggle();
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

    renderVisualizationSettings() {
        let { card } = this.props;
        let visualization = visualizations.get(card.display);
        return (
            visualization.settings && visualization.settings.map((VisualizationSetting, index) =>
                <VisualizationSetting
                    key={index}
                    settings={card.visualization_settings}
                    onUpdateVisualizationSetting={this.props.onUpdateVisualizationSetting}
                    onUpdateVisualizationSettings={this.props.onUpdateVisualizationSettings}
                />
            )
        );
    }

    render() {
        if (this.props.result && this.props.result.error === undefined) {
            return (
                <div className="VisualizationSettings flex align-center">
                    {this.renderChartTypePicker()}
                    {this.renderVisualizationSettings()}
                </div>
            );
        } else {
            return false;
        }
    }
}
