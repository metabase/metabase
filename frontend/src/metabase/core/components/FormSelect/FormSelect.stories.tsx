import type { ComponentStory } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import FormSelect from "./FormSelect";

const TEST_OPTIONS = [
  { name: "Line", value: "line" },
  { name: "Area", value: "area" },
  { name: "Bar", value: "bar" },
];

export default {
  title: "Core/FormSelect",
  component: FormSelect,
};

const Template: ComponentStory<typeof FormSelect> = args => {
  const initialValues = { value: undefined };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormSelect {...args} name="value" options={TEST_OPTIONS} />
      </Form>
    </FormProvider>
  );
};

export const Default = Template.bind({});
Default.args = {
  title: "Title",
  placeholder: "Use default",
};

export const WithDescription = Template.bind({});
WithDescription.args = {
  title: "Title",
  placeholder: "Use default",
  description: "Description",
};
