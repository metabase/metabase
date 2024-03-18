import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import * as Yup from "yup";

import FormCheckBox from "./FormCheckBox";

const TEST_SCHEMA = Yup.object({
  value: Yup.boolean().isTrue("error"),
});

interface TestFormCheckBoxProps {
  initialValue?: boolean;
  onSubmit: () => void;
}

const TestFormCheckBox = ({
  initialValue = false,
  onSubmit,
}: TestFormCheckBoxProps) => {
  return (
    <Formik
      initialValues={{ value: initialValue }}
      validationSchema={TEST_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <FormCheckBox name="value" title="Label" />
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  );
};

describe("FormCheckBox", () => {
  it("should use the initial value from the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormCheckBox initialValue={true} onSubmit={onSubmit} />);

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormCheckBox onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const values = { value: true };
      expect(onSubmit).toHaveBeenCalledWith(values, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormCheckBox onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormCheckBox initialValue={true} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
