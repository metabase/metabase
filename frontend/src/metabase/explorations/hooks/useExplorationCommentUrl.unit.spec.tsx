import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import {
  type ExplorationCommentView,
  useExplorationCommentUrl,
} from "./useExplorationCommentUrl";

function Probe({
  childTargetId,
  view,
}: {
  childTargetId: string;
  view: ExplorationCommentView;
}) {
  const url = useExplorationCommentUrl({ childTargetId, view });
  return <div data-testid="comment-url">{url}</div>;
}

function setup(
  initialRoute: string,
  childTargetId: string,
  view: ExplorationCommentView = "page",
) {
  renderWithProviders(
    <Route
      path="*"
      element={<Probe childTargetId={childTargetId} view={view} />}
    />,
    { withRouter: true, initialRoute },
  );
  return screen.getByTestId("comment-url").textContent;
}

describe("useExplorationCommentUrl", () => {
  it("uses the ?comments=<childTargetId> search param and keeps a pinned page path", () => {
    expect(setup("/question/research/1/page/19?timeline=1", "19")).toBe(
      "/question/research/1/page/19?timeline=1&comments=19",
    );
  });

  it("pins the comment's page into a bare exploration URL, where the page is otherwise auto-selected", () => {
    expect(setup("/question/research/1?timeline=1", "19")).toBe(
      "/question/research/1/page/19?timeline=1&comments=19",
    );
  });

  it("repins the path to the comment's own page when a different page is in the URL", () => {
    expect(setup("/question/research/1/page/4", "19")).toBe(
      "/question/research/1/page/19?comments=19",
    );
  });

  it("deep-links Summary block comments with the node id on /summary", () => {
    const nodeId = "550e8400-e29b-41d4-a716-446655440000";
    expect(setup("/question/research/1/summary", nodeId, "summary")).toBe(
      `/question/research/1/summary?comments=${nodeId}`,
    );
  });

  it("pins the summary in a bare exploration URL", () => {
    expect(setup("/question/research/1", "19", "summary")).toBe(
      `/question/research/1/summary?comments=19`,
    );
  });
});
