import { ALTKEY, METAKEY } from "metabase/utils/browser";

import { formatKey, parseShortcut } from "./utils";

describe("formatKey", () => {
  it.each([
    // platform modifiers
    ["$mod", METAKEY],
    ["Alt", ALTKEY],
    // arrows → symbols
    ["ArrowUp", "↑"],
    ["ArrowDown", "↓"],
    ["ArrowLeft", "←"],
    ["ArrowRight", "→"],
    // KeyboardEvent.code letter form
    ["KeyL", "L"],
    // single letters uppercased
    ["c", "C"],
    // named keys capitalized
    ["backspace", "Backspace"],
    ["Shift", "Shift"],
    // symbols / punctuation left as-is
    ["?", "?"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatKey(input)).toBe(expected);
  });
});

describe("parseShortcut", () => {
  it("renders a simultaneous chord as a single step", () => {
    expect(parseShortcut("$mod+k")).toEqual([[METAKEY, "K"]]);
  });

  it("splits a sequence on whitespace into separate steps", () => {
    expect(parseShortcut("c e")).toEqual([["C"], ["E"]]);
  });

  it("orders modifiers canonically ($mod, Alt, Shift, key) regardless of source order", () => {
    expect(parseShortcut("Shift+Alt+$mod+x")).toEqual([
      [METAKEY, ALTKEY, "Shift", "X"],
    ]);
  });

  it("handles a sequence of chords", () => {
    expect(parseShortcut("Alt+ArrowUp c")).toEqual([[ALTKEY, "↑"], ["C"]]);
  });
});
