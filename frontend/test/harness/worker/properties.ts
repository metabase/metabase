/**
 * A view of an object whose keys are only known at runtime. The runner copies,
 * hides and restores globals and window properties by name, which no static
 * type can describe.
 */
export function propertiesOf(target: object): Record<PropertyKey, unknown> {
  // Any object can be read and written by key. The caller is responsible for
  // checking the values it reads.
  return target as Record<PropertyKey, unknown>;
}

export const globals = propertiesOf(globalThis);

export type Descriptors = Map<PropertyKey, PropertyDescriptor>;

export function ownDescriptors(target: object): Descriptors {
  const descriptors: Descriptors = new Map();
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) {
      descriptors.set(key, descriptor);
    }
  }
  return descriptors;
}

export function sameDescriptor(
  a: PropertyDescriptor | undefined,
  b: PropertyDescriptor | undefined,
): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.value === b.value &&
    a.get === b.get &&
    a.set === b.set &&
    a.writable === b.writable &&
    a.enumerable === b.enumerable &&
    a.configurable === b.configurable
  );
}

/**
 * Puts the properties back as they were recorded. With removeAdded, a key
 * added since is deleted, unless keepAdded names it.
 */
export function restoreDescriptors(
  target: object,
  descriptors: Descriptors,
  {
    removeAdded = false,
    keepAdded,
  }: { removeAdded?: boolean; keepAdded?: Set<PropertyKey> } = {},
): void {
  if (removeAdded) {
    for (const key of Reflect.ownKeys(target)) {
      if (!descriptors.has(key) && !keepAdded?.has(key)) {
        tryTo(() => Reflect.deleteProperty(target, key));
      }
    }
  }
  for (const [key, descriptor] of descriptors) {
    if (
      !sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)
    ) {
      tryTo(() => Object.defineProperty(target, key, descriptor));
    }
  }
}

/**
 * Runs an operation that may throw on a property that is not configurable, a
 * frozen object or an accessor whose getter throws. The runner restores
 * whatever it can, and such a property is left as it is.
 */
export function tryTo(operation: () => void): void {
  try {
    operation();
  } catch {
    // Left as it is, see above.
  }
}
