import type { StoryFn } from "@storybook/react-webpack5";
import { useState } from "react";

import { Form, FormProvider } from "metabase/forms";

import { CheckBox } from "../CheckBox";

import { FormInput } from "./FormInput";

const TitleActions = () => {
  const [checked, setChecked] = useState(true);
  return (
    <CheckBox
      onChange={() => setChecked((checked) => !checked)}
      checked={checked}
      label="Show field"
    />
  );
};

export default {
  title: "Components/Ask Before Using/FormInput",
  component: FormInput,
  argTypes: {
    actions: {
      mapping: {
        Default: <TitleActions />,
      },
    },
  },
};

const Template: StoryFn<typeof FormInput> = (args) => {
  const initialValues = { value: false };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormInput {...args} name="value" />
      </Form>
    </FormProvider>
  );
};

export const Default = {
  render: Template,

  args: {
    title: "Title",
  },
};

export const WithDescription = {
  render: Template,

  args: {
    title: "Title",
    description: "Description",
  },
};

export const WithTitleAndActions = {
  render: Template,

  args: {
    title: "Title",
    description: "Description",
    optional: true,
    actions: "Default",
  },
};
