import React, { Component, PropTypes } from "react";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import SettingsEmailFormElement from "./SettingsEmailFormElement.jsx";
import SettingsSetting from "./SettingsSetting.jsx";

import Icon from "metabase/components/Icon.jsx";

import RetinaImage from "react-retina-image";

import cx from "classnames";
import _ from "underscore";

export default class SettingsUpdatesForm extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            formData: {},
            submitting: "default",
            valid: false,
            validationErrors: {}
        }
    }

    static propTypes = {
        elements: PropTypes.array,
        formErrors: PropTypes.object,
    };

    componentWillMount() {
        // this gives us an opportunity to load up our formData with any existing values for elements
        let formData = {};
        this.props.elements.forEach(function(element) {
            formData[element.key] = element.value || element.defaultValue;
        });

        this.setState({formData});
    }

    componentDidMount() {
        this.validateForm();
    }

    componentDidUpdate() {
        this.validateForm();
    }

    setSubmitting(submitting) {
        this.setState({submitting});
    }

    setFormErrors(formErrors) {
        this.setState({formErrors});
    }

    // return null if element passes validation, otherwise return an error message
    validateElement([validationType, validationMessage], value, element) {
        if (MetabaseUtils.isEmpty(value)) return;

        switch (validationType) {
            case "email":
                return !MetabaseUtils.validEmail(value) ? (validationMessage || "That's not a valid email address") : null;
            case "integer":
                return isNaN(parseInt(value)) ? (validationMessage || "That's not a valid integer") : null;
        }
    }

    validateForm() {
        let { elements } = this.props;
        let { formData } = this.state;

        let valid = true,
            validationErrors = {};

        elements.forEach(function(element) {
            // test for required elements
            if (element.required && MetabaseUtils.isEmpty(formData[element.key])) {
                valid = false;
            }

            if (element.validations) {
                element.validations.forEach(function(validation) {
                    validationErrors[element.key] = this.validateElement(validation, formData[element.key], element);
                    if (validationErrors[element.key]) valid = false;
                }, this);
            }
        }, this);

        if (this.state.valid !== valid || !_.isEqual(this.state.validationErrors, validationErrors)) {
            this.setState({ valid, validationErrors });
        }
    }

    handleChangeEvent(element, value, event) {
        this.setState({
            formData: { ...this.state.formData, [element.key]: (MetabaseUtils.isEmpty(value)) ? null : value }
        });

        if (element.key === "metabot-enabled") {
            MetabaseAnalytics.trackEvent("Slack Settings", "Toggle Metabot", value);
        }
    }

    handleFormErrors(error) {
        // parse and format
        let formErrors = {};
        if (error.data && error.data.message) {
            formErrors.message = error.data.message;
        } else {
            formErrors.message = "Looks like we ran into some problems";
        }

        if (error.data && error.data.errors) {
            formErrors.elements = error.data.errors;
        }

        return formErrors;
    }

    updateSlackSettings(e) {
        e.preventDefault();

        this.setState({
            formErrors: null,
            submitting: "working"
        });

        let { formData, valid } = this.state;

        if (valid) {
            this.props.updateSlackSettings(formData).then(() => {
                this.setState({
                    submitting: "success"
                });

                MetabaseAnalytics.trackEvent("Slack Settings", "Update", "success");

                // show a confirmation for 3 seconds, then return to normal
                setTimeout(() => this.setState({submitting: "default"}), 3000);
            }, (error) => {
                this.setState({
                    submitting: "default",
                    formErrors: this.handleFormErrors(error)
                });

                MetabaseAnalytics.trackEvent("Slack Settings", "Update", "error");
            });
        }
    }

    renderVersionUpdateNotice() {
        let versionInfo = _.findWhere(this.props.settings, {key: "version-info"}),
            currentVersion = MetabaseSettings.get("version").tag;

        versionInfo = versionInfo ? JSON.parse(versionInfo.value) : null;

        console.log(versionInfo);

        if (!versionInfo || currentVersion === versionInfo.latest.version) {
            return (
                <div className="p2 bg-brand bordered rounded border-brand text-white text-bold">
                    You're running Metabase {currentVersion} which is the latest and greatest!
                </div>
            );
        } else {
            return (
                <div className="p2 bg-green bordered rounded border-green flex flex-row align-center justify-between">
                    <span className="text-white text-bold">Metabase {versionInfo.latest.version} is available.  You're running {currentVersion}</span>
                    <a className="Button Button--white Button--medium borderless" href="http://www.metabase.com/start">Update</a>
                </div>
            );
        }
    }


    render() {
        let { elements } = this.props;

        let settings = elements.map((setting, index) => {
            return <SettingsSetting key={setting.key} setting={setting} updateSetting={this.props.updateSetting} handleChangeEvent={this.props.handleChangeEvent} autoFocus={index === 0}/>
        });

        return (
            <div style={{width: "585px"}}>
                <ul>
                    {settings}
                </ul>

                <div className="px2">
                    <div className="pt2 border-top">
                        {this.renderVersionUpdateNotice()}
                    </div>
                </div>
            </div>
        );
    }
}
