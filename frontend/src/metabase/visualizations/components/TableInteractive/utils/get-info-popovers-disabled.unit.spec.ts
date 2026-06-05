import type { ClickObject } from "metabase-lib";

import { getInfoPopoversDisabled } from "./get-info-popovers-disabled";

const baseArgs = {
  clicked: null,
  hasMetadataPopovers: true,
  isDashboard: false,
  isReorderingColumns: false,
};

describe("getInfoPopoversDisabled", () => {
  it("returns false when nothing is suppressing the popovers", () => {
    expect(getInfoPopoversDisabled(baseArgs)).toBe(false);
  });

  // metabase#55637: clicking a header cell sets `clicked` and the
  // header-info popover must stop appearing on subsequent hovers.
  it("returns true when a click action is open", () => {
    const clicked = { element: document.createElement("div") } as ClickObject;
    expect(getInfoPopoversDisabled({ ...baseArgs, clicked })).toBe(true);
  });

  it("returns true when the caller has opted out of metadata popovers", () => {
    expect(
      getInfoPopoversDisabled({ ...baseArgs, hasMetadataPopovers: false }),
    ).toBe(true);
  });

  it("returns true when rendered inside a dashboard", () => {
    expect(getInfoPopoversDisabled({ ...baseArgs, isDashboard: true })).toBe(
      true,
    );
  });

  it("returns true while a column drag-reorder is in progress", () => {
    expect(
      getInfoPopoversDisabled({ ...baseArgs, isReorderingColumns: true }),
    ).toBe(true);
  });
});
