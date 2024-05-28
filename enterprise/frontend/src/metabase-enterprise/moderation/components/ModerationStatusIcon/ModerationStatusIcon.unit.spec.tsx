import { render, getIcon, queryIcon } from "__support__/ui";

import { ModerationStatusIcon } from "./ModerationStatusIcon";

describe("ModerationReviewBanner", () => {
  it("should show an icon when given a real moderation status", () => {
    render(<ModerationStatusIcon status="verified" />);
    expect(getIcon("verified")).toBeInTheDocument();
  });

  it("should not show an icon when given an undefined status", () => {
    render(<ModerationStatusIcon status={undefined} />);
    expect(queryIcon("verified")).not.toBeInTheDocument();
  });

  it("should not show an icon when given a status that does not match any existing moderation status", () => {
    render(<ModerationStatusIcon status="foo" />);
    expect(queryIcon("verified")).not.toBeInTheDocument();
  });
});
