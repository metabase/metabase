import type { StoryFn } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import { FormTextArea } from "./FormTextArea";

export default {
  title: "Components/Ask Before Using/FormTextArea",
  component: FormTextArea,
};

const Template: StoryFn<typeof FormTextArea> = (args) => {
  const initialValues = { value: false };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormTextArea {...args} name="value" />
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
