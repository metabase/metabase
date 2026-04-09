import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Transform, TransformTag } from "metabase-types/api";

import type { TransformRunFilterOptions } from "../types";

import { RunFilterBar } from "./RunFilterBar";

type SetupOpts = {
  filterOptions?: TransformRunFilterOptions;
  transforms?: Transform[];
  tags?: TransformTag[];
};

function setup({
  filterOptions = {},
  transforms = [],
  tags = [],
}: SetupOpts = {}) {
  const onFilterOptionsChange = jest.fn();
  renderWithProviders(
    <RunFilterBar
      filterOptions={filterOptions}
      transforms={transforms}
      tags={tags}
      onFilterOptionsChange={onFilterOptionsChange}
    />,
  );
  return { onFilterOptionsChange };
}

describe("RunFilterBar", () => {
  it.each(["Started at", "Ended at"])(
    "should allow only past or current date options for start and end date filters",
    async (label) => {
      setup();

      await userEvent.click(screen.getByText(label));
      expect(await screen.findByText("Today")).toBeInTheDocument();
      expect(screen.getByText("Yesterday")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Relative date range…"));
      expect(await screen.findByText("Previous")).toBeInTheDocument();
      expect(screen.getByText("Current")).toBeInTheDocument();
      expect(screen.queryByText("Next")).not.toBeInTheDocument();
    },
  );
});
