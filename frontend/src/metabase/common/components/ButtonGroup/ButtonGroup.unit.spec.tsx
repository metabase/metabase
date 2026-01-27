import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Button } from "metabase/common/components/Button";

import { ButtonGroup } from "./ButtonGroup";

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
