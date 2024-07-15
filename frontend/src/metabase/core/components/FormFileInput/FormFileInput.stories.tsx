import type { ComponentStory } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import FormFileInput from "./FormFileInput";

export default {
  title: "Core/FormFileInput",
  component: FormFileInput,
};

const Template: ComponentStory<typeof FormFileInput> = args => {
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

export const Default = Template.bind({});
Default.args = {
  title: "Title",
};

export const WithDescription = Template.bind({});
WithDescription.args = {
  title: "Title",
  description: "Description",
};
