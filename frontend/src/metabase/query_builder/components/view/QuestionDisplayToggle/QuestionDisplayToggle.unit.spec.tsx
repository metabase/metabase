import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { QuestionDisplayToggle } from "./QuestionDisplayToggle";

describe("QuestionDisplayToggle", () => {
  it("should render with correct labels", () => {
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={jest.fn()}
      />,
    );

    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAccessibleName(
      "Switch to visualization",
    );
  });

  it("should show correct label when showing raw table", () => {
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={true}
        onToggleRawTable={jest.fn()}
      />,
    );

    expect(screen.getByRole("switch")).toHaveAccessibleName("Switch to data");
  });

  it("should toggle state on click", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const toggle = screen.getByRole("switch");
    await userEvent.click(toggle);
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("should toggle state on Enter key", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const toggle = screen.getByRole("switch");
    toggle.focus();

    await userEvent.keyboard("{Enter}");
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("should toggle state on Space key", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={true}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const toggle = screen.getByRole("switch");
    toggle.focus();

    await userEvent.keyboard(" ");
    expect(onToggleRawTable).toHaveBeenCalledWith(false);
  });

  it("should be reachable via keyboard tab navigation", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <div>
        <button>Previous focusable</button>
        <QuestionDisplayToggle
          isShowingRawTable={false}
          onToggleRawTable={onToggleRawTable}
        />
        <button>Next focusable</button>
      </div>,
    );

    const previousButton = screen.getByText("Previous focusable");
    previousButton.focus();
    expect(previousButton).toHaveFocus();

    await userEvent.tab();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveFocus();

    await userEvent.tab();
    const nextButton = screen.getByText("Next focusable");
    expect(nextButton).toHaveFocus();
  });
});
