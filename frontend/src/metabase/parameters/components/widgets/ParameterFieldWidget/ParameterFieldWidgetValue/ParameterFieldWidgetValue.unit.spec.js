import React from "react";
import { render, screen } from "@testing-library/react";

import ParameterFieldWidgetValue from "./ParameterFieldWidgetValue";

const value = "A value";

describe("when fields is empty array", () => {
  it("renders savedValue if it is a single item", () => {
    render(<ParameterFieldWidgetValue savedValue={[value]} fields={[]} />);
    screen.getByText(value);
  });

  it("renders number of selections if multiple items", () => {
    render(
      <ParameterFieldWidgetValue savedValue={[value, value]} fields={[]} />,
    );
    screen.getByText("2 selections");
  });
});
