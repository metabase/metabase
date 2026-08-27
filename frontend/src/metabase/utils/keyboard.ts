export const KEYCODE_SPACE = 0;
export const KEYCODE_BACKSPACE = 8;
export const KEYCODE_TAB = 9;
export const KEYCODE_ENTER = 13;
export const KEYCODE_ESCAPE = 27;

export const KEYCODE_LEFT = 37;
export const KEYCODE_UP = 38;
export const KEYCODE_RIGHT = 39;
export const KEYCODE_DOWN = 40;

export const KEY_COMMA = ",";
export const KEYCODE_FORWARD_SLASH = 191;

export const KEY_ESCAPE = "Escape";
export const KEY_ENTER = "Enter";
export const KEY_BACKSPACE = "Backspace";

/** Returns true if e.key is the given key and no modifier keys (ctrl, meta, alt, shift) were pressed */
export const isPlainKey = (e: React.KeyboardEvent, key: string) => {
  return e.key === key && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
};

export const hasModifierKeys = (e: React.MouseEvent) => {
  return e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
};
