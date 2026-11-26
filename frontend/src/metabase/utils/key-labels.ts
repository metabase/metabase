export function isMac() {
  const { platform = "" } = navigator;
  return Boolean(platform.match(/^Mac/));
}

export const METAKEY = isMac() ? "⌘" : "Ctrl";
export const ALTKEY = isMac() ? "⌥" : "Alt";
