import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import * as Yup from "yup";

import FormDateInput from "./FormDateInput";

const TEST_SCHEMA = Yup.object({
  value: Yup.string().required("error"),
});

interface TestFormDateInputProps {
  initialValue?: string;
  onSubmit: () => void;
}

const TestFormDateInput = ({
  initialValue,
  onSubmit,
}: TestFormDateInputProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormDateInput name="value" title="Date" />
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormDateInput", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormDateInput initialValue="2022-10-20" onSubmit={onSubmit} />);

    expect(screen.getByRole("textbox")).toHaveValue("10/20/2022");
  });

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormDateInput onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "10/20/22");
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const value = expect.stringMatching(/2022-10-20T00:00:00.000/);
      expect(onSubmit).toHaveBeenCalledWith({ value }, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormDateInput onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormDateInput onSubmit={onSubmit} />);
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
