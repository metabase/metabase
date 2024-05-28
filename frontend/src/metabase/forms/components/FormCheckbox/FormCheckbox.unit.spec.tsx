import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";

interface FormValues {
  remember: boolean;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
  nullable?: boolean;
}

const setup = ({
  initialValues = { remember: false },
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
        <FormCheckbox name="remember" label="Remember me" />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormCheckbox", () => {
  it("should show the initial value", () => {
    setup({
      initialValues: { remember: true },
    });

    expect(screen.getByLabelText("Remember me")).toBeChecked();
  });

  it("should submit values when the checkbox is checked", async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByLabelText("Remember me"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { remember: true },
        expect.anything(),
      );
    });
  });

  it("should submit values when the checkbox is unchecked", async () => {
    const { onSubmit } = setup({
      initialValues: { remember: true },
    });
    await userEvent.click(screen.getByLabelText("Remember me"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { remember: false },
        expect.anything(),
      );
    });
  });

  it("should show validation errors", async () => {
    const validationSchema = Yup.object({
      remember: Yup.boolean().default(true).isTrue("Must be checked"),
    });
    setup({ initialValues: validationSchema.getDefault(), validationSchema });
    expect(screen.queryByText("Must be checked")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Remember me"));
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Must be checked")).toBeInTheDocument();
    });
  });
});
