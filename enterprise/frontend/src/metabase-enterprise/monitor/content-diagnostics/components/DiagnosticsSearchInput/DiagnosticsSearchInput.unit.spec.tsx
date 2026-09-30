import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { DiagnosticsSearchInput } from "./DiagnosticsSearchInput";

describe("DiagnosticsSearchInput", () => {
  it("preserves trailing spaces in the input while sending a trimmed query", async () => {
    const onQueryChange = jest.fn();
    const { rerender } = renderWithProviders(
      <DiagnosticsSearchInput onQueryChange={onQueryChange} />,
    );
    const input = screen.getByRole("textbox", { name: "Search" });

    await userEvent.type(input, "foo ");
    await waitFor(() => expect(onQueryChange).toHaveBeenCalledWith("foo"));
    rerender(
      <DiagnosticsSearchInput query="foo" onQueryChange={onQueryChange} />,
    );
    expect(input).toHaveValue("foo ");

    await userEvent.type(input, "bar");
    expect(input).toHaveValue("foo bar");
    await waitFor(() =>
      expect(onQueryChange).toHaveBeenLastCalledWith("foo bar"),
    );
  });
});
