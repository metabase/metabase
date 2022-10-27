import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormToggle from "./FormToggle";

describe("FormToggle", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { label: false };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormField name="label" title="Show label">
            <FormToggle name="label" />
          </FormField>
          <FormSubmitButton />
        </Form>
      </Formik>,
    );

    userEvent.click(screen.getByLabelText("Show label"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ label: true });
    });
  });
});
