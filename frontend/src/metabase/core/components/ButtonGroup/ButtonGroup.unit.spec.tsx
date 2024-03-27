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

  it("should receive focus on tab", async () => {
    render(
      <ButtonGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "One" })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Two" })).toHaveFocus();
  });
});
