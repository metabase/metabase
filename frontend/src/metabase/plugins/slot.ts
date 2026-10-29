const resets: (() => void)[] = [];

/**
 * Define a plugin slot with OSS defaults and register it for reinitialize().
 *
 * Declare slots once at module scope in the owner's plugins.ts or plugins/
 * directory, and export them through the owner's index.ts.
 *
 * getDefaults runs at declaration and on every reset. It must return a fresh
 * mutable plain object with enumerable string-keyed properties, or an array
 * of contributions. Allocate fresh mutable nested values too. Keep the factory
 * free of side effects and independent of other slots: reset order is not a
 * dependency contract.
 *
 * Plugins fill the slot at boot. Consumers read its properties at call time
 * rather than capturing them at module scope. Reset preserves the slot's own
 * identity, but replaces its properties or array contents; nested references
 * are not preserved.
 */
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
    if (!Object.hasOwn(defaults, key)) {
      Reflect.deleteProperty(slot, key);
    }
  }
  Object.assign(slot, defaults);
}
