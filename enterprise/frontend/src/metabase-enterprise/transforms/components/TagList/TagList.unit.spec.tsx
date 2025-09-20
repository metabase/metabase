import { renderWithProviders, screen } from "__support__/ui";
import type { TransformTag, TransformTagId } from "metabase-types/api";
import { createMockTransformTag } from "metabase-types/api/mocks";

import { TagList } from "./TagList";

type SetupOpts = {
  tagIds?: TransformTagId[];
  tags?: TransformTag[];
};

function setup({ tagIds = [], tags = [] }: SetupOpts = {}) {
  renderWithProviders(<TagList tagIds={tagIds} tags={tags} />);
}

describe("TagList", () => {
  it("should render tag names when tags exist", () => {
    const dailyTag = createMockTransformTag({ id: 1, name: "daily" });
    const hourlyTag = createMockTransformTag({ id: 2, name: "hourly" });
    const tags = [dailyTag, hourlyTag];
    const tagIds = [dailyTag.id, hourlyTag.id];

    setup({ tagIds, tags });

    expect(screen.getByText("daily")).toBeInTheDocument();
    expect(screen.getByText("hourly")).toBeInTheDocument();
  });

  it("should ignore non-existing tagIds", () => {
    const dailyTag = createMockTransformTag({ id: 1, name: "daily" });
    const hourlyTag = createMockTransformTag({ id: 2, name: "hourly" });
    const tags = [dailyTag, hourlyTag];
    const tagIds = [dailyTag.id, hourlyTag.id, 999];

    setup({ tagIds, tags });

    expect(screen.getByText("daily")).toBeInTheDocument();
    expect(screen.getByText("hourly")).toBeInTheDocument();
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });
});
