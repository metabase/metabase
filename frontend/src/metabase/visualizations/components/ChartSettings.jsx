import React, { Component } from "react";
import cx from "classnames";
import { assocIn } from "icepick";
import _ from "underscore";
import { t } from "c-3po";
import Warnings from "metabase/query_builder/components/Warnings.jsx";

import Button from "metabase/components/Button";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import { getSettingsWidgets } from "metabase/visualizations/lib/settings";
import MetabaseAnalytics from "metabase/lib/analytics";
import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";

const Widget = ({
  title,
  hidden,
  disabled,
  widget,
  value,
  onChange,
  onEnterModal,
  props,
}) => {
  const W = widget;
  return (
    <div className={cx("mb2", { hide: hidden, disable: disabled })}>
      {title && <h4 className="mb1">{title}</h4>}
      {W && (
        <W
          value={value}
          onChange={onChange}
          onEnterModal={onEnterModal}
          {...props}
        />
      )}
    </div>
  );
};

class ChartSettings extends Component {
  constructor(props) {
    super(props);
    const initialSettings = props.series[0].card.visualization_settings;
    this.state = {
      currentTab: null,
      settings: initialSettings,
      series: this._getSeries(props.series, initialSettings),
      backButtonName: null,
      stateBustingId: 0,
    };
  }

  getChartTypeName() {
    let { CardVisualization } = getVisualizationTransformed(this.props.series);
    switch (CardVisualization.identifier) {
      case "table":
        return "table";
      case "scalar":
        return "number";
      case "funnel":
        return "funnel";
      default:
        return "chart";
    }
  }

  _getSeries(series, settings) {
    if (settings) {
      series = assocIn(series, [0, "card", "visualization_settings"], settings);
    }
    const transformed = getVisualizationTransformed(extractRemappings(series));
    return transformed.series;
  }

  handleSelectTab = tab => {
    this.setState({ currentTab: tab });
    this.handleExitModal();
  };

  handleResetSettings = () => {
    MetabaseAnalytics.trackEvent("Chart Settings", "Reset Settings");
    this.setState({
      settings: {},
      series: this._getSeries(this.props.series, {}),
    });
    this.handleExitModal();
  };

  handleChangeSettings = newSettings => {
    for (const key of Object.keys(newSettings)) {
      MetabaseAnalytics.trackEvent("Chart Settings", "Change Setting", key);
    }
    const settings = {
      ...this.state.settings,
      ...newSettings,
    };
    this.setState({
      settings: settings,
      series: this._getSeries(this.props.series, settings),
    });
  };

  handleDone = () => {
    this.props.onChange(this.state.settings);
    this.props.onClose();
  };

  handleCancel = () => {
    this.props.onClose();
  };

  handleEnterModal = backButtonName => {
    this.setState({ backButtonName });
  };

  handleExitModal = () => {
    // HACK: incrementing stateBustingId causes widgets internal state to be reset
    this.setState({
      backButtonName: null,
      stateBustingId: this.state.stateBustingId + 1,
    });
  };

  render() {
    const { isDashboard } = this.props;
    const { series } = this.state;

    const tabs = {};
    for (const widget of getSettingsWidgets(
      series,
      this.handleChangeSettings,
      isDashboard,
    )) {
      tabs[widget.section] = tabs[widget.section] || [];
      tabs[widget.section].push(widget);
    }

    // Move settings from the "undefined" section in the first tab
    if (tabs["undefined"] && Object.values(tabs).length > 1) {
      let extra = tabs["undefined"];
      delete tabs["undefined"];
      Object.values(tabs)[0].unshift(...extra);
    }

    const tabNames = Object.keys(tabs);
    const currentTab = this.state.currentTab || tabNames[0];
    const widgets = tabs[currentTab];

    return (
      <div className="flex relative flex-column spread">
        {tabNames.length > 1 && (
          <div className="border-bottom flex flex-no-shrink pl4">
            {tabNames.map(tabName => (
              <div
                className={cx(
                  "h3 py2 mr2 border-bottom cursor-pointer text-brand-hover border-brand-hover",
                  {
                    "text-brand border-brand": currentTab === tabName,
                    "border-transparent": currentTab !== tabName,
                  },
                )}
                style={{ borderWidth: 3 }}
                onClick={() => this.handleSelectTab(tabName)}
              >
                {tabName}
              </div>
            ))}
          </div>
        )}
        <div className="full-height flex relative">
          <div className="Grid spread">
            <div className="Grid-cell Cell--1of3 scroll-y scroll-show border-right p4">
              {widgets &&
                widgets.map(widget => (
                  <Widget
                    key={`${widget.id}-${this.state.stateBustingId}`}
                    onEnterModal={this.handleEnterModal}
                    {...widget}
                  />
                ))}
            </div>
            <div className="Grid-cell flex flex-column pt2">
              <div className="mx4 flex flex-column">
                <Warnings
                  className="mx2 align-self-end text-gold"
                  warnings={this.state.warnings}
                  size={20}
                />
              </div>
              <div className="mx4 flex-full relative">
                <Visualization
                  className="spread"
                  rawSeries={series}
                  isEditing
                  showTitle
                  isDashboard
                  showWarnings
                  onUpdateVisualizationSettings={this.handleChangeSettings}
                  onUpdateWarnings={warnings => this.setState({ warnings })}
                />
              </div>
              <div className="py2 px4 border-top">
                {this.state.backButtonName ? (
                  <div className="float-right">
                    <a
                      className="Button Button--primary ml2"
                      onClick={this.handleExitModal}
                      data-metabase-event="Chart Settings;Back"
                    >
                      {this.state.backButtonName}
                    </a>
                  </div>
                ) : (
                  <div className="float-right">
                    <Button
                      className="ml2"
                      onClick={this.handleCancel}
                      data-metabase-event="Chart Settings;Cancel"
                    >{t`Cancel`}</Button>
                    <Button
                      primary
                      className="ml2"
                      onClick={this.handleDone}
                      data-metabase-event="Chart Settings;Done"
                    >{t`Done`}</Button>
                  </div>
                )}
                {!_.isEqual(this.state.settings, {}) && (
                  <Button
                    borderless
                    icon="refresh"
                    className="float-right ml2"
                    data-metabase-event="Chart Settings;Reset"
                    onClick={this.handleResetSettings}
                  >{t`Reset to defaults`}</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ChartSettings;
