import React from "react";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormSelect from "./FormSelect";

const TEST_SCHEMA = Yup.object().shape({
  value: Yup.string().notOneOf(["Bar"]),
});

const TEST_OPTIONS = [
  { name: "Line", value: "line" },
  { name: "Area", value: "area" },
  { name: "Bar", value: "bar" },
];

interface TestFormSelectProps {
  initialValue?: string;
  onSubmit: () => void;
}

const TestFormSelect = ({ initialValue, onSubmit }: TestFormSelectProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormField name="value" title="Label">
          <FormSelect
            name="value"
            options={TEST_OPTIONS}
            placeholder="Choose"
          />
        </FormField>
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormSelect", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect initialValue="line" onSubmit={onSubmit} />);

    expect(screen.getByText("Line")).toBeInTheDocument();
  });

  it("should propagate the changed value to the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect onSubmit={onSubmit} />);
    userEvent.click(screen.getByText("Choose"));
    userEvent.click(screen.getByText("Line"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ value: "line" }));
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect initialValue="line" onSubmit={onSubmit} />);
    userEvent.click(screen.getByText("Line"));
    userEvent.click(screen.getByText("Bar"));
    userEvent.tab();

    waitFor(() => expect(screen.getByText("Label: error")).toBeInTheDocument());
  });
});
