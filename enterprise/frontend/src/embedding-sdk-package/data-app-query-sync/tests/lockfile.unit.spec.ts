import fs from "node:fs";
import path from "node:path";

import { RESOURCE_LOCKFILE, readResourceLockfile } from "../lockfile";
import type { ResourceLockfile } from "../types";

import { FAKE_HASH, makeApp, setupResourceSyncTests } from "./setup";

function write(appRoot: string, value: unknown) {
  fs.writeFileSync(
    path.join(appRoot, RESOURCE_LOCKFILE),
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

function query(savedQuestionSourceId: number) {
  return { tableId: 1, hash: FAKE_HASH, savedQuestionSourceId };
}

function model(
  sourceModelId: number,
  copiedModelId: number,
  actions: Array<[number, number]> = [],
) {
  return {
    sourceModelId,
    copiedModelId,
    hash: FAKE_HASH,
    actions: actions.map(([sourceActionId, copiedActionId]) => ({
      sourceActionId,
      copiedActionId,
      hash: FAKE_HASH,
    })),
  };
}

describe("resource lockfile", () => {
  setupResourceSyncTests();

  it("reads an absent lockfile as empty", () => {
    expect(readResourceLockfile(makeApp())).toEqual({
      queries: [],
      models: [],
    });
  });

  it("round-trips queries and models", () => {
    const appRoot = makeApp();
    const lockfile: ResourceLockfile = {
      queries: [query(40)],
      models: [model(5, 80, [[51, 91]])],
    };
    write(appRoot, lockfile);

    expect(readResourceLockfile(appRoot)).toEqual(lockfile);
  });

  it("defaults a missing models key rather than failing", () => {
    const appRoot = makeApp();
    write(appRoot, { queries: [query(40)] });

    expect(readResourceLockfile(appRoot)).toEqual({
      queries: [query(40)],
      models: [],
    });
  });

  describe("rejects a lockfile it cannot trust", () => {
    it.each([
      ["unparseable JSON", "{ not json", "Could not read"],
      // A bare array is the shape no version writes; accepting it would let a
      // hand-edited file silently drop every model entry.
      ["a bare array", [query(40)], "contains an invalid entry"],
      ["a non-object", 42, "contains an invalid entry"],
      [
        "a malformed hash",
        { queries: [{ ...query(40), hash: "nope" }] },
        "contains an invalid entry",
      ],
      [
        "a non-integer saved question ID",
        { queries: [{ ...query(40), savedQuestionSourceId: 1.5 }] },
        "contains an invalid entry",
      ],
      [
        "a model entry missing its actions",
        { queries: [], models: [{ sourceModelId: 5, copiedModelId: 80 }] },
        "contains an invalid model entry",
      ],
      [
        "a malformed action mapping",
        {
          queries: [],
          models: [{ ...model(5, 80), actions: [{ sourceActionId: 51 }] }],
        },
        "contains an invalid model entry",
      ],
    ])("rejects %s", (_name, value, message) => {
      const appRoot = makeApp();
      write(appRoot, value);

      expect(() => readResourceLockfile(appRoot)).toThrow(message);
    });
  });

  describe("rejects duplicate ownership claims", () => {
    it.each([
      [
        "saved question ID",
        { queries: [query(40), query(40)] },
        "duplicate saved question ID",
      ],
      [
        "source model ID",
        { queries: [], models: [model(5, 80), model(5, 81)] },
        "duplicate source model ID",
      ],
      [
        "copied model ID",
        { queries: [], models: [model(5, 80), model(6, 80)] },
        "duplicate copied model ID",
      ],
      [
        "source action ID across models",
        {
          queries: [],
          models: [model(5, 80, [[51, 91]]), model(6, 81, [[51, 92]])],
        },
        "duplicate source action ID",
      ],
      [
        "copied action ID across models",
        {
          queries: [],
          models: [model(5, 80, [[51, 91]]), model(6, 81, [[52, 91]])],
        },
        "duplicate copied action ID",
      ],
    ])("rejects a duplicate %s", (_name, value, message) => {
      const appRoot = makeApp();
      write(appRoot, value);

      expect(() => readResourceLockfile(appRoot)).toThrow(message);
    });
  });
});
