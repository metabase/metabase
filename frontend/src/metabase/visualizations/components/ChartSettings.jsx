import React, { Component, PropTypes } from "react";
import cx from "classnames";
import { assocIn } from "icepick";
import _ from "underscore";

import Visualization from "metabase/visualizations/components/Visualization.jsx"
import { getSettings, getSettingsWidgets } from "metabase/lib/visualization_settings";

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

const Setting = (props) => {
    const { title } = props;
    const Widget = props.widget;
    return (
        <div className={cx("mb3", { hide: props.hidden, disable: props.disabled })}>
            { title && <h4 className="mb1">{title}</h4> }
            { Widget && <Widget {...props}/> }
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

    onChangeSetting(setting, value, settings) {
        let newSettings = {
            [setting.id]: value
        };

        if (setting.dependentSettings) {
            for (let id of setting.dependentSettings) {
                newSettings[id] = settings[id];
            }
        }

        console.log("CHANGE", setting.id, value, newSettings)

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

    getSeries() {
        return assocIn(this.props.series, [0, "card", "visualization_settings"], this.state.settings);
    }

    getVisualizationSettings() {
        const series = this.getSeries();
        return getSettings(series[0].card, series[0].data);
    }

    render () {
        const { onClose } = this.props;

        const series = this.getSeries();
        const { card, data } = series[0];

        const settings = this.getVisualizationSettings();

        const tabs = {};
        for (let widget of getSettingsWidgets(card.display, settings)) {
            tabs[widget.section] = tabs[widget.section] || [];
            tabs[widget.section].push(widget);
        }
        const tabNames = Object.keys(tabs);
        const currentTab = this.state.currentTab || tabNames[0];
        const widgets = tabs[currentTab];

        const isDirty = !_.isEqual(this.props.series[0].card.visualization_settings, this.state.settings);

        return (
          <div className="flex flex-column spread p4">
              <h2 className="my2">Customize this chart</h2>
              { tabNames.length > 1 &&
                  <ChartSettingsTabs tabs={tabNames} selectTab={this.selectTab} activeTab={currentTab}/>
              }
              <div className="Grid flex-full mt3">
                  <div className="Grid-cell Cell--1of3 scroll-y p1">
                      { widgets && widgets.map((widget) => {
                          const value = settings[widget.id];
                          const onChange = (value) => this.onChangeSetting(widget, value, settings);
                          return (
                              <Setting
                                key={widget.id}
                                value={value}
                                onChange={onChange}
                                {...widget}
                                {...(widget.getProps ? widget.getProps({ value, onChange, card, data }) : {})}
                              />
                          );
                      })}
                      <pre>
                        {JSON.stringify(this.state.settings, null, 2)}
                      </pre>
                  </div>
                  <div className="Grid-cell relative">
                      <Visualization
                          className="spread"
                          series={series}
                          isEditing={true}
                          // Table:
                          setSortFn={this.props.setSortFn}
                          cellIsClickableFn={this.props.cellIsClickableFn}
                          cellClickedFn={this.props.cellClickedFn}
                          onUpdateVisualizationSetting={this.props.onUpdateVisualizationSetting}
                          onUpdateVisualizationSettings={this.props.onUpdateVisualizationSettings}
                      />
                  </div>
              </div>
              <div className="pt1">
                <a className={cx("Button Button--primary", { disabled: !isDirty })} href="" onClick={() => this.onDone()}>Done</a>
                <a className="text-grey-2 ml2" onClick={onClose}>Cancel</a>
                { !_.isEqual(this.state.settings, {}) &&
                    <a className="Button Button--warning float-right" onClick={() => this.setState({ settings: {} })}>Reset</a>
                }
              </div>
          </div>
        )
    }
}


export default ChartSettings
