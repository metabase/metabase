import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormNumericInput from "./FormNumericInput";

describe("FormNumericInput", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { value: 10 };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormField name="value" title="Goal">
            <FormNumericInput name="value" />
          </FormField>
          <FormSubmitButton />
        </Form>
      </Formik>,
    );

    const input = screen.getByDisplayValue("10");
    userEvent.clear(input);
    userEvent.type(input, "20");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ value: 20 });
    });
  });
});
