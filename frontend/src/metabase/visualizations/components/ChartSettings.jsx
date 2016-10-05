import React, { Component, PropTypes } from "react";
import cx from "classnames";
import { assocIn } from "icepick";
import _ from "underscore";

import Visualization from "metabase/visualizations/components/Visualization.jsx"
import { getSettingsWidgets } from "metabase/lib/visualization_settings";
import MetabaseAnalytics from "metabase/lib/analytics";
import { getVisualizationTransformed } from "metabase/visualizations";

const ChartSettingsTab = ({name, active, onClick}) =>
  <a
    className={cx('block text-brand py1 text-centered', { 'bg-brand text-white' : active})}
    onClick={() => onClick(name) }
  >
    {name.toUpperCase()}
  </a>

const ChartSettingsTabs = ({ tabs, selectTab, activeTab}) =>
  <ul className="bordered rounded flex justify-around overflow-hidden">
    { tabs.map((tab, index) =>
        <li className="flex-full border-left" key={index}>
          <ChartSettingsTab name={tab} active={tab === activeTab} onClick={selectTab} />
        </li>
    )}
  </ul>

const Widget = ({ title, hidden, disabled, widget, value, onChange, props }) => {
    const W = widget;
    return (
        <div className={cx("mb2", { hide: hidden, disable: disabled })}>
            { title && <h4 className="mb1">{title}</h4> }
            { W && <W value={value} onChange={onChange} {...props}/> }
        </div>
    );
}


class ChartSettings extends Component {
    constructor (props) {
        super(props);
        this.state = {
          currentTab: null,
          settings: props.series[0].card.visualization_settings
      };
    }

    selectTab = (tab) => {
        this.setState({ currentTab: tab });
    }

    onUpdateVisualizationSetting = (key, value) => {
        this.onChangeSettings({
            [key]: value
        });
    }

    onChangeSettings = (newSettings) => {
        for (const key of Object.keys(newSettings)) {
            MetabaseAnalytics.trackEvent("Chart Settings", "Change Setting", key);
        }
        this.setState({
            settings: {
                ...this.state.settings,
                ...newSettings
            }
        });
    }

    onDone() {
        this.props.onChange(this.state.settings);
        this.props.onClose();
    }

    getChartTypeName() {
        let { CardVisualization } = getVisualizationTransformed(this.props.series);
        switch (CardVisualization.identifier) {
            case "table": return "table";
            case "scalar": return "number";
            case "funnel": return "funnel";
            default: return "chart";
        }
    }

    render () {
        let { series, onClose, isDashboard } = this.props;

        series = assocIn(series, [0, "card", "visualization_settings"], this.state.settings);

        const transformed = getVisualizationTransformed(series);
        series = transformed.series;

        const tabs = {};
        for (let widget of getSettingsWidgets(series, this.onChangeSettings, isDashboard)) {
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
        const isDirty = !_.isEqual(this.props.series[0].card.visualization_settings, this.state.settings);

        return (
          <div className="flex flex-column spread p4">
              <h2 className="my2">Customize this {this.getChartTypeName()}</h2>
              { tabNames.length > 1 &&
                  <ChartSettingsTabs tabs={tabNames} selectTab={this.selectTab} activeTab={currentTab}/>
              }
              <div className="Grid flex-full mt3">
                  <div className="Grid-cell Cell--1of3 scroll-y p1">
                      { widgets && widgets.map((widget) =>
                          <Widget key={widget.id} {...widget} />
                      )}
                  </div>
                  <div className="Grid-cell relative">
                      <Visualization
                          className="spread"
                          series={series}
                          isEditing
                          isDashboard
                          onUpdateVisualizationSetting={this.onUpdateVisualizationSetting}
                      />
                  </div>
              </div>
              <div className="pt1">
                <a className={cx("Button Button--primary", { disabled: !isDirty })} onClick={() => this.onDone()} data-metabase-event="Chart Settings;Done">Done</a>
                <a className="text-grey-2 ml2" onClick={onClose} data-metabase-event="Chart Settings;Cancel">Cancel</a>
                { !_.isEqual(this.state.settings, {}) &&
                    <a className="Button Button--warning float-right" onClick={() => this.setState({ settings: {} })} data-metabase-event="Chart Settings;Reset">Reset to defaults</a>
                }
              </div>
          </div>
        )
    }
}


export default ChartSettings
