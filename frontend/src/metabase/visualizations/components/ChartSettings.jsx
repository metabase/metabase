import React, { Component } from "react";
import cx from "classnames";
import { assocIn } from "icepick";
import _ from "underscore";
import { t } from "c-3po";
import Warnings from "metabase/query_builder/components/Warnings.jsx";

import Button from "metabase/components/Button";
import Radio from "metabase/components/Radio";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import ChartSettingsWidget from "./ChartSettingsWidget";

import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import MetabaseAnalytics from "metabase/lib/analytics";
import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";
import { updateSettings } from "metabase/visualizations/lib/settings";

const DEFAULT_TAB_PRIORITY = ["Display"];

class ChartSettings extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentTab: null,
      showWidget: props.initialWidget,
      ...this._getState(
        props.series,
        props.series[0].card.visualization_settings,
      ),
    };
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.series !== nextProps.series) {
      this.setState(this._getState(nextProps.series, this.state.settings));
    }
  }

  _getState(series, settings) {
    const rawSeries = assocIn(
      series,
      [0, "card", "visualization_settings"],
      settings,
    );
    const { series: transformedSeries } = getVisualizationTransformed(
      extractRemappings(rawSeries),
    );
    return {
      settings,
      rawSeries,
      transformedSeries,
    };
  }

  handleSelectTab = tab => {
    this.setState({ currentTab: tab, showWidget: null });
  };

  handleResetSettings = () => {
    MetabaseAnalytics.trackEvent("Chart Settings", "Reset Settings");
    this.setState(this._getState(this.props.series, {}));
  };

  handleChangeSettings = changedSettings => {
    const newSettings = updateSettings(this.state.settings, changedSettings);
    this.setState(this._getState(this.props.series, newSettings));
  };

  handleDone = () => {
    this.props.onChange(this.state.settings);
    this.props.onClose();
  };

  handleCancel = () => {
    this.props.onClose();
  };

  // allows a widget to temporarily replace itself with a different widget
  handleShowWidget = widget => {
    this.setState({ showWidget: widget });
  };
  handleEndShowWidget = () => {
    this.setState({ showWidget: null });
  };

  render() {
    const { isDashboard, question, addField } = this.props;
    const { rawSeries, transformedSeries, showWidget } = this.state;

    const widgetsById = {};

    const tabs = {};
    for (const widget of getSettingsWidgetsForSeries(
      transformedSeries,
      this.handleChangeSettings,
      isDashboard,
    )) {
      widgetsById[widget.id] = widget;
      if (widget.widget && !widget.hidden) {
        tabs[widget.section] = tabs[widget.section] || [];
        tabs[widget.section].push(widget);
      }
    }

    // Move settings from the "undefined" section in the first tab
    if (tabs["undefined"] && Object.values(tabs).length > 1) {
      let extra = tabs["undefined"];
      delete tabs["undefined"];
      Object.values(tabs)[0].unshift(...extra);
    }

    const tabNames = Object.keys(tabs);
    const currentTab =
      this.state.currentTab ||
      _.find(DEFAULT_TAB_PRIORITY, name => name in tabs) ||
      tabNames[0];

    let widgets;
    let widget = showWidget && widgetsById[showWidget.id];
    if (widget) {
      widget = {
        ...widget,
        hidden: false,
        props: {
          ...(widget.props || {}),
          ...(showWidget.props || {}),
        },
      };
      widgets = [widget];
    } else {
      widgets = tabs[currentTab];
    }

    const extraWidgetProps = {
      // NOTE: special props to support adding additional fields
      question: question,
      addField: addField,
      onShowWidget: this.handleShowWidget,
      onEndShowWidget: this.handleEndShowWidget,
    };

    return (
      <div className="flex flex-column spread">
        {tabNames.length > 1 && (
          <div className="border-bottom flex flex-no-shrink pl4">
            <Radio
              value={currentTab}
              onChange={this.handleSelectTab}
              options={tabNames}
              optionNameFn={v => v}
              optionValueFn={v => v}
              underlined
            />
          </div>
        )}
        <div className="full-height relative">
          <div className="Grid spread">
            <div className="Grid-cell Cell--1of3 scroll-y scroll-show border-right py4">
              {widgets.map(widget => (
                <ChartSettingsWidget
                  key={`${widget.id}`}
                  {...widget}
                  {...extraWidgetProps}
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
                  rawSeries={rawSeries}
                  showTitle
                  isEditing
                  isDashboard
                  isSettings
                  showWarnings
                  onUpdateVisualizationSettings={this.handleChangeSettings}
                  onUpdateWarnings={warnings => this.setState({ warnings })}
                />
              </div>
              <ChartSettingsFooter
                onDone={this.handleDone}
                onCancel={this.handleCancel}
                onReset={
                  !_.isEqual(this.state.settings, {})
                    ? this.handleResetSettings
                    : null
                }
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const ChartSettingsFooter = ({ className, onDone, onCancel, onReset }) => (
  <div className={cx("py2 px4", className)}>
    <div className="float-right">
      <Button
        className="ml2"
        onClick={onCancel}
        data-metabase-event="Chart Settings;Cancel"
      >{t`Cancel`}</Button>
      <Button
        primary
        className="ml2"
        onClick={onDone}
        data-metabase-event="Chart Settings;Done"
      >{t`Done`}</Button>
    </div>

    {onReset && (
      <Button
        borderless
        icon="refresh"
        className="float-right ml2"
        data-metabase-event="Chart Settings;Reset"
        onClick={onReset}
      >{t`Reset to defaults`}</Button>
    )}
  </div>
);

export default ChartSettings;
