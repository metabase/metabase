/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";

import { connect } from "react-redux";
import { createSelector } from "reselect";
import { reduxForm, getValues, initialize, change } from "redux-form";
import { assocIn } from "icepick";
import _ from "underscore";
import { t } from "ttag";

import CustomForm from "metabase/components/form/CustomForm";
import StandardForm from "metabase/components/form/StandardForm";

export {
  CustomFormField as FormField,
  CustomFormSubmit as FormSubmit,
  CustomFormMessage as FormMessage,
  CustomFormFooter as FormFooter,
  CustomFormSection as FormSection,
} from "metabase/components/form/CustomForm";

import { makeFormObject, getValue } from "./formUtils";

let FORM_ID = 0;
// use makeMapStateToProps so each component gets it's own unique formId
const makeMapStateToProps = () => {
  const formId = FORM_ID++;
  return (state, ownProps) => {
    const formName = ownProps.formName || `form_${formId}`;
    return {
      formName: formName,
      values: getValues(state.form[formName]),
    };
  };
};

const ReduxFormComponent = reduxForm()(
  ({ handleSubmit, submitState, ...props }) => {
    const FormComponent =
      props.formComponent || (props.children ? CustomForm : StandardForm);
    return (
      <FormComponent
        {...props}
        handleSubmit={async (...args) => {
          await handleSubmit(...args);
          // normally handleSubmit swallows the result/error, but we want to make it available to things like ActionButton
          if (submitState.failed) {
            throw submitState.result;
          } else {
            return submitState.result;
          }
        }}
      />
    );
  },
);

class Form extends React.Component {
  _state = {
    submitting: false,
    failed: false,
    result: undefined,
  };

  constructor(props) {
    super(props);

    this.state = {
      // fields defined via child FormField elements
      inlineFields: {},
    };

    // memoized functions
    const getFormDefinition = createSelector(
      [
        (state, props) => props.form,
        (state, props) => props.validate,
        (state, props) => props.initial,
        (state, props) => props.normalize,
        (state, props) => props.fields,
        (state, props) => state.inlineFields,
      ],
      (form, validate, initial, normalize, fields, inlineFields) => {
        // use props.form if provided, otherwise generate from props.{fields,initial,validate,normalize}
        const formDef = form || {
          validate,
          initial,
          normalize,
          fields: fields || Object.values(inlineFields),
        };
        return {
          ...formDef,
          fields: (...args) =>
            // merge inlineFields in
            getValue(formDef.fields, ...args).map(fieldDef => ({
              ...fieldDef,
              ...inlineFields[fieldDef.name],
            })),
        };
      },
    );
    const getFormObject = createSelector([getFormDefinition], formDef =>
      makeFormObject(formDef),
    );
    const getInitialValues = createSelector(
      [
        getFormObject,
        (state, props) => props.initialValues || {},
        (state, props) => props.values || {},
      ],
      (formObject, initialValues, values) => {
        const formInitialValues = formObject.initial(values);
        // merge nested fields: {details: {foo: 123}} + {details: {bar: 321}} => {details: {foo: 123, bar: 321}}
        const merged = {};
        for (const k of Object.keys(initialValues)) {
          if (
            typeof initialValues[k] === "object" &&
            typeof formInitialValues[k] === "object"
          ) {
            merged[k] = { ...formInitialValues[k], ...initialValues[k] };
          }
        }
        return {
          ...initialValues,
          ...formInitialValues,
          ...merged,
        };
      },
    );
    const getFieldNames = createSelector(
      [getFormObject, getInitialValues, (state, props) => props.values || {}],
      (formObject, initialValues, values) =>
        formObject.fieldNames({
          ...initialValues,
          ...values,
        }),
    );
    this._getFormObject = () => getFormObject(this.state, this.props);
    this._getFormDefinition = () => getFormDefinition(this.state, this.props);
    this._getInitialValues = () => getInitialValues(this.state, this.props);
    this._getFieldNames = () => getFieldNames(this.state, this.props);
  }

  static propTypes = {
    form: PropTypes.object,
    onSubmit: PropTypes.func.isRequired,
    initialValues: PropTypes.object,
    formName: PropTypes.string,
    overwriteOnInitialValuesChange: PropTypes.bool,
  };

  static defaultProps = {
    overwriteOnInitialValuesChange: false,
  };

  static childContextTypes = {
    registerFormField: PropTypes.func,
    unregisterFormField: PropTypes.func,
    fieldNames: PropTypes.array,
  };

  componentDidUpdate(prevProps, prevState) {
    // HACK: when new fields are added they aren't initialized with their intialValues, so we have to force it here:
    const newFields = _.difference(
      Object.keys(this.state.inlineFields),
      Object.keys(prevState.inlineFields),
    );
    if (newFields.length > 0) {
      this.props.dispatch(
        initialize(this.props.formName, this._getInitialValues(), newFields),
      );
    }
    this.props.onChange?.(this.props.values);
  }

  _registerFormField = field => {
    if (!_.isEqual(this.state.inlineFields[field.name], field)) {
      this.setState(prevState =>
        assocIn(prevState, ["inlineFields", field.name], field),
      );
    }
  };

  _unregisterFormField = field => {
    if (this.state.inlineFields[field.name]) {
      // this.setState(prevState =>
      //   dissocIn(prevState, ["inlineFields", field.name]),
      // );
    }
  };

  getChildContext() {
    return {
      registerFormField: this._registerFormField,
      unregisterFormField: this._unregisterFormField,
    };
  }

  _validate = (values, props) => {
    // HACK: clears failed state for global error
    if (!this._state.submitting && this._state.failed) {
      this._state.failed = false;
      props.stopSubmit();
    }
    const formObject = this._getFormObject();
    return formObject.validate(values, props);
  };

  _onSubmit = async values => {
    const formObject = this._getFormObject();
    // HACK: clears failed state for global error
    this._state.submitting = true;
    try {
      const normalized = formObject.normalize(values);
      return (this._state.result = await this.props.onSubmit(normalized));
    } catch (error) {
      console.error("Form submission error:", error);
      this._state.failed = true;
      this._state.result = error;
      // redux-form expects { "FIELD NAME": "FIELD ERROR STRING" } or {"_error": "GLOBAL ERROR STRING" }
      if (error && error.data && error.data.errors) {
        try {
          // HACK: blur the current element to ensure we show the error
          document.activeElement.blur();
        } catch (e) {}
        // if there are errors for fields we don't know about then inject a generic top-level _error key
        const fieldNames = new Set(this._getFieldNames());
        const errorNames = Object.keys(error.data.errors);
        const hasUnknownFields = errorNames.some(name => !fieldNames.has(name));
        throw {
          _error:
            error.data?.message ||
            error.message ||
            (hasUnknownFields ? t`An error occurred` : null),
          ...error.data.errors,
        };
      } else if (error) {
        throw {
          _error:
            error.data?.message ||
            error.message ||
            error.data ||
            t`An error occurred`,
        };
      }
    } finally {
      setTimeout(() => (this._state.submitting = false));
    }
  };

  _handleSubmitSuccess = async action => {
    if (this.props.onSubmitSuccess) {
      await this.props.onSubmitSuccess(action);
    }
    this.props.dispatch(
      initialize(this.props.formName, this.props.values, this._getFieldNames()),
    );
  };

  _handleChangeField = (fieldName, value) => {
    return this.props.dispatch(change(this.props.formName, fieldName, value));
  };

  render() {
    // eslint-disable-next-line
    const { formName, overwriteOnInitialValuesChange } = this.props;
    const formObject = this._getFormObject();
    const initialValues = this._getInitialValues();
    const fieldNames = this._getFieldNames();
    return (
      <ReduxFormComponent
        {...this.props}
        overwriteOnInitialValuesChange={overwriteOnInitialValuesChange}
        formObject={formObject}
        // redux-form props:
        form={formName}
        fields={fieldNames}
        initialValues={initialValues}
        validate={this._validate}
        onSubmit={this._onSubmit}
        onSubmitSuccess={this._handleSubmitSuccess}
        onChangeField={this._handleChangeField}
        // HACK: _state is a mutable object so we can pass by reference into the ReduxFormComponent
        submitState={this._state}
      />
    );
  }
}

export default connect(makeMapStateToProps)(Form);
