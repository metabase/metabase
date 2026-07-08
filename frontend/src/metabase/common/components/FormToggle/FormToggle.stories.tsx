import type { StoryFn } from "@storybook/react";

import { Form, FormProvider } from "metabase/forms";

import { FormToggle } from "./FormToggle";

export default {
  title: "Components/Ask Before Using/FormToggle",
  component: FormToggle,
};

const Template: StoryFn<typeof FormToggle> = (args) => {
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
