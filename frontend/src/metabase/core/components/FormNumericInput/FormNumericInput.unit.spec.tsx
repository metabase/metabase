import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormNumericInput from "./FormNumericInput";

describe("FormNumericInput", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { value: 10 };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormNumericInput name="value" />
          <button type="submit">Submit</button>
        </Form>
      </Formik>,
    );

    const input = screen.getByRole("textbox");
    userEvent.clear(input);
    userEvent.type(input, "20");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ value: 20 });
    });
  });
});
