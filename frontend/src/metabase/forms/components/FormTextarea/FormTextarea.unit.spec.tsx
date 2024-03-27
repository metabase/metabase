import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextarea,
  requiredErrorMessage,
} from "metabase/forms";

interface FormValues {
  name: string | null | undefined;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
  nullable?: boolean;
}

const setup = ({
  initialValues = { name: "" },
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
        <FormTextarea name="name" label="Name" nullable={nullable} />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormTextarea", () => {
  it("should show the initial value", async () => {
    setup({
      initialValues: { name: "Test" },
    });

    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Test");
    await userEvent.click(screen.getByText("Submit"));

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

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByText("Submit"));

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

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByText("Submit"));

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

    await userEvent.type(screen.getByLabelText("Name"), "Test");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.tab();

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

    await userEvent.type(screen.getByLabelText("Name"), "Test");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
