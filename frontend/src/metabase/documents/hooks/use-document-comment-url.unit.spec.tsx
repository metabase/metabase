import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { useDocumentCommentUrl } from "./use-document-comment-url";

function Probe({ childTargetId }: { childTargetId: string }) {
  const url = useDocumentCommentUrl({ childTargetId });
  return <div data-testid="comment-url">{url}</div>;
}

function setup(initialRoute: string, childTargetId = "9") {
  renderWithProviders(
    <Route path="*" element={<Probe childTargetId={childTargetId} />} />,
    { withRouter: true, initialRoute },
  );
  return screen.getByTestId("comment-url").textContent;
}

describe("useDocumentCommentUrl", () => {
  it("appends a /comments segment on document routes", () => {
    expect(setup("/document/1")).toBe("/document/1/comments/9");
  });

  it("replaces an existing /comments segment instead of nesting", () => {
    expect(setup("/document/1/comments/4")).toBe("/document/1/comments/9");
  });

  it("preserves existing search params", () => {
    expect(setup("/document/1?timeline=5")).toBe(
      "/document/1/comments/9?timeline=5",
    );
  });
});
