import React from "react";
import type { ComponentStory } from "@storybook/react";
import Form from "../Form";
import FormProvider from "../FormProvider";
import FormNumericInput from "./FormNumericInput";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/FormNumericInput",
  component: FormNumericInput,
};

const Template: ComponentStory<typeof FormNumericInput> = args => {
  const initialValues = { value: undefined };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormNumericInput {...args} name="value" />
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
