import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormSelect from "./FormSelect";

const OPTIONS = [
  { name: "Line", value: "line" },
  { name: "Area", value: "area" },
  { name: "Bar", value: "bar" },
];

describe("FormSelect", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { display: "line" };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormField name="display" title="Display">
            <FormSelect name="display" options={OPTIONS} />
          </FormField>
          <FormSubmitButton />
        </Form>
      </Formik>,
    );

    userEvent.click(screen.getByText("Line"));
    userEvent.click(screen.getByText("Bar"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ display: "bar" });
    });
  });
});
