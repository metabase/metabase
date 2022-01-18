import React from "react";
import { render, screen } from "@testing-library/react";
import Button from "./Button";

describe("Button", () => {
  const title = "Click";

  it("should render correctly", () => {
    render(<Button>{title}</Button>);

    expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
  });

  it("should render correctly with an icon", () => {
    render(<Button icon="star">{title}</Button>);

    expect(screen.getByRole("img", { name: "star icon" })).toBeInTheDocument();
  });
});
