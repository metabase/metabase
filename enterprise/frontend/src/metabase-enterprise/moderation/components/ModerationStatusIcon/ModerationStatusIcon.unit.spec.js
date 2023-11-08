import React from "react";
import ModerationStatusIcon from "./ModerationStatusIcon";
import { render } from "@testing-library/react";

const VERIFIED_ICON_SELECTOR = ".Icon-verified";

describe("ModerationReviewBanner", () => {
  it("should show an icon when given a real moderation status", () => {
    render(<ModerationStatusIcon status="verified" />);

    expect(document.querySelector(VERIFIED_ICON_SELECTOR)).toBeTruthy();
  });

  it("should not show an icon when given an undefined status", () => {
    render(<ModerationStatusIcon status={undefined} />);

    expect(document.querySelector(VERIFIED_ICON_SELECTOR)).toBeNull();
  });

  it("should not show an icon when given a status that does not match any existing moderation status", () => {
    render(<ModerationStatusIcon status="foo" />);

    expect(document.querySelector(VERIFIED_ICON_SELECTOR)).toBeNull();
  });
});
