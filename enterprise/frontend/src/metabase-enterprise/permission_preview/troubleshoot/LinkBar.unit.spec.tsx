import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { LinkBar } from "./LinkBar";

describe("LinkBar", () => {
  it("keeps an address it can't read and says what it takes", async () => {
    const { onOpen } = setup();

    const field = screen.getByRole("textbox", { name: "Address" });
    await userEvent.clear(field);
    await userEvent.type(field, "nonsense-thing{Enter}");

    expect(
      await screen.findByText(
        "Paste a Metabase link, an entity ID, or a numeric ID.",
      ),
    ).toBeInTheDocument();
    expect(field).toHaveValue("nonsense-thing");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens an item's link (guard)", async () => {
    const { onOpen } = setup();

    const field = screen.getByRole("textbox", { name: "Address" });
    await userEvent.clear(field);
    await userEvent.type(field, "http://localhost:3000/question/12{Enter}");

    expect(onOpen).toHaveBeenCalledWith("/question/12");
    expect(
      screen.queryByText(
        "Paste a Metabase link, an entity ID, or a numeric ID.",
      ),
    ).not.toBeInTheDocument();
  });
});

function setup() {
  const onOpen = jest.fn();
  renderWithProviders(<LinkBar framePath="/" onOpen={onOpen} />);
  return { onOpen };
}
