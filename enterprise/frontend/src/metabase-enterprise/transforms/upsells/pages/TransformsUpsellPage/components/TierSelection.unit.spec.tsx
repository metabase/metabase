import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { render, screen } from "__support__/ui";

import { TierSelection } from "./TierSelection";

const setSelectedTier = jest.fn();
const defaultProps: ComponentProps<typeof TierSelection> = {
  billingPeriod: "yearly",
  advancedTransformsPrice: 250,
  selectedTier: "basic",
  setSelectedTier,
  basicTransformsPrice: 100,
};

describe("TierSelection", () => {
  beforeEach(() => {
    setSelectedTier.mockClear();
  });

  it("calls setSelectedTier with correct param when a tier is selected", async () => {
    render(<TierSelection {...defaultProps} />);

    await userEvent.click(screen.getByText(/SQL only/));
    expect(setSelectedTier).toHaveBeenCalledWith("basic");

    await userEvent.click(screen.getByText(/SQL \+ Python/));
    expect(setSelectedTier).toHaveBeenCalledWith("advanced");
  });
});
