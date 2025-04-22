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
    expect(screen.getByLabelText("Switch to data")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Switch to visualization"),
    ).toBeInTheDocument();
  });

  it("toggles to data on click", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const dataButton = screen.getByLabelText("Switch to data");
    await userEvent.click(dataButton);
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("toggles to visualization on click", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={true}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const vizButton = screen.getByLabelText("Switch to visualization");
    await userEvent.click(vizButton);
    expect(onToggleRawTable).toHaveBeenCalledWith(false);
  });

  it("toggles state on Enter key press", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const button = screen.getByLabelText("Switch to data");
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

    const button = screen.getByLabelText("Switch to visualization");
    await userEvent.type(button, " ");
    expect(onToggleRawTable).toHaveBeenCalledWith(false);
  });
});
