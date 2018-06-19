import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";

import Collapse from "react-collapse";
import { t } from "c-3po";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import Button from "metabase/components/Button";
import DisclosureTriangle from "metabase/components/DisclosureTriangle";
import MetabaseUtils from "metabase/lib/utils";
import SettingsSetting from "./SettingsSetting";

const VALIDATIONS = {
  email: {
    validate: value => MetabaseUtils.validEmail(value),
    message: t`That's not a valid email address`,
  },
  integer: {
    validate: value => !isNaN(parseInt(value)),
    message: t`That's not a valid integer`,
  },
};

let SAVE_SETTINGS_BUTTONS_STATES = {
  default: t`Save changes`,
  working: t`Saving...`,
  success: t`Changes saved!`,
};

export default class SettingsBatchForm extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      dirty: false,
      formData: {},
      submitting: "default",
      valid: false,
      validationErrors: {},
    };
  }

  static propTypes = {
    elements: PropTypes.array.isRequired,
    formErrors: PropTypes.object,
    updateSettings: PropTypes.func.isRequired,
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
  validateElement(validation, value, element) {
    if (MetabaseUtils.isEmpty(value)) {
      return;
    }

    if (typeof validation === "function") {
      return validation(value);
    }

    const [validationType, validationMessage] = validation;

    if (!VALIDATIONS[validationType]) {
      console.warn("Unknown validation " + validationType);
    }

    if (!VALIDATIONS[validationType].validate(value)) {
      return validationMessage || VALIDATIONS[validationType].message;
    }
  }

  validateForm() {
    let { elements, enabledKey } = this.props;
    let { formData } = this.state;

    let valid = true,
      validationErrors = {};

    // Validate form only if LDAP is enabled
    if (!enabledKey || formData[enabledKey]) {
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
    }

    if (
      this.state.valid !== valid ||
      !_.isEqual(this.state.validationErrors, validationErrors)
    ) {
      this.setState({ valid, validationErrors });
    }
  }

  handleChangeEvent(key, value) {
    this.setState(previousState => ({
      dirty: true,
      formData: {
        ...previousState.formData,
        [key]: MetabaseUtils.isEmpty(value) ? null : value,
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

  updateSettings = e => {
    e.preventDefault();

    let { formData, valid } = this.state;

    if (valid) {
      this.setState({
        formErrors: null,
        submitting: "working",
      });

      this.props.updateSettings(formData).then(
        () => {
          this.setState({ dirty: false, submitting: "success" });

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
  };

  render() {
    const { elements, settingValues } = this.props;
    const {
      formData,
      formErrors,
      submitting,
      valid,
      dirty,
      validationErrors,
    } = this.state;

    const layout = this.props.layout || [
      { settings: elements.map(element => element.key) },
    ];
    const settings = _.indexBy(elements, "key");

    const getSetting = key => {
      const element = settings[key];
      if (!element) {
        console.warn("Missing setting", element);
        return null;
      }
      // merge together data from a couple places to provide a complete view of the Element state
      let errorMessage =
        formErrors && formErrors.elements
          ? formErrors.elements[element.key]
          : validationErrors[element.key];
      let value =
        formData[element.key] == null
          ? element.defaultValue
          : formData[element.key];

      return (
        <SettingsSetting
          key={element.key}
          setting={{ ...element, value }}
          onChange={value => this.handleChangeEvent(element.key, value)}
          settingValues={settingValues}
          onChangeSetting={(key, value) => this.handleChangeEvent(key, value)}
          errorMessage={errorMessage}
        />
      );
    };

    const disabled = !valid || submitting !== "default";
    return (
      <div>
        {this.props.breadcrumbs && (
          <Breadcrumbs crumbs={this.props.breadcrumbs} className="ml2 mb3" />
        )}

        {layout.map(
          (section, index) =>
            section.collapse ? (
              <CollapsibleSection title={section.title} key={index}>
                {section.settings.map(key => getSetting(key))}
              </CollapsibleSection>
            ) : (
              <StandardSection title={section.title} key={index}>
                {section.settings.map(key => getSetting(key))}
              </StandardSection>
            ),
        )}

        <div className="m2 mb4">
          <Button
            mr={1}
            primary={!disabled}
            success={submitting === "success"}
            disabled={disabled}
            onClick={this.updateSettings}
          >
            {SAVE_SETTINGS_BUTTONS_STATES[submitting]}
          </Button>

          {this.props.renderExtraButtons &&
            this.props.renderExtraButtons({
              valid,
              submitting,
              disabled,
              dirty,
            })}

          {formErrors && formErrors.message ? (
            <span className="pl3 text-error text-bold">
              {formErrors.message}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
}

const StandardSection = ({ title, children }) => (
  <div>
    {title && <h2 className="mx2">{title}</h2>}
    <ul>{children}</ul>
  </div>
);

class CollapsibleSection extends React.Component {
  state = {
    show: false,
  };

  handleToggle() {
    this.setState(previousState => ({
      show: !previousState.show,
    }));
  }
  render() {
    const { title, children } = this.props;
    const { show } = this.state;
    return (
      <section className="mb4">
        <div
          className="inline-block ml1 cursor-pointer text-brand-hover"
          onClick={this.handleToggle.bind(this)}
        >
          <div className="flex align-center">
            <DisclosureTriangle open={show} />
            <h3>{title}</h3>
          </div>
        </div>
        <Collapse isOpened={show} keepCollapsedContent>
          <ul>{children}</ul>
        </Collapse>
      </section>
    );
  }
}
