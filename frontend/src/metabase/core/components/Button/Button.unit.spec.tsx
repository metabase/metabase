import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  it("should receive focus on tab", async () => {
    render(<Button>{title}</Button>);
    await userEvent.tab();

    expect(screen.getByRole("button")).toHaveFocus();
  });
});
