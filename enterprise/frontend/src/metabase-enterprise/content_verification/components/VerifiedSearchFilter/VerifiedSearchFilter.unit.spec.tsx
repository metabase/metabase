import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { VerifiedSearchFilter } from "./VerifiedSearchFilter";

const setup = ({ value }: { value?: boolean } = {}) => {
  const onChange = jest.fn();
  renderWithProviders(
    <VerifiedSearchFilter
      value={value}
      onChange={onChange}
      data-testid="verified-search-filter"
    />,
  );

  return {
    onChange,
  };
};

describe("VerifiedFilter", () => {
  it("highlights `All items` button if value is undefined", () => {
    setup({ value: undefined });

    expect(
      screen.getByRole("button", { name: "Only verified items" }),
    ).not.toHaveAttribute("data-is-selected");
  });

  it("highlights `Only verified items` button if value is true", () => {
    setup({ value: true });

    expect(
      screen.getByRole("button", { name: "Only verified items" }),
    ).toHaveAttribute("data-is-selected", "true");
  });

  it("returns true if `Only verified items` is clicked", () => {
    const { onChange } = setup();

    const verifiedButton = screen.getByText("Only verified items");
    userEvent.click(verifiedButton);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("returns undefined if `All items` is clicked", () => {
    const { onChange } = setup();

    const allItemsButton = screen.getByText("All items");
    userEvent.click(allItemsButton);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
