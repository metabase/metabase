import type { VisualizationSettings } from "metabase-types/api";

import { removeInternalClickBehaviors } from "./links";

describe("removeInternalClickBehaviors", () => {
  it("keeps the same settings reference when there are no internal link click behaviors", () => {
    const settings = {
      click_behavior: {
        type: "link",
        linkType: "url",
        linkTemplate: "https://metabase.com",
      },
      column_settings: {
        '["name","TOTAL"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "https://metabase.com",
          },
        },
      },
    } as const;

    expect(removeInternalClickBehaviors(settings)).toBe(settings);
  });

  it.each(["dashboard", "question"] as const)(
    "removes internal %s link click behaviors from computed settings",
    (linkType) => {
      const result = removeInternalClickBehaviors({
        click_behavior: { type: "link", linkType, targetId: 1 },
      });

      expect(result.click_behavior).toBeUndefined();
    },
  );

  it("does not crash on undefined column settings entries (EMB-1940)", () => {
    const settings = {
      column_settings: {
        // columns without stored settings can end up as `undefined` entries
        '["name","TOTAL"]': undefined,
        '["name","SUBTOTAL"]': {
          click_behavior: {
            type: "link",
            linkType: "dashboard",
            targetId: 1,
          },
        },
      },
    } as unknown as VisualizationSettings;

    const result = removeInternalClickBehaviors(settings);

    expect(result).toBe(settings);
  });
});
