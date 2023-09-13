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
import { render, screen, waitFor } from "__support__/ui";

interface SetupOpts {
  initialValue?: string | null;
  validationSchema?: AnySchema;
  nullable?: boolean;
}

const setup = ({
  initialValue = "",
  validationSchema,
  nullable,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider
      initialValues={{ name: initialValue }}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <FormTextInput name="name" label="Name" nullable={nullable} />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormTextInput", () => {
  it("should show the initial value", async () => {
    setup({ initialValue: "Test" });

    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
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
    const { onSubmit } = setup({ initialValue: "Test" });

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
    const { onSubmit } = setup({ initialValue: "Test", nullable: true });

    userEvent.clear(screen.getByLabelText("Name"));
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: null }, expect.anything());
    });
  });

  it("should show validation errors", () => {
    const validationSchema = Yup.object({
      name: Yup.string().default("").required(requiredErrorMessage),
    });

    setup({ validationSchema });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    userEvent.type(screen.getByLabelText("Name"), "Test");
    userEvent.clear(screen.getByLabelText("Name"));
    userEvent.tab();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });
});
