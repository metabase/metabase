import * as Yup from "yup";
import type { AnySchema } from "yup";
import userEvent from "@testing-library/user-event";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  requiredErrorMessage,
} from "metabase/forms";
import { getIcon, queryIcon, render, screen, waitFor } from "__support__/ui";

interface FormValues {
  name: string | null | undefined;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
  nullable?: boolean;
  hasCopyButton?: boolean;
}

const setup = ({
  initialValues = { name: "" },
  validationSchema,
  nullable,
  hasCopyButton,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <FormTextInput
          name="name"
          label="Name"
          {...{ nullable, hasCopyButton }}
        />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormTextInput", () => {
  it("should show the initial value", async () => {
    setup({
      initialValues: { name: "Test" },
    });

    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
  });

  it("should show copy button when enabled", () => {
    setup({
      initialValues: { name: "Test" },
      hasCopyButton: true,
    });

    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
    expect(getIcon("copy")).toBeInTheDocument();
  });

  it("should not show copy button when disabled", () => {
    setup({
      initialValues: { name: "Test" },
      hasCopyButton: false,
    });

    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
    expect(queryIcon("copy")).not.toBeInTheDocument();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    userEvent.type(screen.getByLabelText("Name"), "Test");
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { name: "Test" },
        expect.anything(),
      );
    });
  });

  it("should submit an empty value", async () => {
    const { onSubmit } = setup({
      initialValues: { name: "Test" },
    });

    userEvent.clear(screen.getByLabelText("Name"));
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { name: undefined },
        expect.anything(),
      );
    });
  });

  it("should submit an empty nullable value", async () => {
    const { onSubmit } = setup({
      initialValues: { name: "Test" },
      nullable: true,
    });

    userEvent.clear(screen.getByLabelText("Name"));
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: null }, expect.anything());
    });
  });

  it("should show validation errors", async () => {
    const validationSchema = Yup.object({
      name: Yup.string().default("").required(requiredErrorMessage),
    });
    setup({ initialValues: validationSchema.getDefault(), validationSchema });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    userEvent.type(screen.getByLabelText("Name"), "Test");
    userEvent.clear(screen.getByLabelText("Name"));
    userEvent.tab();

    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });

  it("should show validation errors with nullable values", async () => {
    const validationSchema = Yup.object({
      name: Yup.string()
        .nullable()
        .default(null)
        .required(requiredErrorMessage),
    });
    setup({ initialValues: validationSchema.getDefault(), validationSchema });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    userEvent.type(screen.getByLabelText("Name"), "Test");
    userEvent.clear(screen.getByLabelText("Name"));
    userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
