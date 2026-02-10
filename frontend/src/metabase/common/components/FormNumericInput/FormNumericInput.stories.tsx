import type { StoryFn } from "@storybook/react-webpack5";

import { Form, FormProvider } from "metabase/forms";

import { FormNumericInput } from "./FormNumericInput";

export default {
  title: "Components/Ask Before Using/FormNumericInput",
  component: FormNumericInput,
};

const Template: StoryFn<typeof FormNumericInput> = (args) => {
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
