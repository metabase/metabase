import React from "react";

import { render, screen } from "@testing-library/react";
import ParameterFieldWidgetValue from "./ParameterFieldWidgetValue";

const value = "A value";

describe("when fields is empty array", () => {
  it("renders value if it is a single item", () => {
    render(<ParameterFieldWidgetValue value={[value]} fields={[]} />);
    screen.getByText(value);
  });

  it("renders number of selections if multiple items", () => {
    render(<ParameterFieldWidgetValue value={[value, value]} fields={[]} />);
    screen.getByText("2 selections");
  });
});
