import React from "react";
import PropTypes from "prop-types";

import FormField from "metabase/components/form/FormField";
import FormWidget from "metabase/components/form/FormWidget";
import FormMessage from "metabase/components/form/FormMessage";

import Button from "metabase/components/Button";

import _ from "underscore";

import { t } from "ttag";
import { getIn } from "icepick";

class CustomForm extends React.Component {
  static childContextTypes = {
    handleSubmit: PropTypes.func,
    className: PropTypes.string,
    style: PropTypes.object,
    fields: PropTypes.object,
    formFields: PropTypes.array,
    formFieldsByName: PropTypes.object,
    values: PropTypes.object,
    submitting: PropTypes.bool,
    invalid: PropTypes.bool,
    error: PropTypes.string,
  };

  getChildContext() {
    const {
      fields,
      values,
      formDef: form,
      submitting,
      invalid,
      error,
      handleSubmit,
      className,
      style,
    } = this.props;
    const formFields = form.fields(values);
    const formFieldsByName = _.indexBy(formFields, "name");

    return {
      handleSubmit,
      className,
      style,
      fields,
      formFields,
      formFieldsByName,
      values,
      submitting,
      invalid,
      error,
    };
  }

  render() {
    const { formDef: form, values, children } = this.props;
    if (typeof children === "function") {
      return children({
        ...this.props,
        form: form,
        formFields: form.fields(values),
        Form: Form,
        FormField: CustomFormField,
        FormSubmit: CustomFormSubmit,
        FormMessage: CustomFormMessage,
      });
    } else {
      return <Form>{children}</Form>;
    }
  }
}

const Form = ({ children }, { handleSubmit, className, style }) => (
  <form onSubmit={handleSubmit} className={className} style={style}>
    {children}
  </form>
);
Form.contextTypes = {
  handleSubmit: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object,
};

export const CustomFormField = ({ name }, { fields, formFieldsByName }) => {
  const field = getIn(fields, name.split("."));
  const formField = formFieldsByName[name];
  if (!field || !formField) {
    return null;
  }
  return (
    <FormField field={field} formField={formField}>
      <FormWidget field={field} formField={formField} />
    </FormField>
  );
};
CustomFormField.contextTypes = {
  fields: PropTypes.object,
  formFieldsByName: PropTypes.object,
};

export const CustomFormSubmit = (
  { children = t`Submit` },
  { values, submitting, invalid },
) => (
  <Button
    type="submit"
    primary={!(submitting || invalid)}
    disabled={submitting || invalid}
  >
    {children}
  </Button>
);
CustomFormSubmit.contextTypes = {
  values: PropTypes.object,
  submitting: PropTypes.bool,
  invalid: PropTypes.bool,
};

export const CustomFormMessage = (props, { error }) =>
  error ? <FormMessage message={error} formError /> : null;
CustomFormMessage.contextTypes = {
  error: PropTypes.string,
};

export default CustomForm;
