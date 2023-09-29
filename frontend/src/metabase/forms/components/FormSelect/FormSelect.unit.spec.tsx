import type { AnySchema } from "yup";
import * as Yup from "yup";
import userEvent from "@testing-library/user-event";
import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  requiredErrorMessage,
} from "metabase/forms";
import { render, screen, waitFor } from "__support__/ui";

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

    userEvent.click(screen.getByLabelText("Display"));
    userEvent.click(screen.getByText("Line"));
    userEvent.click(screen.getByText("Submit"));

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

    userEvent.click(screen.getByLabelText("Clear"));
    userEvent.click(screen.getByText("Submit"));

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

    userEvent.click(screen.getByLabelText("Clear"));
    userEvent.click(screen.getByText("Submit"));

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

    userEvent.click(screen.getByPlaceholderText("No display type"));
    userEvent.click(screen.getByText("Line"));
    userEvent.click(screen.getByLabelText("Clear"));
    userEvent.tab();

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

    userEvent.click(screen.getByPlaceholderText("No display type"));
    userEvent.click(screen.getByText("Line"));
    userEvent.click(screen.getByLabelText("Clear"));
    userEvent.tab();

    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
