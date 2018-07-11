import React, { Component } from "react";
import PropTypes from "prop-types";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseUtils from "metabase/lib/utils";
import SettingsSetting from "./SettingsSetting.jsx";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon.jsx";

import RetinaImage from "react-retina-image";

import _ from "underscore";
import { t, jt } from "c-3po";

export default class SettingsSlackForm extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      formData: {},
      submitting: "default",
      valid: false,
      validationErrors: {},
    };
  }

  static propTypes = {
    elements: PropTypes.array,
    formErrors: PropTypes.object,
    updateSlackSettings: PropTypes.func.isRequired,
  };

  componentWillMount() {
    // this gives us an opportunity to load up our formData with any existing values for elements
    let formData = {};
    this.props.elements.forEach(function(element) {
      formData[element.key] =
        element.value == null ? element.defaultValue : element.value;
    });

    this.setState({ formData });
  }

  componentDidMount() {
    this.validateForm();
  }

  componentDidUpdate() {
    this.validateForm();
  }

  setSubmitting(submitting) {
    this.setState({ submitting });
  }

  setFormErrors(formErrors) {
    this.setState({ formErrors });
  }

  // return null if element passes validation, otherwise return an error message
  validateElement([validationType, validationMessage], value, element) {
    if (MetabaseUtils.isEmpty(value)) {
      return;
    }

    switch (validationType) {
      case "email":
        return !MetabaseUtils.validEmail(value)
          ? validationMessage || t`That's not a valid email address`
          : null;
      case "integer":
        return isNaN(parseInt(value))
          ? validationMessage || t`That's not a valid integer`
          : null;
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
          validationErrors[element.key] = this.validateElement(
            validation,
            formData[element.key],
            element,
          );
          if (validationErrors[element.key]) {
            valid = false;
          }
        }, this);
      }
    }, this);

    if (
      this.state.valid !== valid ||
      !_.isEqual(this.state.validationErrors, validationErrors)
    ) {
      this.setState({ valid, validationErrors });
    }
  }

  handleChangeEvent(element, value, event) {
    this.setState({
      formData: {
        ...this.state.formData,
        [element.key]: MetabaseUtils.isEmpty(value) ? null : value,
      },
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
      formErrors.message = t`Looks like we ran into some problems`;
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
      submitting: "working",
    });

    let { formData, valid } = this.state;

    if (valid) {
      this.props.updateSlackSettings(formData).then(
        () => {
          this.setState({
            submitting: "success",
          });

          MetabaseAnalytics.trackEvent("Slack Settings", "Update", "success");

          // show a confirmation for 3 seconds, then return to normal
          setTimeout(() => this.setState({ submitting: "default" }), 3000);
        },
        error => {
          this.setState({
            submitting: "default",
            formErrors: this.handleFormErrors(error),
          });

          MetabaseAnalytics.trackEvent("Slack Settings", "Update", "error");
        },
      );
    }
  }

  render() {
    let { elements } = this.props;
    let {
      formData,
      formErrors,
      submitting,
      valid,
      validationErrors,
    } = this.state;

    let settings = elements.map((element, index) => {
      // merge together data from a couple places to provide a complete view of the Element state
      let errorMessage =
        formErrors && formErrors.elements
          ? formErrors.elements[element.key]
          : validationErrors[element.key];
      let value =
        formData[element.key] == null
          ? element.defaultValue
          : formData[element.key];

      if (element.key === "slack-token") {
        return (
          <SettingsSetting
            key={element.key}
            setting={{ ...element, value }}
            onChange={value => this.handleChangeEvent(element, value)}
            errorMessage={errorMessage}
            fireOnChange
          />
        );
      } else if (element.key === "metabot-enabled") {
        return (
          <SettingsSetting
            key={element.key}
            setting={{ ...element, value }}
            onChange={value => this.handleChangeEvent(element, value)}
            errorMessage={errorMessage}
            disabled={!this.state.formData["slack-token"]}
          />
        );
      }
    });

    let saveSettingsButtonStates = {
      default: t`Save changes`,
      working: t`Saving...`,
      success: t`Changes saved!`,
    };

    let disabled = !valid || submitting !== "default",
      saveButtonText = saveSettingsButtonStates[submitting];

    return (
      <form noValidate>
        <div className="px2" style={{ maxWidth: "585px" }}>
          <h1>
            Metabase
            <RetinaImage
              className="mx1"
              src="app/assets/img/slack_emoji.png"
              width={79}
              forceOriginalDimensions={false /* broken in React v0.13 */}
            />
            Slack
          </h1>
          <h3 className="text-grey-1">{t`Answers sent right to your Slack #channels`}</h3>

          <div className="pt3">
            <a
              href="https://my.slack.com/services/new/bot"
              target="_blank"
              className="Button Button--primary"
              style={{ padding: 0 }}
            >
              <div className="float-left py2 pl2">{t`Create a Slack Bot User for MetaBot`}</div>
              <Icon
                className="float-right p2 text-white cursor-pointer"
                style={{ opacity: 0.6 }}
                name="external"
                size={18}
              />
            </a>
          </div>
          <div className="py2">
            {jt`Once you're there, give it a name and click ${(
              <strong>"Add bot integration"</strong>
            )}. Then copy and paste the Bot API Token into the field below. Once you are done, create a "metabase_files" channel in Slack. Metabase needs this to upload graphs.`}
          </div>
        </div>
        <ul>
          {settings}
          <li className="m2 mb4">
            <Button
              mr={2}
              primary={!disabled}
              success={submitting === "success"}
              disabled={disabled}
              onClick={this.updateSlackSettings.bind(this)}
            >
              {saveButtonText}
            </Button>
            {formErrors && formErrors.message ? (
              <span className="pl2 text-error text-bold">
                {formErrors.message}
              </span>
            ) : null}
          </li>
        </ul>
      </form>
    );
  }
}
