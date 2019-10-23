/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";
import { t } from "ttag";
import MetabaseAnalytics from "metabase/lib/analytics";
//import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";

import User from "metabase/entities/users";

import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

import _ from "underscore";

export default class UserStep extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      fieldValues: this.props.userDetails || {
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        site_name: "",
      },
      formError: null,
      passwordError: null,
      valid: false,
      validPassword: false,
    };
  }

  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    activeStep: PropTypes.number.isRequired,
    setActiveStep: PropTypes.func.isRequired,

    userDetails: PropTypes.object,
    setUserDetails: PropTypes.func.isRequired,
    validatePassword: PropTypes.func.isRequired,
  };

  validateForm = () => {
    const { fieldValues, valid, validPassword } = this.state;
    let isValid = true;

    // required: first_name, last_name, email, password
    Object.keys(fieldValues).forEach(fieldName => {
      if (MetabaseUtils.isEmpty(fieldValues[fieldName])) {
        isValid = false;
      }
    });

    if (!validPassword) {
      isValid = false;
    }

    if (isValid !== valid) {
      this.setState({
        valid: isValid,
      });
    }
  };

  onPasswordBlur = async e => {
    try {
      await this.props.validatePassword(this.state.fieldValues.password);

      this.setState(
        {
          passwordError: null,
          validPassword: true,
        },
        this.validateForm,
      );
    } catch (error) {
      this.setState({
        passwordError: error.data.errors.password,
        validPassword: false,
      });

      MetabaseAnalytics.trackEvent("Setup", "Error", "password validation");
    }
  };

  formSubmitted = e => {
    const { fieldValues } = this.state;

    e.preventDefault();

    this.setState({
      formError: null,
    });

    const formErrors = { data: { errors: {} } };

    // validate email address
    if (!MetabaseUtils.validEmail(fieldValues.email)) {
      formErrors.data.errors.email = t`Not a valid formatted email address`;
    }

    // TODO - validate password complexity

    // validate password match
    if (fieldValues.password !== fieldValues.password_confirm) {
      formErrors.data.errors.password_confirm = t`Passwords do not match`;
    }

    if (_.keys(formErrors.data.errors).length > 0) {
      this.setState({
        formError: formErrors,
      });
      return;
    }

    this.props.setUserDetails({
      nextStep: this.props.stepNumber + 1,
      details: _.omit(fieldValues, "password_confirm"),
    });

    MetabaseAnalytics.trackEvent("Setup", "User Details Step");
  };

  updateFieldValue = (fieldName, value) => {
    this.setState(
      {
        fieldValues: {
          ...this.state.fieldValues,
          [fieldName]: value,
        },
      },
      this.validateForm,
    );
  };

  onFirstNameChange = e => this.updateFieldValue("first_name", e.target.value);
  onLastNameChange = e => this.updateFieldValue("last_name", e.target.value);
  onEmailChange = e => this.updateFieldValue("email", e.target.value);
  onPasswordChange = e => this.updateFieldValue("password", e.target.value);
  onPasswordConfirmChange = e =>
    this.updateFieldValue("password_confirm", e.target.value);
  onSiteNameChange = e => this.updateFieldValue("site_name", e.target.value);

  render() {
    const { activeStep, setActiveStep, stepNumber, userDetails } = this.props;
    const { formError } = this.state;

    //const passwordComplexityDesc = MetabaseSettings.passwordComplexityDescription();
    const stepText =
      activeStep <= stepNumber
        ? t`What should we call you?`
        : t`Hi, ${userDetails.first_name}. nice to meet you!`;

    if (activeStep !== stepNumber) {
      return (
        <CollapsedStep
          stepNumber={stepNumber}
          stepCircleText="1"
          stepText={stepText}
          isCompleted={activeStep > stepNumber}
          setActiveStep={setActiveStep}
        />
      );
    } else {
      return (
        <Box
          p={4}
          className="SetupStep SetupStep--active rounded bg-white full relative"
        >
          <StepTitle title={stepText} circleText={"1"} />
          <User.Form submitTitle={t`Next`} formName="setup" error={formError} />
        </Box>
      );
    }
  }
}
