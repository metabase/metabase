import React from "react";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormInput from "metabase/core/components/FormInput";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "./FormSubmitButton";

const TEST_SCHEMA = Yup.object().shape({
  name: Yup.string().required("error"),
});

interface TestFormInputProps {
  onSubmit: () => void;
}

const TestFormSubmitButton = ({ onSubmit }: TestFormInputProps) => {
  return (
    <Formik
      initialValues={{ name: "" }}
      validationSchema={TEST_SCHEMA}
      isInitialValid={false}
      onSubmit={onSubmit}
    >
      <Form>
        <FormField name="name" title="Name">
          <FormInput name="name" />
        </FormField>
        <FormSubmitButton />
      </Form>
    </Formik>
  );
};

describe("FormSubmitButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should be disabled when the form is invalid", () => {
    const onSubmit = jest.fn();

    render(<TestFormSubmitButton onSubmit={onSubmit} />);
    userEvent.clear(screen.getByLabelText("Name"));

    expect(screen.getByText("Submit")).toBeDisabled();
  });

  it("should be disabled when submitting the form", () => {
    const onSubmit = jest.fn();

    render(<TestFormSubmitButton onSubmit={onSubmit} />);
    userEvent.type(screen.getByLabelText("Name"), "Question");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(screen.getByText("Submit")).toBeDisabled());
  });

  it("should temporary change the text after submit", () => {
    const onSubmit = jest.fn().mockResolvedValue({});

    render(<TestFormSubmitButton onSubmit={onSubmit} />);
    userEvent.type(screen.getByLabelText("Name"), "Question");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(screen.getByText("Success")).toBeInTheDocument());
    act(() => jest.advanceTimersToNextTimer());
    waitFor(() => expect(screen.getByText("Submit")).toBeInTheDocument());
  });

  it("should temporary change the text after a submit failure", () => {
    const onSubmit = jest.fn().mockRejectedValue({});

    render(<TestFormSubmitButton onSubmit={onSubmit} />);
    userEvent.type(screen.getByLabelText("Name"), "Question");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => expect(screen.getByText("Failure")).toBeInTheDocument());
    act(() => jest.advanceTimersToNextTimer());
    waitFor(() => expect(screen.getByText("Submit")).toBeInTheDocument());
  });
});
