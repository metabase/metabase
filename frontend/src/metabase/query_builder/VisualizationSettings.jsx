import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import ChartSettings from "metabase/visualizations/components/ChartSettings.jsx";

import visualizations, { getVisualizationRaw } from "metabase/visualizations";

import cx from "classnames";

export default class VisualizationSettings extends React.Component {
    constructor(props, context) {
        super(props, context);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        setDisplayFn: PropTypes.func.isRequired,
        onUpdateVisualizationSetting: PropTypes.func.isRequired,
        onUpdateVisualizationSettings: PropTypes.func.isRequired
    };

    setDisplay = (type) => {
        // notify our parent about our change
        this.props.setDisplayFn(type);
        this.refs.displayPopover.toggle();
    }

    renderChartTypePicker() {
        let { result, card } = this.props;
        let { CardVisualization } = getVisualizationRaw([{ card, data: result.data }]);

        var triggerElement = (
            <span className="px2 py1 text-bold cursor-pointer text-default flex align-center">
                <Icon name={CardVisualization.iconName} size={12} />
                {CardVisualization.displayName}
                <Icon className="ml1" name="chevrondown" size={8} />
            </span>
        );

        return (
            <div className="relative">
                <span className="GuiBuilder-section-label Query-label">Visualization</span>
                <PopoverWithTrigger
                    id="VisualizationPopover"
                    ref="displayPopover"
                    className="ChartType-popover"
                    triggerId="VisualizationTrigger"
                    triggerElement={triggerElement}
                    triggerClasses="flex align-center"
                >
                    <ul className="pt1 pb1">
                        { Array.from(visualizations).map(([vizType, viz], index) =>
                            <li
                                key={index}
                                className={cx('p2 flex align-center cursor-pointer bg-brand-hover text-white-hover', {
                                    'ChartType--selected': vizType === card.display,
                                    'ChartType--notSensible': !(result && result.data && viz.isSensible(result.data.cols, result.data.rows)),
                                    'hide': viz.hidden
                                })}
                                onClick={this.setDisplay.bind(null, vizType)}
                            >
                                <Icon name={viz.iconName} size={12} />
                                <span className="ml1">{viz.displayName}</span>
                            </li>
                        )}
                    </ul>
                </PopoverWithTrigger>
            </div>
        );
    }

    render() {
        if (this.props.result && this.props.result.error === undefined) {
            return (
                <div className="VisualizationSettings flex align-center">
                    {this.renderChartTypePicker()}
                    <ModalWithTrigger
                        className="Modal Modal--wide Modal--tall"
                        triggerElement={<span data-metabase-event="Query Builder;Chart Settings"><Icon name="gear"/></span>}
                        triggerClasses="text-brand-hover"
                    >
                        <ChartSettings
                            series={[{ card: this.props.card, data: this.props.result.data }]}
                            onChange={this.props.onUpdateVisualizationSettings}
                        />
                    </ModalWithTrigger>
                </div>
            );
        } else {
            return false;
        }
    }
}
