import React from "react";
import Form from "metabase/containers/Form";

export const component = Form;
export const description = `A standard form component.`;
export const examples = {
  normal: (
    <Form
      form={{
        fields: [
          {
            name: "email",
            placeholder: "bob@metabase.com",
            validate: v => (!v ? "required" : null),
          },
          {
            name: "password",
            type: "password",
            validate: v => (!v ? "required" : null),
          },
        ],
      }}
      onSubmit={values => alert(JSON.stringify(values))}
    />
  ),
};
