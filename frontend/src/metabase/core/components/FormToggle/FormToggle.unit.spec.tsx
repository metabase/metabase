import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import * as Yup from "yup";

import FormToggle from "./FormToggle";

const TEST_SCHEMA = Yup.object({
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
        <FormToggle name="value" title="Label" />
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

  it("should propagate the changed value to the form", async () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const values = { value: true };
      expect(onSubmit).toHaveBeenCalledWith(values, expect.anything());
    });
  });

  it("should be referenced by the label", () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("should be validated on blur", async () => {
    const onSubmit = jest.fn();

    render(<TestFormToggle initialValue={true} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.tab();

    expect(await screen.findByText(": error")).toBeInTheDocument();
  });
});
