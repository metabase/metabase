const resets: (() => void)[] = [];

// The registry is what lets reinitialize() reset a slot declared in a module above metabase/plugins.
export function definePluginSlot<T extends object>(getDefaults: () => T): T {
  const slot = getDefaults();
  resets.push(() => resetPluginSlot(slot, getDefaults()));
  return slot;
}

export function resetPluginSlots() {
  for (const reset of resets) {
    reset();
  }
}

// Mutate in place so that existing references to the slot stay valid.
function resetPluginSlot<T extends object>(slot: T, defaults: T) {
  if (Array.isArray(slot) && Array.isArray(defaults)) {
    slot.splice(0, slot.length, ...defaults);
    return;
  }
  for (const key of Object.keys(slot)) {
    if (!(key in defaults)) {
      Reflect.deleteProperty(slot, key);
    }
  }
  Object.assign(slot, defaults);
}
