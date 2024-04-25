import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormSwitch,
} from "metabase/forms";

interface FormValues {
  agree?: boolean;
}

interface SetupOpts {
  initialValues: FormValues;
}

const setup = ({ initialValues }: SetupOpts) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
      <Form>
        <FormSwitch name="agree" label="Agree?" />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormSwitch", () => {
  it("should show the initial value: true", async () => {
    setup({ initialValues: { agree: true } });
    expect(screen.getByLabelText("Agree?")).toBeChecked();
  });

  it("should show the initial value: false", async () => {
    setup({ initialValues: { agree: false } });
    expect(screen.getByLabelText("Agree?")).not.toBeChecked();
  });

  it("should show the initial value: empty", async () => {
    setup({ initialValues: {} });
    expect(screen.getByLabelText("Agree?")).not.toBeChecked();
  });

  it("should submit a true value", async () => {
    const { onSubmit } = setup({ initialValues: {} });

    await userEvent.click(screen.getByLabelText("Agree?"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ agree: true }, expect.anything());
    });
  });

  it("should submit a false value", async () => {
    const { onSubmit } = setup({ initialValues: {} });

    await userEvent.click(screen.getByLabelText("Agree?"));
    await userEvent.click(screen.getByLabelText("Agree?"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { agree: false },
        expect.anything(),
      );
    });
  });

  it("should submit an empty value", async () => {
    const { onSubmit } = setup({ initialValues: {} });

    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({}, expect.anything());
    });
  });
});
