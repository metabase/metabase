import { TextInput } from "metabase/ui";

import { FormField, type FormFieldProps } from "./FormField";

const FormFieldTemplate = (args: FormFieldProps) => {
  return (
    <FormField {...args}>
      <TextInput placeholder="Type something here" />
    </FormField>
  );
};

export default {
  title: "Forms/Form Field",
  component: FormField,
  args: {
    title: "Your Input",
    description: "Something Helpful",
  },
};

export const Default = {
  render: FormFieldTemplate,
};
