import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SelectButton from "./SelectButton";

describe("SelectButton", () => {
  const title = "Select an option";

  it("should render correctly", () => {
    render(<SelectButton>{title}</SelectButton>);

    expect(screen.getByRole("button")).toHaveTextContent(title);
  });

  it("should receive focus on tab", () => {
    render(<SelectButton>{title}</SelectButton>);
    userEvent.tab();

    expect(screen.getByRole("button")).toHaveFocus();
  });

  it("should not receive focus on tab when disabled", () => {
    render(<SelectButton disabled>{title}</SelectButton>);
    userEvent.tab();

    expect(screen.getByRole("button")).not.toHaveFocus();
  });
});
