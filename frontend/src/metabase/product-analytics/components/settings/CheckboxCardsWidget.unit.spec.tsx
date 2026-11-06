import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import {
  type CheckboxCardOption,
  CheckboxCardsWidget,
} from "./CheckboxCardsWidget";

type Fruit = "apple" | "banana" | "cherry";

const OPTIONS: CheckboxCardOption<Fruit>[] = [
  { value: "apple", label: "Apple", description: "Crunchy" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

type SetupOpts = {
  value: Fruit[];
};

const setup = ({ value }: SetupOpts) => {
  const onChange = jest.fn<void, [Fruit[]]>();

  renderWithProviders(
    <CheckboxCardsWidget
      id="fruits"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />,
  );

  return { onChange };
};

describe("CheckboxCardsWidget", () => {
  it("shows a card per option with its description, checked when selected", () => {
    setup({ value: ["banana"] });

    expect(screen.getByRole("checkbox", { name: /Apple/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Banana/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Cherry/ })).not.toBeChecked();
    expect(screen.getByText("Crunchy")).toBeInTheDocument();
  });

  it("adds a checked option in the order of the options", async () => {
    const { onChange } = setup({ value: ["cherry"] });

    await userEvent.click(screen.getByRole("checkbox", { name: /Apple/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["apple", "cherry"]);
  });

  it("removes an unchecked option", async () => {
    const { onChange } = setup({ value: ["apple", "banana"] });

    await userEvent.click(screen.getByRole("checkbox", { name: /Apple/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["banana"]);
  });

  it("allows unchecking the last selected option", async () => {
    const { onChange } = setup({ value: ["banana"] });

    await userEvent.click(screen.getByRole("checkbox", { name: /Banana/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
