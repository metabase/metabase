import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormCheckboxGroup,
  FormProvider,
  FormSubmitButton,
  requiredErrorMessage,
} from "metabase/forms";
import { Checkbox } from "metabase/ui";

interface FormValues {
  columns: string[];
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
}

const setup = ({
  initialValues = { columns: [] },
  validationSchema,
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
      initialValues: { columns: ["id"] },
    });

    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("Name")).not.toBeChecked();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { columns: ["name"] },
        expect.anything(),
      );
    });
  });

  it("should show validation errors", async () => {
    const validationSchema = Yup.object({
      columns: Yup.array(Yup.string().default(""))
        .default([])
        .min(1, requiredErrorMessage),
    });
    setup({
      initialValues: validationSchema.getDefault(),
      validationSchema: validationSchema,
    });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
