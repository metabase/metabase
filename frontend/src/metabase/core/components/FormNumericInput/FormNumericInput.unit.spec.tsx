import React from "react";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormNumericInput from "./FormNumericInput";

const TestSchema = Yup.object().shape({
  value: Yup.number().required("error"),
});

interface TestFormNumericInputProps {
  initialValue?: number;
  onSubmit: () => void;
}

const TestFormNumericInput = ({
  initialValue,
  onSubmit,
}: TestFormNumericInputProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TestSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <FormField name="value" title="Label">
          <FormNumericInput name="value" />
        </FormField>
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormNumericInput", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput initialValue={10} onSubmit={onSubmit} />);

    expect(screen.getByRole("textbox")).toHaveValue("10");
  });

  it("should propagate the changed value to the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput onSubmit={onSubmit} />);
    userEvent.type(screen.getByRole("textbox"), "10");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ value: 10 }));
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput initialValue={10} onSubmit={onSubmit} />);
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.tab();

    waitFor(() => expect(screen.getByText("Label: error")).toBeInTheDocument());
  });
});
