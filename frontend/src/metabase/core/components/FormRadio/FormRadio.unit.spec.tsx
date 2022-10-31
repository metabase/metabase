import React from "react";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormRadio from "./FormRadio";

const TEST_SCHEMA = Yup.object().shape({
  value: Yup.string().notOneOf(["Bar"]),
});

const TEST_OPTIONS = [
  { name: "Line", value: "line" },
  { name: "Area", value: "area" },
  { name: "Bar", value: "bar" },
];

interface TestFormRadioProps {
  initialValue?: string;
  onSubmit: () => void;
}

const TestFormRadio = ({ initialValue, onSubmit }: TestFormRadioProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormField name="value" title="Label">
          <FormRadio name="value" options={TEST_OPTIONS} />
        </FormField>
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormRadio", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormRadio initialValue="line" onSubmit={onSubmit} />);

    expect(screen.getByRole("radio", { name: "Line" })).toBeChecked();
  });

  it("should propagate the changed value to the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormRadio onSubmit={onSubmit} />);
    userEvent.click(screen.getByRole("radio", { name: "Line" }));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ value: "line" }));
  });

  it("should be validated on blur", () => {
    const onSubmit = jest.fn();

    render(<TestFormRadio initialValue="line" onSubmit={onSubmit} />);
    userEvent.click(screen.getByRole("radio", { name: "Bar" }));
    userEvent.tab();

    waitFor(() => expect(screen.getByText("Label: error")).toBeInTheDocument());
  });
});
