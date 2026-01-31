import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type * as Urls from "metabase/lib/urls";
import type { Transform, TransformTag } from "metabase-types/api";

import { RunFilterList } from "./RunFilterList";

type SetupOpts = {
  params?: Urls.TransformRunListParams;
  transforms?: Transform[];
  tags?: TransformTag[];
};

function setup({ params = {}, transforms = [], tags = [] }: SetupOpts = {}) {
  const onParamsChange = jest.fn();
  renderWithProviders(
    <RunFilterList
      params={params}
      transforms={transforms}
      tags={tags}
      onParamsChange={onParamsChange}
    />,
  );
  return { onParamsChange };
}

describe("RunFilterList", () => {
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
