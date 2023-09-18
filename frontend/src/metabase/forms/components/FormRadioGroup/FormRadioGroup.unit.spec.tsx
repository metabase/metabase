import * as Yup from "yup";
import type { AnySchema } from "yup";
import userEvent from "@testing-library/user-event";
import {
  Form,
  FormRadioGroup,
  FormProvider,
  FormSubmitButton,
  requiredErrorMessage,
} from "metabase/forms";
import { Radio } from "metabase/ui";
import { render, screen, waitFor } from "__support__/ui";

interface FormValues {
  column?: string;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
}

const setup = ({
  initialValues = { column: undefined },
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
        <FormRadioGroup name="column" label="Column">
          <Radio value="id" label="ID" />
          <Radio value="name" label="Name" />
        </FormRadioGroup>
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormRadioGroup", () => {
  it("should show the initial value", () => {
    setup({
      initialValues: { column: "id" },
    });

    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("Name")).not.toBeChecked();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    userEvent.click(screen.getByLabelText("Name"));
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        {
          column: "name",
        },
        expect.anything(),
      );
    });
  });

  it("should show validation errors", async () => {
    const validationSchema = Yup.object({
      column: Yup.string().required(requiredErrorMessage),
    });
    setup({
      initialValues: validationSchema.getDefault(),
      validationSchema: validationSchema,
    });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    userEvent.click(screen.getByLabelText("Name"));
    userEvent.click(screen.getByLabelText("Name"));
    userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
