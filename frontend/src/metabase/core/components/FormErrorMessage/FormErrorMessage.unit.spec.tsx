import React from "react";
import { Form, Formik } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormInput from "metabase/core/components/FormInput";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "./FormErrorMessage";

interface TestFormErrorMessageProps {
  onSubmit: () => void;
}

const TestFormSubmitButton = ({ onSubmit }: TestFormErrorMessageProps) => {
  return (
    <Formik initialValues={{ name: "" }} onSubmit={onSubmit}>
      <Form>
        <FormField name="name" title="Name">
          <FormInput name="name" />
        </FormField>
        <FormSubmitButton />
        <FormErrorMessage />
      </Form>
    </Formik>
  );
};

describe("FormErrorMessage", () => {
  it("should show a generic error message after a submit failure", () => {
    const onSubmit = jest.fn().mockRejectedValue({});

    render(<TestFormSubmitButton onSubmit={onSubmit} />);
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(screen.getByText("An error occurred")).toBeInTheDocument();
    });
  });

  it("should show the specified error message after a submit failure", () => {
    const onSubmit = jest.fn().mockRejectedValue({ message: "Wrong port" });

    render(<TestFormSubmitButton onSubmit={onSubmit} />);
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(screen.getByText("Wrong port")).toBeInTheDocument();
    });
  });
});
