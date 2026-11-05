import userEvent from "@testing-library/user-event";
import { Form, Formik, type FormikHelpers } from "formik";
import type { ReactNode } from "react";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";

import { FormSwitchWidget } from "./FormSwitchWidget";

const TEST_SCHEMA = Yup.object({
  value: Yup.boolean().isTrue("error"),
});

type FormValues = {
  value: boolean;
};

type SetupOpts = {
  initialValue?: boolean;
  actions?: ReactNode;
};

function setup({ initialValue = false, actions }: SetupOpts = {}) {
  const onSubmit = jest.fn<void, [FormValues, FormikHelpers<FormValues>]>();

  render(
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormSwitchWidget
          name="value"
          title="Label"
          type="boolean"
          actions={actions}
        />
        <button type="submit">Submit</button>
      </Form>
    </Formik>,
  );

  return { onSubmit };
}

describe("FormSwitchWidget", () => {
  it("should use the initial value from the form", () => {
    setup({ initialValue: true });

    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("should propagate the changed value to the form", async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ value: true }, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    setup();

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should render field actions", () => {
    setup({ actions: <button type="button">Show field</button> });

    expect(
      screen.getByRole("button", { name: "Show field" }),
    ).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    setup({ initialValue: true });

    await userEvent.click(screen.getByRole("switch"));
    await userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
