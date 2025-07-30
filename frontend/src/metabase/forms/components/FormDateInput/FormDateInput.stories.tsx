import type { StoryFn } from "@storybook/react-webpack5";

import { Form, FormProvider } from "metabase/forms";

import { FormDateInput } from "./FormDateInput";

export default {
  title: "Components/Ask Before Using/FormDateInput",
  component: FormDateInput,
};

const Template: StoryFn<typeof FormDateInput> = (args) => {
  const initialValues = { value: undefined };
  const handleSubmit = () => undefined;

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <Form>
        <FormDateInput {...args} name="value" />
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
