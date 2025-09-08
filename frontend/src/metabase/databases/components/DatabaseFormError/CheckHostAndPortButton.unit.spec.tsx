import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import { CheckHostAndPortButton } from "./CheckHostAndPortButton";

const setup = () => {
  return render(
    <div>
      <div data-error="Check your host settings" data-testid="data-error">
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

  it("scrolls to element with data-error when clicked", async () => {
    setup();
    const { click } = userEvent.setup();
    const button = screen.getByRole("button", {
      name: /Check Host and Port settings/,
    });
    const targetEl = screen.getByTestId("data-error");
    jest.spyOn(targetEl, "scrollIntoView");
    await click(button);
    expect(targetEl.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
    });
  });
});
