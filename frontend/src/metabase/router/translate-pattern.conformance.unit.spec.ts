import { matchPattern } from "react-router/lib/PatternUtils";
import { matchPath } from "react-router-v7";

import { translatePatternToV3 } from "./translate-pattern";

/**
 * Proves the v7->v3 translation preserves matching: for each route path (authored
 * in v7 syntax), the v3 matcher fed the translated pattern extracts the same
 * params from the same URL as the v7 matcher fed the original. This is what keeps
 * the live v3 engine correct while the tree is authored in v7 shape.
 */

type Case = {
  /** The route path as authored in the tree, in v7 syntax. */
  v7: string;
  urls: Array<[url: string, params: Record<string, string>]>;
};

// v3's splat param is `splat`; v7's is `*`, and v3 keeps a leading slash. An
// unmatched optional is `null` on v3, absent on v7. Normalize all of it away.
function normalize(params: Record<string, string | null | undefined>) {
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(params)) {
    if (rawValue == null || rawValue === "") {
      continue;
    }
    const key = rawKey === "splat" ? "*" : rawKey;
    out[key] = key === "*" ? rawValue.replace(/^\//, "") : rawValue;
  }
  return out;
}

function v3Params(v7Pattern: string, url: string) {
  const match = matchPattern(translatePatternToV3(v7Pattern), url);
  if (!match || match.remainingPathname !== "") {
    throw new Error(
      `v3 pattern for "${v7Pattern}" did not fully match "${url}"`,
    );
  }
  const params: Record<string, string | null> = {};
  match.paramNames.forEach((name: string, index: number) => {
    params[name] = match.paramValues[index];
  });
  return normalize(params);
}

function v7Params(v7Pattern: string, url: string) {
  const rooted = v7Pattern.startsWith("/") ? v7Pattern : `/${v7Pattern}`;
  const match = matchPath({ path: rooted, end: true }, url);
  expect(match).not.toBeNull();
  return normalize(match!.params);
}

const CASES: Case[] = [
  {
    v7: "/admin/tools/notifications/:notificationId?",
    urls: [
      ["/admin/tools/notifications", {}],
      ["/admin/tools/notifications/7", { notificationId: "7" }],
    ],
  },
  {
    v7: "dashboard/:slug/:tabSlug?",
    urls: [
      ["/dashboard/5-sales", { slug: "5-sales" }],
      ["/dashboard/5-sales/2-tab", { slug: "5-sales", tabSlug: "2-tab" }],
    ],
  },
  {
    v7: "dashboard/:uuid/:tabSlug?",
    urls: [
      ["/dashboard/9a-uuid", { uuid: "9a-uuid" }],
      ["/dashboard/9a-uuid/3-tab", { uuid: "9a-uuid", tabSlug: "3-tab" }],
    ],
  },
  {
    v7: "/dashboard/:slug?",
    urls: [
      ["/dashboard", {}],
      ["/dashboard/5-sales", { slug: "5-sales" }],
    ],
  },
  {
    v7: "databases/:dbId/tables/:tableId/edit/:objectId?",
    urls: [
      ["/databases/1/tables/2/edit", { dbId: "1", tableId: "2" }],
      [
        "/databases/1/tables/2/edit/9",
        { dbId: "1", tableId: "2", objectId: "9" },
      ],
    ],
  },
  {
    v7: "question/entity/:entity_id/*",
    urls: [
      ["/question/entity/abc123", { entity_id: "abc123" }],
      ["/question/entity/abc123/tail", { entity_id: "abc123", "*": "tail" }],
    ],
  },
  {
    v7: "collection/entity/:entity_id/*",
    urls: [["/collection/entity/xY9", { entity_id: "xY9" }]],
  },
  {
    v7: "files/*",
    urls: [
      ["/files", {}],
      ["/files/a/b", { "*": "a/b" }],
    ],
  },
];

describe("translatePatternToV3 conformance (v7 matchPath vs v3 matchPattern)", () => {
  it.each(CASES)("$v7", ({ v7, urls }) => {
    for (const [url, expected] of urls) {
      const fromV3 = v3Params(v7, url);
      const fromV7 = v7Params(v7, url);
      expect(fromV3).toMatchObject(expected);
      expect(fromV7).toMatchObject(expected);
      expect(fromV3).toEqual(fromV7);
    }
  });
});

describe("translatePatternToV3", () => {
  it.each([
    ["dashboard/:slug/:tabSlug?", "dashboard/:slug(/:tabSlug)"],
    ["/dashboard/:slug?", "/dashboard(/:slug)"],
    ["question/entity/:entity_id/*", "question/entity/:entity_id(**)"],
    ["files/*", "files(/**)"],
    ["/collections/:collectionId", "/collections/:collectionId"],
    ["*", "*"],
    ["/admin/databases", "/admin/databases"],
  ])("translates %s -> %s", (v7, expected) => {
    expect(translatePatternToV3(v7)).toBe(expected);
  });
});
