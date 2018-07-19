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
  props,
  // NOTE: special props to support adding additional fields
  question,
  addField,
}) => {
  const W = widget;
  return (
    <div className={cx("mb2", { hide: hidden, disable: disabled })}>
      {title && <h4 className="mb1">{title}</h4>}
      {W && (
        <W
          value={value}
          onChange={onChange}
          question={question}
          addField={addField}
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
    };
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.series !== nextProps.series) {
      this.setState({
        series: this._getSeries(
          nextProps.series,
          nextProps.series[0].card.visualization_settings,
        ),
      });
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
  };

  handleResetSettings = () => {
    MetabaseAnalytics.trackEvent("Chart Settings", "Reset Settings");
    this.setState({
      settings: {},
      series: this._getSeries(this.props.series, {}),
    });
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

  render() {
    const { isDashboard, question, addField } = this.props;
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
      <div className="flex flex-column spread">
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
        <div className="full-height relative">
          <div className="Grid spread">
            <div className="Grid-cell Cell--1of3 scroll-y scroll-show border-right p4">
              {widgets &&
                widgets.map(widget => (
                  <Widget
                    key={`${widget.id}`}
                    question={question}
                    addField={addField}
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
