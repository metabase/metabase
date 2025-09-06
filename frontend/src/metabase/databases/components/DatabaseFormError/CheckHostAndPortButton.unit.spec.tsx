import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import { CheckHostAndPortButton } from "./CheckHostAndPortButton";

const setup = () => {
  return render(
    <div
      data-testid="scrollable-database-form-body"
      id="scrollable-database-form-body"
    >
      <div data-error="Check your host settings">
        <input />
      </div>
      <CheckHostAndPortButton />
    </div>,
  );
};

describe("CheckHostAndPortButton", () => {
  it("should render a 'Check Host and Port settings' button with a gear icon", () => {
    setup();
    const button = screen.getByRole("button", {
      name: /Check Host and Port settings/,
    });
    expect(button).toBeInTheDocument();
    expect(
      within(button).getByRole("img", { name: "gear icon" }),
    ).toBeInTheDocument();
  });

  it("scrolls scrollable-database-form-body element when clicked", async () => {
    setup();
    const { click } = userEvent.setup();
    const button = screen.getByRole("button", {
      name: /Check Host and Port settings/,
    });
    const scrollableEl = screen.getByTestId("scrollable-database-form-body");
    jest.spyOn(scrollableEl, "scrollTo");
    await click(button);
    expect(scrollableEl.scrollTo).toHaveBeenCalledWith({
      behavior: "smooth",
      top: expect.any(Number),
    });
  });
});
