import { setupSegmentsEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Segment } from "metabase-types/api";
import { createMockSegment, createMockUser } from "metabase-types/api/mocks";

import SegmentListContainer from "./SegmentListContainer";

const SEGMENT = createMockSegment({ id: 1, name: "Active subscribers" });

interface SetupOpts {
  segments?: Segment[];
}

function setup({ segments = [SEGMENT] }: SetupOpts = {}) {
  setupSegmentsEndpoints(segments);

  return renderWithProviders(
    <Route path="/reference/segments" element={<SegmentListContainer />} />,
    {
      withRouter: true,
      initialRoute: "/reference/segments",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("SegmentListContainer", () => {
  it("fetches segments on mount and lists them", async () => {
    setup();

    expect(await screen.findByText("Active subscribers")).toBeInTheDocument();
    expect(
      screen.queryByText("Segments are interesting subsets of tables"),
    ).not.toBeInTheDocument();
  });

  it("shows admins how to create segments when there are none", async () => {
    setup({ segments: [] });

    expect(
      await screen.findByText("Segments are interesting subsets of tables"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Learn how to create segments" }),
    ).toBeInTheDocument();
  });
});
