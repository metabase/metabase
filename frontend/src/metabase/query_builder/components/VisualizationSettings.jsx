import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Modal from "metabase/components/Modal.jsx";

import ChartSettings from "metabase/visualizations/components/ChartSettings.jsx";

import visualizations, { getVisualizationRaw } from "metabase/visualizations";

import cx from "classnames";

export default class VisualizationSettings extends React.Component {
  constructor(props, context) {
    super(props, context);
  }

  static propTypes = {
    question: PropTypes.object.isRequired,
    result: PropTypes.object,
    setDisplayFn: PropTypes.func.isRequired,
    onUpdateVisualizationSettings: PropTypes.func.isRequired,
    onReplaceAllVisualizationSettings: PropTypes.func.isRequired,
  };

  setDisplay = type => {
    // notify our parent about our change
    this.props.setDisplayFn(type);
    this.refs.displayPopover.toggle();
  };

  renderChartTypePicker() {
    let { result, question } = this.props;
    let { CardVisualization } = getVisualizationRaw([
      { card: question.card(), data: result.data },
    ]);

    let triggerElement = (
      <span className="px2 py1 text-bold cursor-pointer text-default flex align-center">
        <Icon className="mr1" name={CardVisualization.iconName} size={12} />
        {CardVisualization.uiName}
        <Icon className="ml1" name="chevrondown" size={8} />
      </span>
    );

    return (
      <div className="relative">
        <span
          className="GuiBuilder-section-label pl0 Query-label"
          style={{ marginLeft: 4 }}
        >
          {t`Visualization`}
        </span>
        <PopoverWithTrigger
          id="VisualizationPopover"
          ref="displayPopover"
          className="ChartType-popover"
          triggerId="VisualizationTrigger"
          triggerElement={triggerElement}
          triggerClasses="flex align-center"
          sizeToFit
        >
          <ul className="pt1 pb1 scroll-y">
            {Array.from(visualizations).map(([vizType, viz], index) => (
              <li
                key={index}
                className={cx(
                  "p2 flex align-center cursor-pointer bg-brand-hover text-white-hover",
                  {
                    "ChartType--selected": vizType === question.display(),
                    "ChartType--notSensible": !(
                      result &&
                      result.data &&
                      viz.isSensible &&
                      viz.isSensible(result.data.cols, result.data.rows)
                    ),
                    hide: viz.hidden,
                  },
                )}
                onClick={this.setDisplay.bind(null, vizType)}
              >
                <Icon name={viz.iconName} size={12} />
                <span className="ml1">{viz.uiName}</span>
              </li>
            ))}
          </ul>
        </PopoverWithTrigger>
      </div>
    );
  }

  open = () => {
    this.props.showChartSettings({});
  };

  close = () => {
    this.props.showChartSettings(null);
  };

  render() {
    if (this.props.result && this.props.result.error === undefined) {
      const { chartSettings } = this.props.uiControls;
      return (
        <div className="VisualizationSettings flex align-center">
          {this.renderChartTypePicker()}
          <span
            className="text-brand-hover"
            data-metabase-event="Query Builder;Chart Settings"
            onClick={this.open}
          >
            <Icon name="gear" />
          </span>
          <Modal wide tall isOpen={chartSettings} onClose={this.close}>
            <ChartSettings
              question={this.props.question}
              addField={this.props.addField}
              series={[
                {
                  card: this.props.question.card(),
                  data: this.props.result.data,
                },
              ]}
              onChange={this.props.onReplaceAllVisualizationSettings}
              onClose={this.close}
              initialWidget={chartSettings && chartSettings.widget}
            />
          </Modal>
        </div>
      );
    } else {
      return false;
    }
  }
}
