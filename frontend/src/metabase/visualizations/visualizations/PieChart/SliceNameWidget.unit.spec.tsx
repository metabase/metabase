import { render, screen } from "@testing-library/react";

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
    const { container } = render(
      <SliceNameWidget
        initialKey={"non-present-key"}
        pieRows={[MOCK_PIE_ROW]}
        updateRowName={() => null}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
