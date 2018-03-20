import React, { Component } from "react";
import cx from "classnames";
import { assocIn } from "icepick";
import _ from "underscore";
import { t } from "c-3po";
import Warnings from "metabase/query_builder/components/Warnings.jsx";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import { getSettingsWidgets } from "metabase/visualizations/lib/settings";
import MetabaseAnalytics from "metabase/lib/analytics";
import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";

const ChartSettingsTab = ({ name, active, onClick }) => (
  <a
    className={cx("block text-brand py1 text-centered", {
      "bg-brand text-white": active,
    })}
    onClick={() => onClick(name)}
  >
    {name.toUpperCase()}
  </a>
);

const ChartSettingsTabs = ({ tabs, selectTab, activeTab }) => (
  <ul className="bordered rounded flex justify-around overflow-hidden">
    {tabs.map((tab, index) => (
      <li className="flex-full border-left" key={index}>
        <ChartSettingsTab
          name={tab}
          active={tab === activeTab}
          onClick={selectTab}
        />
      </li>
    ))}
  </ul>
);

const Widget = ({
  title,
  hidden,
  disabled,
  widget,
  value,
  onChange,
  props,
}) => {
  const W = widget;
  return (
    <div className={cx("mb2", { hide: hidden, disable: disabled })}>
      {title && <h4 className="mb1">{title}</h4>}
      {W && <W value={value} onChange={onChange} {...props} />}
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

  selectTab = tab => {
    this.setState({ currentTab: tab });
  };

  _getSeries(series, settings) {
    if (settings) {
      series = assocIn(series, [0, "card", "visualization_settings"], settings);
    }
    const transformed = getVisualizationTransformed(extractRemappings(series));
    return transformed.series;
  }

  onResetSettings = () => {
    MetabaseAnalytics.trackEvent("Chart Settings", "Reset Settings");
    this.setState({
      settings: {},
      series: this._getSeries(this.props.series, {}),
    });
  };

  onChangeSettings = newSettings => {
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

  onDone() {
    this.props.onChange(this.state.settings);
    this.props.onClose();
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

  render() {
    const { onClose, isDashboard } = this.props;
    const { series } = this.state;

    const tabs = {};
    for (const widget of getSettingsWidgets(
      series,
      this.onChangeSettings,
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
      <div className="flex flex-column spread p4">
        <h2 className="my2">{t`Customize this ${this.getChartTypeName()}`}</h2>

        {tabNames.length > 1 && (
          <ChartSettingsTabs
            tabs={tabNames}
            selectTab={this.selectTab}
            activeTab={currentTab}
          />
        )}
        <div className="Grid flex-full mt3">
          <div className="Grid-cell Cell--1of3 scroll-y p1">
            {widgets &&
              widgets.map(widget => <Widget key={widget.id} {...widget} />)}
          </div>
          <div className="Grid-cell flex flex-column">
            <div className="flex flex-column">
              <Warnings
                className="mx2 align-self-end text-gold"
                warnings={this.state.warnings}
                size={20}
              />
            </div>
            <div className="flex-full relative">
              <Visualization
                className="spread"
                rawSeries={series}
                isEditing
                showTitle
                isDashboard
                showWarnings
                onUpdateVisualizationSettings={this.onChangeSettings}
                onUpdateWarnings={warnings => this.setState({ warnings })}
              />
            </div>
          </div>
        </div>
        <div className="pt1">
          {!_.isEqual(this.state.settings, {}) && (
            <a
              className="Button Button--danger float-right"
              onClick={this.onResetSettings}
              data-metabase-event="Chart Settings;Reset"
            >{t`Reset to defaults`}</a>
          )}

          <div className="float-left">
            <a
              className="Button Button--primary ml2"
              onClick={() => this.onDone()}
              data-metabase-event="Chart Settings;Done"
            >{t`Done`}</a>
            <a
              className="Button ml2"
              onClick={onClose}
              data-metabase-event="Chart Settings;Cancel"
            >{t`Cancel`}</a>
          </div>
        </div>
      </div>
    );
  }
}

export default ChartSettings;
