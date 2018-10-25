/* @flow */

import React from "react";
import PropTypes from "prop-types";

import { reduxForm, getValues } from "redux-form";

import StandardForm from "metabase/components/form/StandardForm";

type FormFieldName = string;
type FormFieldType = "input" | "password" | "select" | "textarea" | "color";

type FormValue = any;
type FormError = string;
type FormValues = { [name: FormFieldName]: FormValue };
type FormErrors = { [name: FormFieldName]: FormError };

type FormFieldDef = {
  name: FormFieldName,
  type: FormFieldType,
  initial?: (() => FormValue) | FormValue,
  normalize?: (value: FormValue) => FormValue,
  validate?: (value: FormValue) => ?FormError,
};

type FormDef = {
  // $FlowFixMe
  fields: ((values: FormValues) => FormFieldDef[]) | FormFieldDef[],
  // $FlowFixMe
  initial?: (() => FormValues) | FormValues,
  normalize?: (values: FormValues) => FormValues,
  validate?: (values: FormValues) => FormErrors,
};

type Form = {
  fields: (values: FormValues) => FormFieldDef[],
  fieldNames: (values: FormValues) => FormFieldName[],
  initial: () => FormValues,
  normalize: (values: FormValues) => FormValues,
  validate: (values: FormValues) => FormErrors,
};

type Props = {
  form: FormDef,
  initialValues?: ?FormValues,
  formName?: string,
  onSubmit: (values: FormValues) => Promise<any>,
  formComponent?: React$Component<any, any, any>,
};

let FORM_ID = 0;

export default class Form_ extends React.Component {
  props: Props;

  _formName: ?string;
  _FormComponent: any;

  constructor(props: Props) {
    super(props);
    this._formName = this.props.formName || `form_${FORM_ID++}`;
    this._updateFormComponent(props);
  }

  static propTypes = {
    form: PropTypes.object.isRequired,
    onSubmit: PropTypes.func.isRequired,
    initialValues: PropTypes.object,
    formName: PropTypes.string,
  };

  static defaultProps = {
    formComponent: StandardForm,
  };

  // dynamically generates a component decorated with reduxForm
  _updateFormComponent(props: Props) {
    if (this.props.form) {
      const form = makeForm(this.props.form);
      const initialValues = {
        ...form.initial(),
        ...(this.props.initialValues || {}),
      };
      // redux-form config:
      const formConfig = {
        form: this._formName,
        fields: form.fieldNames(initialValues),
        validate: form.validate,
        initialValues: initialValues,
        onSubmit: values => this.handleSubmit(form.normalize(values)),
      };
      const mapStateToProps = (state, ownProps) => {
        const values = getValues(state.form[this._formName]);
        if (values) {
          return {
            ...formConfig,
            fields: form.fieldNames(values),
            formDef: form,
          };
        } else {
          return { ...formConfig, formDef: form };
        }
      };
      this._FormComponent = reduxForm(formConfig, mapStateToProps)(
        props.formComponent,
      );
    }
  }

  handleSubmit = async (object: FormValues) => {
    try {
      return await this.props.onSubmit(object);
    } catch (error) {
      console.error("Form save failed", error);
      // redux-form expects { "FIELD NAME": "ERROR STRING" }
      if (error && error.data && error.data.errors) {
        throw error.data.errors;
      } else {
        throw { _error: error.data.message || error.data };
      }
    }
  };

  render() {
    const FormComponent = this._FormComponent;
    if (FormComponent) {
      // eslint-disable-next-line
      const { form, onSubmit, ...props } = this.props;
      return <FormComponent {...props} />;
    } else {
      return <div>Missing form definition</div>;
    }
  }
}

// returns a function that takes an object
// apply the top level method (if any) to the whole object
// then apply each field's method (if any) to each value in object, setting the result if not undefined
//
// equivalent examples:
//
// form.initial is { foo: "bar" }
// form.initial is () => ({ foo: "bar" })
// form.fields[0] is { name: "foo", initial: "bar" }
// form.fields[0] is { name: "foo", initial: () => "bar" }
//
function makeFormMethod(
  form: Form,
  methodName: string,
  defaultValues: any = {},
) {
  const originalMethod = form[methodName];
  form[methodName] = object => {
    const values =
      getValue(originalMethod, object) || getValue(defaultValues, object);
    for (const field of form.fields(object)) {
      const value = getValue(field[methodName], object && object[field.name]);
      if (value !== undefined) {
        values[field.name] = value;
      }
    }
    return values;
  };
}
// if the first arg is a function, call it, otherwise return it.
function getValue(fnOrValue, ...args): any {
  return typeof fnOrValue === "function" ? fnOrValue(...args) : fnOrValue;
}
function makeForm(formDef: FormDef): Form {
  const form = {
    ...formDef,
    fields: values => getValue(formDef.fields, values),
    fieldNames: values => [
      "id",
      ...form.fields(values).map(field => field.name),
    ],
  };
  // for validating the object, or individual values
  makeFormMethod(form, "validate");
  // for getting the initial values object, or getting individual values
  makeFormMethod(form, "initial");
  // for normalizeing the object before submitting, or normalizeing individual values
  makeFormMethod(form, "normalize", object => object);
  return form;
}
