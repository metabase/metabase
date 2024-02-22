import type { ComponentStory } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import FormToggle from "./FormToggle";

export default {
  title: "Core/FormToggle",
  component: FormToggle,
};

const Template: ComponentStory<typeof FormToggle> = args => {
  const initialValues = { value: false };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormToggle {...args} name="value" />
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
