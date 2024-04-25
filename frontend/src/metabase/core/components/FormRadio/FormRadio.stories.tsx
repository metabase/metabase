import type { ComponentStory } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import FormRadio from "./FormRadio";

const TEST_OPTIONS = [
  { name: "Line", value: "line" },
  { name: "Area", value: "area" },
  { name: "Bar", value: "bar" },
];

export default {
  title: "Core/FormRadio",
  component: FormRadio,
};

const Template: ComponentStory<typeof FormRadio> = args => {
  const initialValues = { value: undefined };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormRadio {...args} name="value" options={TEST_OPTIONS} />
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
