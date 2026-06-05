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
});
