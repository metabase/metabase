import { render, screen } from "@testing-library/react";
import {
  ChartSkeletonDisplayType,
  chartSkeletonDisplayTypes,
} from "metabase/visualizations/components/skeletons/util/display-type";
import ChartSkeleton from "./ChartSkeleton";

describe("ChartSkeleton", () => {
  // Test empty
  it("should render empty", () => {
    render(<ChartSkeleton name={"Empty"} />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  // Test other display types
  chartSkeletonDisplayTypes.forEach((display: ChartSkeletonDisplayType) => {
    it(`should render ${display}`, () => {
      render(<ChartSkeleton display={display} name={display} />);
      expect(screen.getByText(display)).toBeInTheDocument();
    });
  });
});
