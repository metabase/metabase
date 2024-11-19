import type { StoryFn } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import FormFileInput from "./FormFileInput";

export default {
  title: "Core/FormFileInput",
  component: FormFileInput,
};

const Template: StoryFn<typeof FormFileInput> = args => {
  const initialValues = { value: undefined };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormFileInput {...args} name="value" />
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
