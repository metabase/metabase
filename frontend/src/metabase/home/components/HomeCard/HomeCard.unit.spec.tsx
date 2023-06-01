import { render, screen } from "@testing-library/react";
import HomeCard from "./HomeCard";

describe("HomeCard", () => {
  it("should render correctly", () => {
    render(<HomeCard>A look at table</HomeCard>);

    expect(screen.getByText("A look at table")).toBeInTheDocument();
  });
});
