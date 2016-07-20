import React, { Component, PropTypes } from "react";
import cx from "classnames";

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
          card: props.card,
          data: props.result.data
      };
    }

    selectTab = (tab) => {
        this.setState({ currentTab: tab });
    }

    getVisualizationSettings() {
        const { card, data } = this.state;
        return getSettings(card, data);
    }

    onChangeSetting(setting, value, settings) {
        let newSettings = { [setting.id]: value };
        if (setting.dependentSettings) {
            for (let id of setting.dependentSettings) {
                newSettings[id] = settings[id];
            }
        }

        console.log("CHANGE", setting.id, value, newSettings)

        this.setState({
            card: {
                ...this.state.card,
                visualization_settings: {
                    ...this.state.card.visualization_settings,
                    ...newSettings
                }
            }
        })
    }

    onDone() {
        this.props.onChange(this.state.card.visualization_settings);
        this.props.onClose();
    }

    render () {
        const { onClose } = this.props;
        const { card, data } = this.state;

        const settings = this.getVisualizationSettings();

        const tabs = {};
        for (let widget of getSettingsWidgets(card.display, settings)) {
            tabs[widget.section] = tabs[widget.section] || [];
            tabs[widget.section].push(widget);
        }
        const tabNames = Object.keys(tabs);
        const currentTab = this.state.currentTab || tabNames[0];
        const widgets = tabs[currentTab];

        return (
          <div className="flex flex-column spread p4">
              <h2 className="my2">Customize this chart</h2>
              { tabNames.length > 1 &&
                  <ChartSettingsTabs tabs={tabNames} selectTab={this.selectTab} activeTab={currentTab}/>
              }
              <div className="Grid flex-full mt3">
                  <div className="Grid-cell Cell--1of3 scroll-y p1">
                      { widgets && widgets.map((setting) => {
                          const value = settings[setting.id];
                          const onChange = (value) => this.onChangeSetting(setting, value, settings);
                          return (
                              <Setting
                                key={setting.id}
                                value={value}
                                onChange={onChange}
                                {...setting}
                                {...(setting.getProps ? setting.getProps({ value, onChange, card, data }) : {})}
                              />
                          );
                      })}
                      <pre>
                        {JSON.stringify(card.visualization_settings, null, 2)}
                      </pre>
                  </div>
                  <div className="Grid-cell relative">
                      <Visualization
                          className="spread"
                          series={[{ card: card, data: data }]}
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
                <a className={cx("Button Button--primary", { "disabled": JSON.stringify(card.visualization_settings) === JSON.stringify(this.props.card.visualization_settings)})} href="" onClick={() => this.onDone()}>Done</a>
                <a className="text-grey-2 ml2" onClick={onClose}>Cancel</a>
              </div>
          </div>
        )
    }
}


export default ChartSettings
