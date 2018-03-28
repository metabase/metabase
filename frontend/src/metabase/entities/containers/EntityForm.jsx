import React from "react";

import entityType from "./EntityType";
import { reduxForm } from "redux-form";

import StandardForm from "metabase/components/form/StandardForm";

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
function getFormMethod(form, methodName, defaultValues = {}) {
  return object => {
    const values =
      getValue(form[methodName], object) || getValue(defaultValues, object);
    for (const field of form.fields) {
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

@entityType()
export default class EntityForm extends React.Component {
  constructor(props) {
    super(props);
    this._updateForm(props);
  }

  static defaultProps = {
    children: StandardForm,
  };

  // dynamically generates a component decorated with reduxForm
  _updateForm(props) {
    const { entityDef, entityObject } = this.props;
    const { form } = entityDef;
    if (form) {
      // for validating the object, or individual values
      const validate = getFormMethod(form, "validate");
      // for getting the initial values object, or getting individual values
      const initial = getFormMethod(form, "initial");
      // for transforming the object before submitting, or transforming individual values
      const transform = getFormMethod(form, "transform", object => object);
      // redux-form config:
      const formConfig = {
        form: `entity-form-${entityDef.name}`,
        // every listed field plus "id"
        fields: ["id", ...form.fields.map(field => field.name)],
        validate: validate,
        initialValues: entityObject || initial(),
        onSubmit: entityObject => this.handleSubmit(transform(entityObject)),
      };
      this._FormComponent = reduxForm(formConfig)(({ children, ...props }) =>
        children({ ...props, form }),
      );
    }
  }

  handleSubmit = async object => {
    try {
      if (object.id != null) {
        return await this.props.update(object);
      } else {
        return await this.props.create(object);
      }
    } catch (error) {
      console.error("EntityForm save failed", error);
      // redux-form expects { "FIELD NAME": "ERROR STRING" }
      if (error.data.errors) {
        throw error.data.errors;
      } else {
        throw { _error: error.data.message };
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
