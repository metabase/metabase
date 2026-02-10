import type { StoryFn } from "@storybook/react-webpack5";

import { Form, FormProvider } from "metabase/forms";

import { FormSelect } from "./FormSelect";

const TEST_OPTIONS = [
  { name: "Line", value: "line" },
  { name: "Area", value: "area" },
  { name: "Bar", value: "bar" },
];

export default {
  title: "Components/Ask Before Using/FormSelect",
  component: FormSelect,
};

const Template: StoryFn<typeof FormSelect> = (args) => {
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

export const Default = {
  render: Template,

  args: {
    title: "Title",
    placeholder: "Use default",
  },
};

export const WithDescription = {
  render: Template,

  args: {
    title: "Title",
    placeholder: "Use default",
    description: "Description",
  },
};
