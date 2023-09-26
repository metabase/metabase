import { render, screen } from "@testing-library/react";
import { getStatusColorRanges } from "metabase/lib/colors/groups";

import ColorRangeToggle from "./ColorRangeToggle";

const [range] = getStatusColorRanges();

describe("ColorRangeToggle", () => {
  describe("toggle button visibility", () => {
    it("should not render", () => {
      render(<ColorRangeToggle value={range} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("should render", () => {
      render(<ColorRangeToggle value={range} showToggleButton />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
});
