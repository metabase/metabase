import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormCheckBox from "./FormCheckBox";

describe("FormCheckBox", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { remember: false };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormField name="remember" title="Remember me">
            <FormCheckBox name="remember" />
          </FormField>
          <FormSubmitButton />
        </Form>
      </Formik>,
    );

    userEvent.click(screen.getByLabelText("Remember me"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ remember: true });
    });
  });
});
