import type { ComponentStory } from "@storybook/react";
import Form from "../Form";
import FormProvider from "../FormProvider";
import FormDateInput from "./FormDateInput";

export default {
  title: "Core/FormDateInput",
  component: FormDateInput,
};

const Template: ComponentStory<typeof FormDateInput> = args => {
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

export const Default = Template.bind({});
Default.args = {
  title: "Title",
};

export const WithDescription = Template.bind({});
WithDescription.args = {
  title: "Title",
  description: "Description",
};
