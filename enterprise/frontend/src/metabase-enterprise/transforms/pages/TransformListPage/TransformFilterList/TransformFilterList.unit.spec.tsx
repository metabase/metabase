import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { TransformListParams } from "metabase-enterprise/transforms/types";
import type { TransformTag } from "metabase-types/api";

import { TransformFilterList } from "./TransformFilterList";

type SetupOpts = {
  params?: TransformListParams;
  tags?: TransformTag[];
};

function setup({ params = {}, tags = [] }: SetupOpts = {}) {
  renderWithProviders(<TransformFilterList params={params} tags={tags} />);
}

describe("TransformFilterList", () => {
  it("should allow only past or current date options for the last run filter", async () => {
    setup();

    await userEvent.click(screen.getByText("Last run at"));
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Relative date range…"));
    expect(await screen.findByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });
});
