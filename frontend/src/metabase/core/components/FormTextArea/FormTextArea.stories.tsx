import React from "react";
import type { ComponentStory } from "@storybook/react";
import Form from "../Form";
import FormProvider from "../FormProvider";
import FormTextArea from "./FormTextArea";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/FormTextArea",
  component: FormTextArea,
};

const Template: ComponentStory<typeof FormTextArea> = args => {
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

export const Default = Template.bind({});
Default.args = {
  title: "Title",
};

export const WithDescription = Template.bind({});
WithDescription.args = {
  title: "Title",
  description: "Description",
};
