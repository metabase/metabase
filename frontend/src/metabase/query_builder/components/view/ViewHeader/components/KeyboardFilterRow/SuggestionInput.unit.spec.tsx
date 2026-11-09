import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { fireEvent, render, screen } from "__support__/ui";

import { SuggestionInput } from "./SuggestionInput";

describe("SuggestionInput", () => {
  it("keeps the first column highlighted when arrow navigation rerenders the parent", async () => {
    const onOptionSubmit = jest.fn();

    function Picker() {
      const [, setHasNavigated] = useState(false);
      return (
        <SuggestionInput
          groups={[
            {
              section: "Orders",
              options: [
                { value: "id", label: "ID" },
                { value: "total", label: "Total" },
              ],
            },
          ]}
          text=""
          placeholder="Type to filter"
          onTextChange={jest.fn()}
          onOptionSubmit={onOptionSubmit}
          onKeyDown={() => {
            setHasNavigated(true);
            return false;
          }}
        />
      );
    }

    render(<Picker />);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "ID" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    expect(onOptionSubmit).toHaveBeenCalledWith("id");
  });

  it("moves the arrow key highlight to the option under the mouse", async () => {
    const onOptionSubmit = jest.fn();
    render(
      <SuggestionInput
        groups={[
          {
            options: [
              { value: "id", label: "ID" },
              { value: "total", label: "Total" },
              { value: "tax", label: "Tax" },
            ],
          },
        ]}
        text=""
        placeholder="Type to filter"
        onTextChange={jest.fn()}
        onOptionSubmit={onOptionSubmit}
      />,
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "ID" })).toHaveAttribute(
      "data-combobox-selected",
    );

    fireEvent.mouseMove(screen.getByText("Tax"), { clientX: 10, clientY: 10 });
    expect(screen.getByRole("option", { name: "ID" })).not.toHaveAttribute(
      "data-combobox-selected",
    );
    expect(screen.getByRole("option", { name: "Tax" })).toHaveAttribute(
      "data-combobox-selected",
    );

    // The keys continue from the option under the mouse.
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(onOptionSubmit).toHaveBeenCalledWith("total");
  });
});
