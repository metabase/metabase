import { renderWithProviders, screen } from "__support__/ui";
import type { TransformTag } from "metabase-types/api";
import { createMockTransformTag } from "metabase-types/api/mocks";

import { TagList } from "./TagList";

type SetupOpts = {
  tags?: TransformTag[];
};

function setup({ tags = [] }: SetupOpts = {}) {
  renderWithProviders(<TagList tags={tags} />);
}

describe("TagList", () => {
  it("should render tag names", () => {
    setup({
      tags: [
        createMockTransformTag({ id: 1, name: "daily" }),
        createMockTransformTag({ id: 2, name: "hourly" }),
      ],
    });

    expect(screen.getByText("daily")).toBeInTheDocument();
    expect(screen.getByText("hourly")).toBeInTheDocument();
  });
});
