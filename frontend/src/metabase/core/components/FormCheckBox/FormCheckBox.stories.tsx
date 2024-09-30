import type { StoryFn } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import FormCheckBox from "./FormCheckBox";

export default {
  title: "Core/FormCheckBox",
  component: FormCheckBox,
};

const Template: StoryFn<typeof FormCheckBox> = args => {
  const initialValues = { value: false };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormCheckBox {...args} name="value" />
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
