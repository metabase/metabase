import { type KeyboardShortcutId, shortcuts } from ".";

const getShortcutsWithPrefix = (prefix: string) => {
  const allIds = Object.keys(shortcuts) as KeyboardShortcutId[];
  return allIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => ({ ...shortcuts[id], id }));
};

const sacredShortcuts = [
  "$mod+m", // minimize
  "$mod+c", // copy
  "$mod+v", // paste
  "$mod+x", // cut
  "$mod+z", // undo
  "$mod+y", // redo
  "$mod+w", // close current window
  "$mod+f", // find
  "$mod+0", // reset zoom
  "$mod+t", // new tab
  "$mod+n", // new window
];

describe("shortcuts", () => {
  it("navigation shortcuts should always require a sequence of button presses", () => {
    const navShortcuts = getShortcutsWithPrefix("navigate-");

    expect(navShortcuts.length).toBeGreaterThan(0);
    navShortcuts.forEach((shortcutDef) => {
      expect(shortcutDef.shortcut[0].split(" ").length).toBeGreaterThan(1);
    });
  });

  it("create new shortcuts should always require a sequence of button presses", () => {
    const navShortcuts = getShortcutsWithPrefix("create-");

    expect(navShortcuts.length).toBeGreaterThan(0);
    navShortcuts.forEach((shortcutDef) => {
      expect(shortcutDef.shortcut[0].split(" ").length).toBeGreaterThan(1);
    });
  });

  it("shortcuts should use $mod, not Control or Meta", () => {
    Object.values(shortcuts).forEach((shortcutDef) => {
      const shortcutKeys = shortcutDef.shortcut[0];

      expect(shortcutKeys.includes("Meta")).toBeFalsy();

      expect(shortcutKeys.includes("Control")).toBeFalsy();
    });
  });

  it("should not override known browser and system shortcuts", () => {
    Object.values(shortcuts).forEach((shortcutDef) => {
      const shortcutKeys = shortcutDef.shortcut[0];

      expect(sacredShortcuts.includes(shortcutKeys)).toBeFalsy();
    });
  });
});
