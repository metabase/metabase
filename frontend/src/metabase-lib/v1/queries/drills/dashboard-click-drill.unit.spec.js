import {
  getClickBehavior,
  getDashboardDrillLinkTarget,
} from "metabase-lib/v1/queries/drills/dashboard-click-drill";

describe("getDashboardDrillLinkTarget", () => {
  it("returns undefined when there is no click behavior", () => {
    expect(getDashboardDrillLinkTarget({})).toBeUndefined();
    expect(
      getDashboardDrillLinkTarget({
        settings: { click_behavior: { type: "crossfilter" } },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when click behavior is not a link", () => {
    expect(
      getDashboardDrillLinkTarget({
        settings: { click_behavior: { type: "actionMenu" } },
      }),
    ).toBeUndefined();
  });

  it.each(["_self", "_blank", "_parent", "_top"])(
    "returns %s when set on visualization click_behavior",
    (linkTarget) => {
      const clicked = {
        settings: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "https://example.com",
            linkTarget,
          },
        },
      };
      expect(getDashboardDrillLinkTarget(clicked)).toBe(linkTarget);
    },
  );

  it("returns undefined for an invalid linkTarget value", () => {
    const clicked = {
      settings: {
        click_behavior: {
          type: "link",
          linkType: "url",
          linkTemplate: "https://example.com",
          linkTarget: "_evil",
        },
      },
    };
    expect(getDashboardDrillLinkTarget(clicked)).toBeUndefined();
  });

  it("reads linkTarget from column-level click_behavior when present", () => {
    const column = { name: "Total" };
    const clicked = {
      column,
      settings: {
        column: () => ({
          click_behavior: {
            type: "link",
            linkType: "dashboard",
            targetId: 1,
            linkTarget: "_blank",
          },
        }),
      },
    };
    expect(getClickBehavior(clicked).linkTarget).toBe("_blank");
    expect(getDashboardDrillLinkTarget(clicked)).toBe("_blank");
  });
});
