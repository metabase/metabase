import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormNumberInput,
  requiredErrorMessage,
} from "metabase/forms";

interface FormValues {
  goal: number | null | undefined;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
  nullable?: boolean;
}

const setup = ({
  initialValues = { goal: undefined },
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
        <FormNumberInput name="goal" label="Goal" nullable={nullable} />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormNumberInput", () => {
  it("should show the initial value", async () => {
    setup({
      initialValues: { goal: 25 },
    });

    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    await userEvent.type(screen.getByLabelText("Goal"), "20");
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ goal: 20 }, expect.anything());
    });
  });

  it("should submit an empty value", async () => {
    const { onSubmit } = setup({
      initialValues: { goal: 20 },
    });

    await userEvent.clear(screen.getByLabelText("Goal"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { goal: undefined },
        expect.anything(),
      );
    });
  });

  it("should submit an empty nullable value", async () => {
    const { onSubmit } = setup({
      initialValues: { goal: 20 },
      nullable: true,
    });

    await userEvent.clear(screen.getByLabelText("Goal"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ goal: null }, expect.anything());
    });
  });

  it("should show validation errors", async () => {
    const validationSchema = Yup.object({
      goal: Yup.number().default(undefined).required(requiredErrorMessage),
    });
    setup({ initialValues: validationSchema.getDefault(), validationSchema });
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Goal"), "20");
    await userEvent.clear(screen.getByLabelText("Goal"));
    await userEvent.tab();

    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });

  it("should show validation errors with nullable values", async () => {
    const validationSchema = Yup.object({
      goal: Yup.number()
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

    await userEvent.type(screen.getByLabelText("Goal"), "20");
    await userEvent.clear(screen.getByLabelText("Goal"));
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText("Required")).toBeInTheDocument();
    });
  });
});
