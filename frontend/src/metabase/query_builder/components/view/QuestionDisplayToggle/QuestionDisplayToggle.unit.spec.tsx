import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { QuestionDisplayToggle } from "./QuestionDisplayToggle";

describe("QuestionDisplayToggle", () => {
  it("renders correctly", () => {
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={jest.fn()}
      />,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("toggles state on click", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("toggles state on Enter key press", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const button = screen.getByRole("button");
    await userEvent.type(button, "{enter}");
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("toggles state on Space key press", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={true}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const button = screen.getByRole("button");
    await userEvent.type(button, " ");
    expect(onToggleRawTable).toHaveBeenCalledWith(false);
  });
});
