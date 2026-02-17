import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
import { createMockTransform } from "metabase-types/api/mocks";

import { TransformMoreMenu } from "./TransformMoreMenu";

type SetupOps = {
  readOnly?: boolean;
};

const setup = ({ readOnly }: SetupOps = {}) => {
  const transform = createMockTransform();

  render(<TransformMoreMenu transform={transform} readOnly={readOnly} />);
};

const getMenuItem = (name: string | RegExp) =>
  within(screen.getByRole("menu")).getByRole("menuitem", { name });

const queryMenuItem = (name: string | RegExp) =>
  within(screen.getByRole("menu")).queryByRole("menuitem", { name });

describe("TransformMoreMenu", () => {
  it("shows transform options when ellipsis icon is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("img", { name: "ellipsis icon" }));

    expect(getMenuItem(/History/)).toBeInTheDocument();
    expect(getMenuItem(/Move/)).toBeInTheDocument();
    expect(getMenuItem(/Delete/)).toBeInTheDocument();
  });

  it("does not show move and delete options when readOnly is true", async () => {
    setup({ readOnly: true });
    await userEvent.click(screen.getByRole("img", { name: "ellipsis icon" }));

    expect(getMenuItem(/History/)).toBeInTheDocument();
    expect(queryMenuItem(/Move/)).not.toBeInTheDocument();
    expect(queryMenuItem(/Delete/)).not.toBeInTheDocument();
  });
});
