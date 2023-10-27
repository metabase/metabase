import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "metabase/core/components/Button";
import ButtonGroup from "./ButtonGroup";

describe("ButtonGroup", () => {
  it("should render correctly", () => {
    render(
      <ButtonGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );

    expect(screen.getByRole("button", { name: "One" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Two" })).toBeInTheDocument();
  });

  it("should receive focus on tab", () => {
    render(
      <ButtonGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );

    userEvent.tab();
    expect(screen.getByRole("button", { name: "One" })).toHaveFocus();

    userEvent.tab();
    expect(screen.getByRole("button", { name: "Two" })).toHaveFocus();
  });
});
