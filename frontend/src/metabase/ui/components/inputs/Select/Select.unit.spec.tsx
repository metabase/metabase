import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Select, type SelectProps } from "metabase/ui";

const DATA = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
];

type SetupOpts = Omit<Partial<SelectProps>, "onChange" | "onDropdownOpen">;

function setup({ data = DATA, ...props }: SetupOpts = {}) {
  const onChange = jest.fn();
  const onDropdownOpen = jest.fn();

  render(
    <Select
      label="Fruit"
      data={data}
      onChange={onChange}
      onDropdownOpen={onDropdownOpen}
      {...props}
    />,
  );

  const input = screen.getByLabelText<HTMLInputElement>("Fruit");

  return { input, onChange, onDropdownOpen };
}

describe("Select", () => {
  describe("searchable", () => {
    it("should select existing input text when the dropdown opens, so typing replaces it", async () => {
      const { input } = setup({ searchable: true, defaultValue: "apple" });
      expect(input).toHaveValue("Apple");

      await userEvent.click(input);

      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe("Apple".length);

      await userEvent.keyboard("ban");
      expect(input).toHaveValue("ban");
    });

    it("should auto-highlight the first matching option so Enter selects it", async () => {
      const { input, onChange } = setup({ searchable: true });

      await userEvent.click(input);
      await userEvent.keyboard("ap");
      await userEvent.keyboard("{Enter}");

      expect(onChange).toHaveBeenCalledWith("apple", expect.anything());
    });

    it("should still call a user-provided onDropdownOpen handler", async () => {
      const { input, onDropdownOpen } = setup({ searchable: true });

      await userEvent.click(input);

      expect(onDropdownOpen).toHaveBeenCalledTimes(1);
    });

    it("should respect an explicit selectFirstOptionOnChange={false} override", async () => {
      const { input, onChange } = setup({
        searchable: true,
        selectFirstOptionOnChange: false,
      });

      await userEvent.click(input);
      await userEvent.keyboard("ap");
      await userEvent.keyboard("{Enter}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("non-searchable", () => {
    it("should not pre-select input text on open and should still open the dropdown", async () => {
      const { input } = setup({ defaultValue: "apple" });

      await userEvent.click(input);

      expect(
        screen.getByRole("option", { name: "Banana" }),
      ).toBeInTheDocument();
      expect(input.selectionStart).toBe(input.selectionEnd);
    });
  });
});
