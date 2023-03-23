import React from "react";
import { render, screen } from "@testing-library/react";

import { color } from "metabase/lib/colors";
import ColorRangeSelector from "./ColorRangeSelector";

const DEFAULT_VALUE = [color("white"), color("brand")];
const DEFAULT_COLORS = [color("brand"), color("summarize"), color("filter")];

interface TestColorRangeSelectorProps {
  onChange: (newValue: string[]) => void;
}

function TestColorRangeSelector({ onChange }: TestColorRangeSelectorProps) {
  return (
    <ColorRangeSelector
      value={DEFAULT_VALUE}
      colors={DEFAULT_COLORS}
      onChange={onChange}
    />
  );
}

describe("ColorRangeSelector", () => {
  it("should call `onChange` upon clicking a color", async () => {
    const onChange = jest.fn();
    render(<TestColorRangeSelector onChange={onChange} />);

    screen.getByRole("button").click();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    screen.getByLabelText(color("summarize")).click();
    expect(onChange).toHaveBeenCalled();
  });
});
