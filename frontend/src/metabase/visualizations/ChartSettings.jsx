import React, { Component, PropTypes } from "react";
import cx from "classnames";

import CheckBox from "metabase/components/CheckBox.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import Select from "metabase/components/Select.jsx";
import ColorSetting from "metabase/visualizations/components/settings/ColorSetting.jsx";

const ToggleOption = ({label, on}) =>
  <div className="flex align-center">
    <Toggle value={on} />
    <h4 className="ml1">{label}</h4>
  </div>


const ColorOption = ({label}) =>
  <div>
    <h4>{label}</h4>
  </div>

const LabelOptions = () =>
  <ul>
    <li className="full">
      <ToggleOption label='Show X-Axis label' on />
      <h4 className="mb1">X-Axis label</h4>
      <input className="input full" type="text" placeholder="Label" />

      <h4 className="mb1">X-Axis label size</h4>
      <Select options={['normal', 'large', 'are we sure we want this?']} />
    </li>
    <li className="full mt3">
      <ToggleOption label='Show Y-Axis label' on />

      <h4 className="mb1">Y-Axis label</h4>
      <input className="input full" type="text" placeholder="" />

      <h4 className="mb1">Y-Axis label size</h4>
      <Select options={['normal', 'large', 'are we sure we want this?']} />
    </li>
  </ul>

const DisplayOptions = () =>
  <ul>
    <li className="mb2"><ToggleOption label='Stacked bars' on /></li>
    <li className="mb2"><ColorOption label='Completed bookings' /></li>
    <li className="mb2"><ColorOption label='Canceled bookings' /></li>
  </ul>

const DataOptions = () =>
  <div>
      <div className="mb3">
        <h4 className="mb1">X-Axis</h4>
        <Select options={['Derp', 'Lerp']} className="full" />
      </div>

      <h4 className="mb1">Y-Axis</h4>
      <div className="flex">
        <Select options={['Derp', 'Lerp']} className="full" />
        <CheckBox className="p3"/>
      </div>

      <div className="flex">
        <Select options={['Derp', 'Lerp']} className="full" />
        <CheckBox className="p3"/>
      </div>

      <a className="link my2 text-bold">Add another</a>
  </div>

const AxesOptions = ({options}) =>
  <ul>
    <li className="mb2"><ToggleOption label='Show x-axis lines and marks' on /></li>
    <li className="mb2"><ToggleOption label='Show y-axis lines and marks' on /></li>
    <li className="mb2"><ToggleOption label='Auto x-axis range' /></li>
    <li className="mb2"><ToggleOption label='Auto y-axis range' /></li>
  </ul>

const ChartSettingsTab = ({name, active, onClick}) =>
  <a
    className={cx('block text-brand py1 text-centered', { 'bg-brand text-white' : active})}
    onClick={() => onClick(name) }
  >
    {name.toUpperCase()}
  </a>

const TABS = ['data', 'display', 'axes', 'labels']

const ChartSettingsTabs = ({selectTab, activeTab}) =>
  <ul className="bordered rounded flex justify-around overflow-hidden">
    { TABS.map((tab, index) =>
        <li className="flex-full border-left" key={index}>
          <ChartSettingsTab name={tab} active={tab === activeTab} onClick={selectTab} />
        </li>
    )}
  </ul>

const ChartPreview = () =>
  <h1>
      DAT CHART DOE
  </h1>

const ChartSettingsFooter = () =>
  <div>
    <a className="Button Button--primary" href="">Done</a>
    <a className="text-grey-2 ml2">Cancel</a>
  </div>

class ChartSettings extends Component {
    constructor (props) {
        super(props)
        //TODO - use redux
        this.state = {
          currentTab: 'data'
        }
        this.selectTab = this.selectTab.bind(this)
    }
    selectTab (tab) {
        this.setState({ currentTab: tab })
    }

    renderOptionsForTab () {
      switch(this.state.currentTab) {
        case 'data':
          return <DataOptions />
        case 'display':
          return <DisplayOptions />
        case 'axes':
          return <AxesOptions />
        case 'labels':
          return <LabelOptions />
        default:
          return <DataOptions />
      }
    }
    render () {
        return (
          <div className="flex flex-column full-height p2">
              <h2 className="my2">Customize this chart</h2>
              <ChartSettingsTabs selectTab={this.selectTab} activeTab={this.state.currentTab}/>
              <div className="Grid flex-full mt3">
                  <div className="Grid-cell Cell--1of3">
                    { this.renderOptionsForTab() }
                  </div>
                  <div className="Grid-cell flex align-center justify-center">
                    <ChartPreview />
                  </div>
              </div>
              <ChartSettingsFooter />
          </div>
        )
    }
}


export default ChartSettings
