import React from "react";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormInput from "./FormInput";

const TEST_SCHEMA = Yup.object({
  value: Yup.string().required("error"),
});

interface TestFormInputProps {
  initialValue?: string;
  onSubmit: () => void;
}

const TestFormInput = ({ initialValue = "", onSubmit }: TestFormInputProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormInput name="value" title="Label" />
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormInput", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormInput initialValue="Text" onSubmit={onSubmit} />);

    expect(screen.getByRole("textbox")).toHaveValue("Text");
  });

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormInput onSubmit={onSubmit} />);
    userEvent.type(screen.getByRole("textbox"), "Text");
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const values = { value: "Text" };
      expect(onSubmit).toHaveBeenCalledWith(values, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormInput onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormInput initialValue="Text" onSubmit={onSubmit} />);
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
