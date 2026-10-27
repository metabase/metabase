import { render, screen } from "@testing-library/react";
import { Formik } from "formik";

import { ThemeProvider } from "metabase/ui";

import { FormDateInput } from "./FormDateInput";

const setup = (value: string) => {
  render(
    <ThemeProvider>
      <Formik initialValues={{ date: value }} onSubmit={jest.fn()}>
        <FormDateInput name="date" title="Date" />
      </Formik>
    </ThemeProvider>,
  );
};

describe("FormDateInput", () => {
  it.each([
    ["2025-12-31T15:00:00Z", "December 31, 2025"],
    ["2026-01-01T17:00:00Z", "January 1, 2026"],
    ["2026-01-01", "January 1, 2026"],
  ])(
    "should show the date written in %s, not the browser date (#24701)",
    (value, expectedDate) => {
      setup(value);

      expect(screen.getByLabelText<HTMLInputElement>("Date").value).toBe(
        expectedDate,
      );
    },
  );
});
