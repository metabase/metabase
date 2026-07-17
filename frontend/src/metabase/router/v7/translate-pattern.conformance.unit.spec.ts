import { matchPattern } from "react-router/lib/PatternUtils";
import { matchPath } from "react-router-v7";

import { translatePattern } from "./translate-pattern";

/**
 * Proves the v3->v7 pattern translation preserves matching: for each real route
 * path, v3's own matcher and v7's matcher (fed the translated pattern) extract
 * the same params from the same URL. This is the engine-swap's core risk
 * (route matching), pinned as a red test.
 */

type Case = {
  /** The route path as authored in the tree, in v3 syntax. */
  v3: string;
  /** URLs that should match, each paired with the params it must yield. */
  urls: Array<[url: string, params: Record<string, string>]>;
};

// The splat param is `splat` on v3 and `*` on v7, and v3 keeps a leading slash
// on its value; an unmatched optional is `null` on v3 and absent on v7. Normalize
// all of that away so the comparison is about the params the app actually reads.
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

function v3Params(pattern: string, url: string) {
  const match = matchPattern(pattern, url);
  if (!match) {
    throw new Error(`v3 pattern "${pattern}" did not match "${url}"`);
  }
  // Only a full match (nothing left over) counts as this route serving the URL.
  expect(match.remainingPathname).toBe("");
  const params: Record<string, string | null> = {};
  match.paramNames.forEach((name: string, index: number) => {
    params[name] = match.paramValues[index];
  });
  return normalize(params);
}

function v7Params(pattern: string, url: string) {
  const rooted = pattern.startsWith("/") ? pattern : `/${pattern}`;
  const match = matchPath({ path: rooted, end: true }, url);
  expect(match).not.toBeNull();
  return normalize(match!.params);
}

const CASES: Case[] = [
  {
    v3: "/admin/tools/notifications(/:notificationId)",
    urls: [
      ["/admin/tools/notifications", {}],
      ["/admin/tools/notifications/7", { notificationId: "7" }],
    ],
  },
  {
    v3: "dashboard/:slug(/:tabSlug)",
    urls: [
      ["/dashboard/5-sales", { slug: "5-sales" }],
      [
        "/dashboard/5-sales/2-overview",
        { slug: "5-sales", tabSlug: "2-overview" },
      ],
    ],
  },
  {
    v3: "dashboard/:uuid(/:tabSlug)",
    urls: [
      ["/dashboard/9a-uuid", { uuid: "9a-uuid" }],
      ["/dashboard/9a-uuid/3-tab", { uuid: "9a-uuid", tabSlug: "3-tab" }],
    ],
  },
  {
    v3: "databases/:dbId/tables/:tableId/edit(/:objectId)",
    urls: [
      ["/databases/1/tables/2/edit", { dbId: "1", tableId: "2" }],
      [
        "/databases/1/tables/2/edit/9",
        { dbId: "1", tableId: "2", objectId: "9" },
      ],
    ],
  },
  {
    v3: "/question/entity/:entity_id(**)",
    urls: [
      ["/question/entity/abc123", { entity_id: "abc123" }],
      ["/question/entity/abc123/ignored/tail", { entity_id: "abc123" }],
    ],
  },
  {
    v3: "collection/entity/:entity_id(**)",
    urls: [
      ["/collection/entity/xY9", { entity_id: "xY9" }],
      ["/collection/entity/xY9/rest", { entity_id: "xY9" }],
    ],
  },
  {
    v3: "dashboard/entity/:entity_id(**)",
    urls: [["/dashboard/entity/dd-1", { entity_id: "dd-1" }]],
  },
  {
    v3: "files/**",
    urls: [["/files/a/b/c", {}]],
  },
  {
    v3: "/admin/transforms/*",
    urls: [["/admin/transforms/jobs/5", {}]],
  },
  {
    // `/admin/metabot*` is an in-segment prefix splat; the translation to
    // `/admin/metabot/*` covers `/admin/metabot` and its subpaths, which is what
    // the route serves. A glued suffix (`/admin/metabotfoo`) is not exercised.
    v3: "/admin/metabot*",
    urls: [
      ["/admin/metabot", {}],
      ["/admin/metabot/settings", {}],
    ],
  },
  {
    v3: "*",
    urls: [["/anything/at/all", {}]],
  },
];

describe("translatePattern conformance (v3 matchPattern vs v7 matchPath)", () => {
  it.each(CASES)("$v3", ({ v3, urls }) => {
    const translated = translatePattern(v3);
    for (const [url, expected] of urls) {
      const fromV3 = v3Params(v3, url);
      const fromV7 = v7Params(translated, url);
      // The named params the app reads are present on both.
      expect(fromV3).toMatchObject(expected);
      expect(fromV7).toMatchObject(expected);
      // And the two engines agree exactly (including any splat value).
      expect(fromV7).toEqual(fromV3);
    }
  });
});

describe("translatePattern", () => {
  it.each([
    ["dashboard/:slug(/:tabSlug)", "dashboard/:slug/:tabSlug?"],
    [
      "/admin/tools/notifications(/:notificationId)",
      "/admin/tools/notifications/:notificationId?",
    ],
    ["/question/entity/:entity_id(**)", "/question/entity/:entity_id/*"],
    ["files/**", "files/*"],
    ["/admin/metabot*", "/admin/metabot/*"],
    ["*", "*"],
    ["/collections/:collectionId", "/collections/:collectionId"],
  ])("translates %s -> %s", (v3, expected) => {
    expect(translatePattern(v3)).toBe(expected);
  });

  it("throws on a static-inside-optional pattern that needs nesting", () => {
    expect(() =>
      translatePattern("database(/:databaseId)(/schema/:schemaName)"),
    ).toThrow(/nested routes/);
  });
});
