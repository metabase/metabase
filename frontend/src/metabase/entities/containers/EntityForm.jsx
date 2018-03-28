/* @flow weak */

import React from "react";

import entityType from "./EntityType";
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
function getValue(fnOrValue, ...args) {
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

@entityType()
export default class EntityForm extends React.Component {
  constructor(props) {
    super(props);
    this._updateForm(props);
  }

  static defaultProps = {
    children: StandardForm,
  };

  _FormComponent: any;

  // dynamically generates a component decorated with reduxForm
  _updateForm(props) {
    const { entityDef, entityObject } = this.props;
    if (entityDef.form) {
      const form = makeForm(entityDef.form);
      const formName = `entity-form-${entityDef.name}`;
      const initialValues = entityObject || form.initial();
      // redux-form config:
      const formConfig = {
        form: formName,
        fields: form.fieldNames(initialValues),
        validate: form.validate,
        initialValues: initialValues,
        onSubmit: entityObject =>
          this.handleSubmit(form.normalize(entityObject)),
      };
      const mapStateToProps = (state, ownProps) => {
        const values = getValues(state.form[formName]);
        if (values) {
          return { fields: form.fieldNames(values) };
        } else {
          return {};
        }
      };
      this._FormComponent = reduxForm(formConfig, mapStateToProps)(
        ({ children, ...props }) => children({ ...props, form }),
      );
    }
  }

  handleSubmit = async (object: FormValues) => {
    try {
      if (object.id != null) {
        return await this.props.update(object);
      } else {
        return await this.props.create(object);
      }
    } catch (error) {
      console.error("EntityForm save failed", error);
      // redux-form expects { "FIELD NAME": "ERROR STRING" }
      if (error && error.data && error.data.errors) {
        throw error.data.errors;
      } else {
        throw { _error: error.data.message || error.data };
      }
    }
  };

  render() {
    const { entityObject } = this.props;

    if (!this._FormComponent) {
      return <div>Missing form definition</div>;
    }

    const isUpdating = !!(entityObject && entityObject.id != null);

    const FormComponent = this._FormComponent;
    return (
      <FormComponent
        updating={isUpdating}
        creating={!isUpdating}
        onSubmitSuccess={
          this.props.onSaved &&
          (action => {
            // maybe eventually pass the whole object instead of just the id?
            this.props.onSaved({ id: action.payload.result });
          })
        }
        {...this.props}
      />
    );
  }
}
