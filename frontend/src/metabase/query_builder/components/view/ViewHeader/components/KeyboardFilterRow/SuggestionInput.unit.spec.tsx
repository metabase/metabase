import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen } from "__support__/ui";

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
});
