import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import * as Yup from "yup";

import FormRadio from "./FormRadio";

const TEST_SCHEMA = Yup.object({
  value: Yup.string().notOneOf(["bar"], "error"),
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
        <FormRadio name="value" options={TEST_OPTIONS} title="Label" />
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

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormRadio onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("radio", { name: "Line" }));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const values = { value: "line" };
      expect(onSubmit).toHaveBeenCalledWith(values, expect.anything());
    });
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormRadio initialValue="line" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("radio", { name: "Bar" }));
    await userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
