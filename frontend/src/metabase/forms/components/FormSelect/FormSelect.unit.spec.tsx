import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  requiredErrorMessage,
} from "metabase/forms";

const OPTIONS = [
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
];

interface FormValues {
  display: string | null | undefined;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
  nullable?: boolean;
}

const setup = ({
  initialValues = { display: undefined },
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
        <FormSelect
          name="display"
          label="Display"
          data={OPTIONS}
          placeholder="No display type"
          nullable={nullable}
          clearable
          clearButtonProps={{
            "aria-label": "Clear",
          }}
        />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormSelect", () => {
  it("should show the initial value", () => {
    setup({
      initialValues: { display: "line" },
    });

    expect(screen.getByDisplayValue("Line")).toBeInTheDocument();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByLabelText("Display"));
    await userEvent.click(screen.getByText("Line"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { display: "line" },
        expect.anything(),
      );
    });
  });

  it("should submit an empty value", async () => {
    const { onSubmit } = setup({
      initialValues: { display: "line" },
    });

    await userEvent.click(screen.getByLabelText("Clear"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { display: undefined },
        expect.anything(),
      );
    });
  });

  it("should submit an empty nullable value", async () => {
    const { onSubmit } = setup({
      initialValues: { display: "line" },
      nullable: true,
    });

    await userEvent.click(screen.getByLabelText("Clear"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { display: null },
        expect.anything(),
      );
    });
  });

  it("should show validation errors", async () => {
    const validationSchema = Yup.object({
      display: Yup.string().required(requiredErrorMessage),
    });

    setup({ initialValues: validationSchema.getDefault(), validationSchema });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText("No display type"));
    await userEvent.click(screen.getByText("Line"));
    await userEvent.click(screen.getByLabelText("Clear"));
    await userEvent.tab();

    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });

  it("should show validation errors with nullable values", async () => {
    const validationSchema = Yup.object({
      display: Yup.string()
        .nullable()
        .default(null)
        .required(requiredErrorMessage),
    });
    setup({
      initialValues: validationSchema.getDefault(),
      validationSchema,
      nullable: true,
    });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText("No display type"));
    await userEvent.click(screen.getByText("Line"));
    await userEvent.click(screen.getByLabelText("Clear"));
    await userEvent.tab();

    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
