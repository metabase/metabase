import React from "react";

import Form, { FormField, FormFooter } from "metabase/containers/Form";
import validate from "metabase/lib/validate";

const FORM = {
  fields: [
    {
      name: "email",
      placeholder: "bob@metabase.com",
      validate: validate.required().email(),
    },
    {
      name: "password",
      type: "password",
      validate: validate.required().passwordComplexity(),
    },
  ],
};

export const component = Form;
export const category = "form";
export const description = `A standard form component.`;
export const examples = {
  "with form prop": (
    <Form form={FORM} onSubmit={values => alert(JSON.stringify(values))} />
  ),
  "with inline fields": (
    <Form onSubmit={values => alert(JSON.stringify(values))}>
      <FormField
        name="email"
        placeholder="bob@metabase.com"
        validate={validate.required()}
      />
      <FormField
        name="password"
        type="password"
        validate={validate.required().passwordComplexity()}
      />
      <FormFooter />
    </Form>
  ),
  "with form prop and custom layout fields": (
    <Form form={FORM} onSubmit={values => alert(JSON.stringify(values))}>
      <FormField name="password" />
      <FormField name="email" />
      <FormFooter />
    </Form>
  ),
};
