import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormCheckBox from "./FormCheckBox";

describe("FormCheckBox", () => {
  it("should submit the form with the value", () => {
    const initialValues = { remember: false };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormCheckBox name="remember" />
          <button type="submit">Submit</button>
        </Form>
      </Formik>,
    );

    userEvent.click(screen.getByRole("checkbox"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ remember: true });
    });
  });
});
