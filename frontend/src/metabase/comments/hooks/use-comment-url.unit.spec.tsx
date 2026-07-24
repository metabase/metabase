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
  it("appends a /comments segment on routes with a comments child route", () => {
    expect(setup("/document/1")).toBe("/document/1/comments/9");
  });

  it("replaces an existing /comments segment instead of nesting", () => {
    expect(setup("/document/1/comments/4")).toBe("/document/1/comments/9");
  });

  it("uses the ?comments=true search param on exploration routes (no /comments child route exists)", () => {
    expect(setup("/question/research/1/page/19?timeline=1")).toBe(
      "/question/research/1/page/19?timeline=1&comments=true",
    );
  });

  it("keeps a single comments param when the exploration sidebar is already open", () => {
    expect(setup("/question/research/1/page/19?comments=true&timeline=1")).toBe(
      "/question/research/1/page/19?comments=true&timeline=1",
    );
  });
});
