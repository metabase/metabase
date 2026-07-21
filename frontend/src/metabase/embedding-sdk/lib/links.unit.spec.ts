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

  it("removes internal link click behaviors from column settings", () => {
    const result = removeInternalClickBehaviors({
      column_settings: {
        '["name","TOTAL"]': {
          click_behavior: {
            type: "link",
            linkType: "dashboard",
            targetId: 1,
          },
        },
        '["name","SUBTOTAL"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "https://metabase.com",
          },
        },
      },
    });

    expect(result.column_settings?.['["name","TOTAL"]'].click_behavior).toBe(
      undefined,
    );
    expect(result.column_settings?.['["name","SUBTOTAL"]'].click_behavior)
      .toMatchInlineSnapshot(`
      {
        "linkTemplate": "https://metabase.com",
        "linkType": "url",
        "type": "link",
      }
    `);
  });

  it("does not crash on undefined column settings entries (EMB-1940)", () => {
    // Unjustified type cast. FIXME
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

    expect(
      result.column_settings?.['["name","SUBTOTAL"]'].click_behavior,
    ).toBeUndefined();
  });
});
