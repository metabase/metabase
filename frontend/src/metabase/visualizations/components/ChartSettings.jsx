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

// section names are localized
const DEFAULT_TAB_PRIORITY = [t`Display`];

class ChartSettings extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentSection: (props.initial && props.initial.section) || null,
      currentWidget: (props.initial && props.initial.widget) || null,
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

  handleShowSection = section => {
    this.setState({ currentSection: section, currentWidget: null });
  };

  // allows a widget to temporarily replace itself with a different widget
  handleShowWidget = widget => {
    this.setState({ currentWidget: widget });
  };

  // go back to previously selected section
  handleEndShowWidget = () => {
    this.setState({ currentWidget: null });
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

  render() {
    const { isDashboard, question, addField } = this.props;
    const { rawSeries, transformedSeries, currentWidget } = this.state;

    const widgetsById = {};

    const sections = {};
    for (const widget of getSettingsWidgetsForSeries(
      transformedSeries,
      this.handleChangeSettings,
      isDashboard,
    )) {
      widgetsById[widget.id] = widget;
      if (widget.widget && !widget.hidden) {
        sections[widget.section] = sections[widget.section] || [];
        sections[widget.section].push(widget);
      }
    }

    // Move settings from the "undefined" section in the first tab
    if (sections["undefined"] && Object.values(sections).length > 1) {
      let extra = sections["undefined"];
      delete sections["undefined"];
      Object.values(sections)[0].unshift(...extra);
    }

    const sectionNames = Object.keys(sections);
    const currentSection =
      this.state.currentSection ||
      _.find(DEFAULT_TAB_PRIORITY, name => name in sections) ||
      sectionNames[0];

    let widgets;
    let widget = currentWidget && widgetsById[currentWidget.id];
    if (widget) {
      widget = {
        ...widget,
        hidden: false,
        props: {
          ...(widget.props || {}),
          ...(currentWidget.props || {}),
        },
      };
      widgets = [widget];
    } else {
      widgets = sections[currentSection];
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
        {sectionNames.length > 1 && (
          <div className="border-bottom flex flex-no-shrink pl4">
            <Radio
              value={currentSection}
              onChange={this.handleShowSection}
              options={sectionNames}
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
