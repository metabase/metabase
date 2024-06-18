import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import * as Yup from "yup";

import FormSelect from "./FormSelect";

const TEST_SCHEMA = Yup.object({
  value: Yup.string().notOneOf(["bar"], "error"),
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
        <FormSelect
          name="value"
          title="Label"
          options={TEST_OPTIONS}
          placeholder="Choose"
        />
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

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect onSubmit={onSubmit} />);
    await userEvent.click(screen.getByText("Choose"));
    await userEvent.click(screen.getByText("Line"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const values = { value: "line" };
      expect(onSubmit).toHaveBeenCalledWith(values, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormSelect initialValue="line" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByText("Line"));
    await userEvent.click(screen.getByText("Bar"));
    await userEvent.click(screen.getByText("Submit"));

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
