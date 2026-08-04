import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { useCommentUrl } from "./use-comment-url";

function Probe({ childTargetId }: { childTargetId: string }) {
  const url = useCommentUrl({ childTargetId });
  return <div data-testid="comment-url">{url}</div>;
}

function setup(initialRoute: string, childTargetId = "9") {
  renderWithProviders(
    <Route path="*" element={<Probe childTargetId={childTargetId} />} />,
    { withRouter: true, initialRoute },
  );
  return screen.getByTestId("comment-url").textContent;
}

describe("useCommentUrl", () => {
  it("returns an empty string when rendered outside a router (storybook / custom-viz fixtures)", () => {
    renderWithProviders(<Probe childTargetId="9" />);
    expect(screen.getByTestId("comment-url")).toHaveTextContent("");
  });

  it("appends a /comments segment on routes with a comments child route", () => {
    expect(setup("/document/1")).toBe("/document/1/comments/9");
  });

  it("replaces an existing /comments segment instead of nesting", () => {
    expect(setup("/document/1/comments/4")).toBe("/document/1/comments/9");
  });

  it("uses the ?comments=<childTargetId> search param on exploration routes", () => {
    expect(setup("/question/research/1/page/19?timeline=1")).toBe(
      "/question/research/1/page/19?timeline=1&comments=9",
    );
  });

  it("replaces an existing comments param on exploration routes", () => {
    expect(setup("/question/research/1/page/19?comments=true&timeline=1")).toBe(
      "/question/research/1/page/19?comments=9&timeline=1",
    );
  });

  it("deep-links Summary block comments with the node id", () => {
    const nodeId = "550e8400-e29b-41d4-a716-446655440000";
    expect(setup("/question/research/1/summary", nodeId)).toBe(
      `/question/research/1/summary?comments=${nodeId}`,
    );
  });
});
