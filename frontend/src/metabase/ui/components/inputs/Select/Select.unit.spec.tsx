import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Select } from "metabase/ui";

const DATA = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
];

describe("Select", () => {
  describe("searchable", () => {
    it("should select existing input text when the dropdown opens, so typing replaces it", async () => {
      render(
        <Select label="Fruit" searchable data={DATA} defaultValue="apple" />,
      );
      const input = screen.getByLabelText<HTMLInputElement>("Fruit");
      expect(input).toHaveValue("Apple");

      await userEvent.click(input);

      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe("Apple".length);

      await userEvent.keyboard("ban");
      expect(input).toHaveValue("ban");
    });

    it("should auto-highlight the first matching option so Enter selects it", async () => {
      const onChange = jest.fn();
      render(
        <Select label="Fruit" searchable data={DATA} onChange={onChange} />,
      );
      const input = screen.getByLabelText("Fruit");

      await userEvent.click(input);
      await userEvent.keyboard("ap");
      await userEvent.keyboard("{Enter}");

      expect(onChange).toHaveBeenCalledWith("apple", expect.anything());
    });

    it("should still call a user-provided onDropdownOpen handler", async () => {
      const onDropdownOpen = jest.fn();
      render(
        <Select
          label="Fruit"
          searchable
          data={DATA}
          onDropdownOpen={onDropdownOpen}
        />,
      );

      await userEvent.click(screen.getByLabelText("Fruit"));

      expect(onDropdownOpen).toHaveBeenCalledTimes(1);
    });

    it("should respect an explicit selectFirstOptionOnChange={false} override", async () => {
      const onChange = jest.fn();
      render(
        <Select
          label="Fruit"
          searchable
          selectFirstOptionOnChange={false}
          data={DATA}
          onChange={onChange}
        />,
      );
      const input = screen.getByLabelText("Fruit");

      await userEvent.click(input);
      await userEvent.keyboard("ap");
      await userEvent.keyboard("{Enter}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("non-searchable", () => {
    it("should not pre-select input text on open and should still open the dropdown", async () => {
      render(<Select label="Fruit" data={DATA} defaultValue="apple" />);
      const input = screen.getByLabelText<HTMLInputElement>("Fruit");

      await userEvent.click(input);

      expect(
        screen.getByRole("option", { name: "Banana" }),
      ).toBeInTheDocument();
      expect(input.selectionStart).toBe(input.selectionEnd);
    });
  });
});
