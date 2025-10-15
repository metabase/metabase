import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { JobListParams } from "metabase-enterprise/transforms/types";
import type { TransformTag } from "metabase-types/api";

import { JobFilterList } from "./JobFilterList";

type SetupOpts = {
  params?: JobListParams;
  tags?: TransformTag[];
};

function setup({ params = {}, tags = [] }: SetupOpts = {}) {
  renderWithProviders(<JobFilterList params={params} tags={tags} />);
}

describe("JobFilterList", () => {
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

  it("should allow only current or future date options for the next run filter", async () => {
    setup();

    await userEvent.click(screen.getByText("Next run at"));
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Relative date range…"));
    expect(await screen.findByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
  });
});
