import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { render, screen } from "__support__/ui";

import { TierSelection } from "./TierSelection";

const setSelectedTier = jest.fn();
const defaultProps: ComponentProps<typeof TierSelection> = {
  billingPeriod: "year",
  pythonPrice: 250,
  selectedTier: "basic",
  setSelectedTier,
  showAdvancedOnly: false,
  transformsPrice: 100,
};

describe("TierSelection", () => {
  beforeEach(() => {
    setSelectedTier.mockClear();
  });

  it("shows only the python tier option when showsAdvancedOnly is true", () => {
    render(<TierSelection {...defaultProps} showAdvancedOnly />);
    expect(screen.getByText(/SQL \+ Python/)).toBeInTheDocument();
    expect(screen.queryByText(/SQL only/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("shows both regular and python tiers options when showsAdvancedOnly is false", () => {
    render(<TierSelection {...defaultProps} showAdvancedOnly={false} />);
    expect(screen.getByText(/SQL \+ Python/)).toBeInTheDocument();
    expect(screen.getByText(/SQL only/)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("calls setSelectedTier with correct param when a tier is selected", async () => {
    render(<TierSelection {...defaultProps} />);

    await userEvent.click(screen.getByText(/SQL only/));
    expect(setSelectedTier).toHaveBeenCalledWith("basic");

    await userEvent.click(screen.getByText(/SQL \+ Python/));
    expect(setSelectedTier).toHaveBeenCalledWith("advanced");
  });
});
