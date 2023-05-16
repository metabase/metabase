import React from "react";
import type { ComponentStory } from "@storybook/react";
import Form from "../Form";
import FormProvider from "../FormProvider";
import FormCheckBox from "./FormCheckBox";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/FormCheckBox",
  component: FormCheckBox,
};

const Template: ComponentStory<typeof FormCheckBox> = args => {
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

export const Default = Template.bind({});
Default.args = {
  title: "Title",
};

export const WithDescription = Template.bind({});
WithDescription.args = {
  title: "Title",
  description: "Description",
};
