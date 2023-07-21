/* eslint-disable react/prop-types */
import { Component } from "react";

import * as React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";

import Collapse from "react-collapse";
import { t } from "ttag";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import Button from "metabase/core/components/Button";
import DisclosureTriangle from "metabase/components/DisclosureTriangle";
import MetabaseUtils from "metabase/lib/utils";
import { updateSettings as defaultUpdateSettings } from "../settings";
import SettingsSetting from "./SettingsSetting";

const VALIDATIONS = {
  email: {
    validate: value => MetabaseUtils.isEmail(value),
    message: t`That's not a valid email address`,
  },
  email_list: {
    validate: value => value.every(MetabaseUtils.isEmail),
    message: t`That's not a valid email address`,
  },
  integer: {
    validate: value => !isNaN(parseInt(value)),
    message: t`That's not a valid integer`,
  },
};

const SAVE_SETTINGS_BUTTONS_STATES = {
  default: t`Save changes`,
  working: t`Saving...`,
  success: t`Changes saved!`,
};

class SettingsBatchForm extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      pristine: true,
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
    renderSubmitButton: PropTypes.func,
    renderExtraButtons: PropTypes.func,
  };

  componentDidMount() {
    this.updateFormData();
    this.validateForm();
  }

  componentDidUpdate(prevProps) {
    if (this.props.elements !== prevProps.elements) {
      this.updateFormData();
    }

    this.validateForm();
  }

  updateFormData() {
    const formData = {};
    for (const element of this.props.elements) {
      formData[element.key] = element.value;
    }
    this.setState({ formData, pristine: true });
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
    const { elements, enabledKey } = this.props;
    const { formData } = this.state;

    let valid = true;
    const validationErrors = {};
    const availableElements = elements.filter(e => !e.is_env_setting);

    // Validate form only if LDAP is enabled
    if (!enabledKey || formData[enabledKey]) {
      availableElements.forEach(function (element) {
        // test for required elements
        if (element.required && MetabaseUtils.isEmpty(formData[element.key])) {
          valid = false;
        }

        if (element.validations) {
          element.validations.forEach(function (validation) {
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

  handleChangeEvent = (key, value) => {
    this.setState(previousState => {
      const settingsValues = {
        ...previousState.formData,
        [key]: value,
      };

      // support "onChanged"
      const setting = _.findWhere(this.props.elements, { key });
      if (setting && setting.onChanged) {
        setting.onChanged(
          previousState.formData[key],
          settingsValues[key],
          settingsValues,
          this.handleChangeEvent,
        );
      }

      const pristine = this.props.elements.every(
        ({ key, value }) => settingsValues[key] === value,
      );

      return {
        pristine,
        formData: settingsValues,
      };
    });
  };

  handleFormErrors(error) {
    // parse and format
    const formErrors = {};
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

  handleSubmit = () => {
    const { updateSettings } = this.props;
    const { formData, valid } = this.state;

    if (valid) {
      this.setState({
        formErrors: null,
        submitting: "working",
      });

      return updateSettings(formData).then(
        () => {
          this.setState({ pristine: true, submitting: "success" });

          // show a confirmation for 3 seconds, then return to normal
          setTimeout(() => this.setState({ submitting: "default" }), 3000);
        },
        error => {
          this.setState({
            submitting: "default",
            formErrors: this.handleFormErrors(error),
          });
          throw error;
        },
      );
    }
  };

  handleSubmitClick = event => {
    event.preventDefault();
    this.handleSubmit();
  };

  render() {
    const {
      elements,
      settingValues,
      breadcrumbs,
      renderSubmitButton,
      renderExtraButtons,
    } = this.props;

    const {
      formData,
      formErrors,
      submitting,
      pristine,
      valid,
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
      const errorMessage =
        formErrors && formErrors.elements
          ? formErrors.elements[element.key]
          : validationErrors[element.key];
      const value =
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
          fireOnChange
        />
      );
    };

    const disabled = !valid || submitting !== "default";
    return (
      <div>
        {breadcrumbs && (
          <Breadcrumbs crumbs={breadcrumbs} className="ml2 mb3" />
        )}

        {layout.map((section, index) =>
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

        {formErrors && formErrors.message && (
          <div className="m2 text-error text-bold">{formErrors.message}</div>
        )}

        <div className="m2 mb4">
          {renderSubmitButton ? (
            renderSubmitButton({
              valid,
              submitting,
              disabled,
              pristine,
              onSubmit: this.handleSubmit,
            })
          ) : (
            <Button
              className="mr1"
              primary={!disabled}
              success={submitting === "success"}
              disabled={disabled || pristine}
              onClick={this.handleSubmitClick}
            >
              {SAVE_SETTINGS_BUTTONS_STATES[submitting]}
            </Button>
          )}

          {renderExtraButtons &&
            renderExtraButtons({
              valid,
              submitting,
              disabled,
              pristine,
              onSubmit: this.handleSubmit,
            })}
        </div>
      </div>
    );
  }
}

export default connect(
  null,
  (dispatch, { updateSettings }) => ({
    updateSettings:
      updateSettings || (settings => dispatch(defaultUpdateSettings(settings))),
  }),
  null,
  { forwardRef: true }, // HACK: needed so consuming components can call methods on the component :-/
)(SettingsBatchForm);

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
            <DisclosureTriangle className="mx1" open={show} />
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
