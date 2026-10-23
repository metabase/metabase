import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { SliceNameWidget } from "./SliceNameWidget";

const MOCK_PIE_ROW = {
  key: "some-key",
  name: "some-name",
  originalName: "some-original-name",
  color: "#509EE3",
  defaultColor: true,
  enabled: true,
  hidden: false,
  isOther: false,
};

describe("SliceNameWidget", () => {
  it("should render the name of the pieRow with initialKey", () => {
    render(
      <SliceNameWidget
        initialKey={MOCK_PIE_ROW.key}
        pieRows={[MOCK_PIE_ROW, { ...MOCK_PIE_ROW, key: "some-other-key" }]}
        updateRowName={() => null}
      />,
    );

    expect(screen.getByDisplayValue(MOCK_PIE_ROW.name)).toBeInTheDocument();
  });

  it("should return null if a pieRow with initialKey cannot be found", () => {
    render(
      <div data-testid="test-container">
        <SliceNameWidget
          initialKey={"non-present-key"}
          pieRows={[MOCK_PIE_ROW]}
          updateRowName={() => null}
        />
      </div>,
    );

    expect(screen.getByTestId("test-container")).toBeEmptyDOMElement();
  });

  it("should discard an in-progress edit on Esc instead of committing it (metabase#75868)", async () => {
    const updateRowName = jest.fn();

    render(
      <SliceNameWidget
        initialKey={MOCK_PIE_ROW.key}
        pieRows={[MOCK_PIE_ROW]}
        updateRowName={updateRowName}
      />,
    );

    const input = screen.getByDisplayValue(MOCK_PIE_ROW.name);
    await userEvent.clear(input);
    await userEvent.type(input, "a new name{Escape}");

    expect(updateRowName).not.toHaveBeenCalled();
    expect(input).toHaveValue(MOCK_PIE_ROW.name);
  });

  it("should commit an edit on blur when Esc was not pressed", async () => {
    const updateRowName = jest.fn();

    render(
      <SliceNameWidget
        initialKey={MOCK_PIE_ROW.key}
        pieRows={[MOCK_PIE_ROW]}
        updateRowName={updateRowName}
      />,
    );

    const input = screen.getByDisplayValue(MOCK_PIE_ROW.name);
    await userEvent.clear(input);
    await userEvent.type(input, "a new name");
    await userEvent.tab();

    expect(updateRowName).toHaveBeenCalledWith("a new name", MOCK_PIE_ROW.key);
  });
});
