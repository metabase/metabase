/** Returns true if e.key is the given key and no modifier keys (ctrl, meta, alt, shift) were pressed */
export const isPlainKey = (e: React.KeyboardEvent, key: string) => {
  return e.key === key && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
};
