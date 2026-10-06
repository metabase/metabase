import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import columnPresets from "./testing/column-presets.json";

const TESTING_DOC = readFileSync(
  join(__dirname, "skill/references/testing.md"),
  "utf-8",
);

describe("testing.md", () => {
  it("lists every mockColumn kind", () => {
    const spans = new Set(
      [...TESTING_DOC.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
    );

    expect(
      Object.keys(columnPresets).filter((kind) => !spans.has(kind)),
    ).toEqual([]);
  });
});
