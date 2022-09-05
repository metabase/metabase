import React from "react";
import { render, screen } from "@testing-library/react";

import DataSelectorFieldPicker from "./DataSelectorFieldPicker";

describe("something", () => {
  it("something", () => {
    render(<DataSelectorFieldPicker />);
    screen.getByText("wrong");
  });
});
