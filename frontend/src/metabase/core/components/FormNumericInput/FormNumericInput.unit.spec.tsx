import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import * as Yup from "yup";

import FormNumericInput from "./FormNumericInput";

const TEST_SCHEMA = Yup.object({
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
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormNumericInput name="value" title="Label" />
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

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "10");
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const values = { value: 10 };
      expect(onSubmit).toHaveBeenCalledWith(values, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormNumericInput initialValue={10} onSubmit={onSubmit} />);
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
