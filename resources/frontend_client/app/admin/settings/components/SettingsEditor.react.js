'use strict';

import _ from "underscore";

import SettingsHeader from "./SettingsHeader.react";
import SettingsSetting from "./SettingsSetting.react";

import cx from 'classnames';

export default React.createClass({
    displayName: "SettingsEditor",
    propTypes: {
        initialSection: React.string,
        sections: React.PropTypes.object.isRequired,
        updateSetting: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            currentSection: Object.keys(this.props.sections)[0]
        };
    },

    componentWillMount: function() {
        if (this.props.initialSection) {
            this.setState({
                currentSection: this.props.initialSection
            });
        }
    },

    selectSection: function(section) {
        this.setState({ currentSection: section });
    },

    updateSetting: function(setting, value) {
        this.refs.header.refs.status.setSaving();
        setting.value = value;
        this.props.updateSetting(setting).then(() => {
            this.refs.header.refs.status.setSaved();
        }, (error) => {
            this.refs.header.refs.status.setSaveError(error.data);
        });
    },

    handleChangeEvent: function(setting, event) {
        this.updateSetting(setting, event.target.value);
    },

    renderSettingsPane: function() {
        var section = this.props.sections[this.state.currentSection];
        var settings = section.map((setting, index) => {
            return <SettingsSetting key={setting.key} setting={setting} updateSetting={this.updateSetting} handleChangeEvent={this.handleChangeEvent} autoFocus={index === 0}/>
        });
        return (
            <div className="MetadataTable px2 flex-full">
                <ul>{settings}</ul>
            </div>
        );
    },

    renderSettingsSections: function() {
        var sections = _.map(this.props.sections, (section, sectionName, sectionIndex) => {
            var classes = cx("AdminList-item", "flex", "align-center", "no-decoration", {
                "selected": this.state.currentSection === sectionName
            });
            return (
                <li key={sectionName}>
                    <a href="#" className={classes} onClick={this.selectSection.bind(null, sectionName)}>
                        {sectionName}
                    </a>
                </li>
            );
        });
        return (
            <div className="MetadataEditor-table-list AdminList">
                <ul className="AdminList-items pt1">
                    {sections}
                </ul>
            </div>
        );
    },

    render: function() {
        return (
            <div className="MetadataEditor flex flex-column flex-full p4">
                <SettingsHeader ref="header" />
                <div className="MetadataEditor-main flex flex-row flex-full mt2">
                    {this.renderSettingsSections()}
                    {this.renderSettingsPane()}
                </div>
            </div>
        );
    }
});
