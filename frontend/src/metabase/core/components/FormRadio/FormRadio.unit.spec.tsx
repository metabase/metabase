import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormRadio from "./FormRadio";

describe("FormRadio", () => {
  it("should set the value in the formik context", () => {
    const options = [
      { name: "Line", value: "line" },
      { name: "Bar", value: "bar" },
    ];
    const initialValues = { display: "line" };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormField name="display" title="Display">
            <FormRadio name="display" options={options} />
          </FormField>
          <FormSubmitButton />
        </Form>
      </Formik>,
    );

    userEvent.click(screen.getByText("Bar"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ display: "bar" });
    });
  });
});
