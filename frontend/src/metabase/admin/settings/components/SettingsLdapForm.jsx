import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";
import cx from "classnames";

import Collapse from "react-collapse";
import { t } from "c-3po";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import DisclosureTriangle from "metabase/components/DisclosureTriangle";
import MetabaseUtils from "metabase/lib/utils";
import SettingsSetting from "./SettingsSetting";

export default class SettingsLdapForm extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      formData: {},
      showAttributes: false,
      submitting: "default",
      valid: false,
      validationErrors: {},
    };
  }

  static propTypes = {
    elements: PropTypes.array.isRequired,
    formErrors: PropTypes.object,
    updateLdapSettings: PropTypes.func.isRequired,
  };

  componentWillMount() {
    // this gives us an opportunity to load up our formData with any existing values for elements
    this.updateFormData(this.props);
  }

  componentWillReceiveProps(nextProps) {
    this.updateFormData(nextProps);
  }

  updateFormData(props) {
    let formData = {};
    for (const element of props.elements) {
      formData[element.key] = element.value;
    }
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
    if (MetabaseUtils.isEmpty(value)) return;

    switch (validationType) {
      case "email":
        return !MetabaseUtils.validEmail(value)
          ? validationMessage || t`That's not a valid email address`
          : null;
      case "integer":
        return isNaN(parseInt(value))
          ? validationMessage || t`That's not a valid integer`
          : null;
      case "ldap_filter":
        return (value.match(/\(/g) || []).length !==
          (value.match(/\)/g) || []).length
          ? validationMessage || t`Check your parentheses`
          : null;
    }
  }

  validateForm() {
    let { elements } = this.props;
    let { formData } = this.state;

    let valid = true,
      validationErrors = {};

    // Validate form only if LDAP is enabled
    if (formData["ldap-enabled"]) {
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
            if (validationErrors[element.key]) valid = false;
          }, this);
        }
      }, this);
    }

    if (
      this.state.valid !== valid ||
      !_.isEqual(this.state.validationErrors, validationErrors)
    ) {
      this.setState({ valid, validationErrors });
    }
  }

  handleChangeEvent(element, value, event) {
    this.setState(previousState => ({
      formData: {
        ...previousState.formData,
        [element.key]: MetabaseUtils.isEmpty(value) ? null : value,
      },
    }));
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

  handleAttributeToggle() {
    this.setState(previousState => ({
      showAttributes: !previousState["showAttributes"],
    }));
  }

  updateLdapSettings(e) {
    e.preventDefault();

    let { formData, valid } = this.state;

    if (valid) {
      this.setState({
        formErrors: null,
        submitting: "working",
      });

      this.props.updateLdapSettings(formData).then(
        () => {
          this.setState({ submitting: "success" });

          // show a confirmation for 3 seconds, then return to normal
          setTimeout(() => this.setState({ submitting: "default" }), 3000);
        },
        error => {
          this.setState({
            submitting: "default",
            formErrors: this.handleFormErrors(error),
          });
        },
      );
    }
  }

  render() {
    const { elements } = this.props;
    const {
      formData,
      formErrors,
      showAttributes,
      submitting,
      valid,
      validationErrors,
    } = this.state;

    let sections = {
      "ldap-enabled": "server",
      "ldap-host": "server",
      "ldap-port": "server",
      "ldap-security": "server",
      "ldap-bind-dn": "server",
      "ldap-password": "server",
      "ldap-user-base": "user",
      "ldap-user-filter": "user",
      "ldap-attribute-email": "attribute",
      "ldap-attribute-firstname": "attribute",
      "ldap-attribute-lastname": "attribute",
      "ldap-group-sync": "group",
      "ldap-group-base": "group",
    };

    const toElement = element => {
      // merge together data from a couple places to provide a complete view of the Element state
      let errorMessage =
        formErrors && formErrors.elements
          ? formErrors.elements[element.key]
          : validationErrors[element.key];
      let value =
        formData[element.key] == null
          ? element.defaultValue
          : formData[element.key];

      if (element.key === "ldap-group-sync") {
        return (
          <SettingsSetting
            key={element.key}
            setting={{ ...element, value }}
            onChange={this.handleChangeEvent.bind(this, element)}
            mappings={formData["ldap-group-mappings"]}
            updateMappings={this.handleChangeEvent.bind(this, {
              key: "ldap-group-mappings",
            })}
            errorMessage={errorMessage}
          />
        );
      }

      return (
        <SettingsSetting
          key={element.key}
          setting={{ ...element, value }}
          onChange={this.handleChangeEvent.bind(this, element)}
          errorMessage={errorMessage}
        />
      );
    };

    let serverSettings = elements
      .filter(e => sections[e.key] === "server")
      .map(toElement);
    let userSettings = elements
      .filter(e => sections[e.key] === "user")
      .map(toElement);
    let attributeSettings = elements
      .filter(e => sections[e.key] === "attribute")
      .map(toElement);
    let groupSettings = elements
      .filter(e => sections[e.key] === "group")
      .map(toElement);

    let saveSettingsButtonStates = {
      default: t`Save changes`,
      working: t`Saving...`,
      success: t`Changes saved!`,
    };

    let disabled = !valid || submitting !== "default";
    let saveButtonText = saveSettingsButtonStates[submitting];

    return (
      <form noValidate>
        <Breadcrumbs
          crumbs={[
            [t`Authentication`, "/admin/settings/authentication"],
            [t`LDAP`],
          ]}
          className="ml2 mb3"
        />
        <h2 className="mx2">{t`Server Settings`}</h2>
        <ul>{serverSettings}</ul>
        <h2 className="mx2">{t`User Schema`}</h2>
        <ul>{userSettings}</ul>
        <div className="mb4">
          <div
            className="inline-block ml1 cursor-pointer text-brand-hover"
            onClick={this.handleAttributeToggle.bind(this)}
          >
            <div className="flex align-center">
              <DisclosureTriangle open={showAttributes} />
              <h3>{t`Attributes`}</h3>
            </div>
          </div>
          <Collapse isOpened={showAttributes} keepCollapsedContent>
            <ul>{attributeSettings}</ul>
          </Collapse>
        </div>
        <h2 className="mx2">{t`Group Schema`}</h2>
        <ul>{groupSettings}</ul>
        <div className="m2 mb4">
          <button
            className={cx(
              "Button mr2",
              { "Button--primary": !disabled },
              { "Button--success-new": submitting === "success" },
            )}
            disabled={disabled}
            onClick={this.updateLdapSettings.bind(this)}
          >
            {saveButtonText}
          </button>
          {formErrors && formErrors.message ? (
            <span className="pl2 text-error text-bold">
              {formErrors.message}
            </span>
          ) : null}
        </div>
      </form>
    );
  }
}
