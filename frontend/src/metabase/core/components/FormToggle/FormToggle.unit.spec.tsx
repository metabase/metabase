import React from "react";
import { Form, Formik } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormToggle from "./FormToggle";

describe("FormToggle", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { label: false };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormToggle name="label" />
          <button type="submit">Submit</button>
        </Form>
      </Formik>,
    );

    userEvent.click(screen.getByRole("switch"));
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ label: true });
    });
  });
});
