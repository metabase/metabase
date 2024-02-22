import type { ComponentStory } from "@storybook/react";
import { useState } from "react";

import { Form, FormProvider } from "metabase/forms";

import CheckBox from "../CheckBox";

import FormInput from "./FormInput";

const TitleActions = () => {
  const [checked, setChecked] = useState(true);
  return (
    <CheckBox
      onChange={() => setChecked(checked => !checked)}
      checked={checked}
      label="Show field"
    />
  );
};

export default {
  title: "Core/FormInput",
  component: FormInput,
  argTypes: {
    actions: {
      mapping: {
        Default: <TitleActions />,
      },
    },
  },
};

const Template: ComponentStory<typeof FormInput> = args => {
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

export const Default = Template.bind({});
Default.args = {
  title: "Title",
};

export const WithDescription = Template.bind({});
WithDescription.args = {
  title: "Title",
  description: "Description",
};

export const WithTitleAndActions = Template.bind({});
WithTitleAndActions.args = {
  title: "Title",
  description: "Description",
  optional: true,
  actions: "Default",
};
