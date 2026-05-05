import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { AddBadgeListItem } from "./AddBadgeListItem";

const setup = () => {
  const name = "test badge";
  const handleClick = jest.fn();
  render(<AddBadgeListItem name={name} onClick={handleClick} />);
  return { handleClick };
};

describe("AddBadgeListItem", () => {
  it("renders badge with correct name", () => {
    setup();
    expect(screen.getByText("test badge")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const { handleClick } = setup();
    await userEvent.click(screen.getByText("test badge"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders add icon", () => {
    setup();
    expect(screen.getByLabelText("add icon")).toBeInTheDocument();
  });
});
