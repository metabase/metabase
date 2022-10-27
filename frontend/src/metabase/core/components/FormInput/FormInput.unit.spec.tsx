import React from "react";
import { Formik, Form } from "formik";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormInput from "./FormInput";

describe("FormInput", () => {
  it("should set the value in the formik context", () => {
    const initialValues = { name: "Orders" };
    const onSubmit = jest.fn();

    render(
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        <Form>
          <FormInput name="name" />
          <button type="submit">Submit</button>
        </Form>
      </Formik>,
    );

    const input = screen.getByRole("textbox");
    userEvent.clear(input);
    userEvent.type(input, "Orders by month");
    userEvent.click(screen.getByText("Submit"));

    waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: "Orders by month" });
    });
  });
});
