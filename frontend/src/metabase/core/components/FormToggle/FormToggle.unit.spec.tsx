import React from "react";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormToggle from "./FormToggle";

const TEST_SCHEMA = Yup.object().shape({
  value: Yup.boolean().isTrue("error"),
});

interface TestFormToggleProps {
  initialValue?: boolean;
  onSubmit: () => void;
}

const TestFormToggle = ({
  initialValue = false,
  onSubmit,
}: TestFormToggleProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormField name="value" title="Label">
          <FormToggle name="value" />
        </FormField>
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormToggle", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle initialValue={true} onSubmit={onSubmit} />);

    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("should propagate the changed value to the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle onSubmit={onSubmit} />);
    userEvent.click(screen.getByRole("switch"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ value: true }));
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle initialValue={true} onSubmit={onSubmit} />);
    userEvent.click(screen.getByRole("switch"));
    userEvent.tab();

    waitFor(() => expect(screen.getByText("Label: error")).toBeInTheDocument());
  });
});
