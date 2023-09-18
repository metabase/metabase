import type { AnySchema } from "yup";
import {
  Form,
  FormCheckboxGroup,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Checkbox } from "metabase/ui";
import { render, screen } from "__support__/ui";

interface FormValues {
  columns: string[];
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
  nullable?: boolean;
}

const setup = ({
  initialValues = { columns: [] },
  validationSchema,
  nullable,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <FormCheckboxGroup name="columns" label="Columns">
          <Checkbox value="id" label="ID" />
          <Checkbox value="name" label="Name" />
        </FormCheckboxGroup>
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormCheckboxGroup", () => {
  it("should show the initial value", () => {
    setup({
      initialValues: { columns: ["ID"] },
    });

    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("Name")).not.toBeChecked();
  });
});
