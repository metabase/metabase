import type { StoryFn } from "@storybook/react";

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

const Template: StoryFn<typeof FormRadio> = args => {
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
