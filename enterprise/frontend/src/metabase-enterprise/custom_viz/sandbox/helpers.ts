function ownFunctionsOf(
  obj: object,
  pick: (descriptor: PropertyDescriptor) => unknown,
): object[] {
  const keys: (string | symbol)[] = [
    ...Object.getOwnPropertyNames(obj),
    ...Object.getOwnPropertySymbols(obj),
  ];
  return keys.flatMap((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    const fn = descriptor && pick(descriptor);
    return typeof fn === "function" ? [fn] : [];
  });
}

// Walk the entire prototype chain from `start` and return the first own
// descriptor matching `key`. Window properties like `performance` and
// `devicePixelRatio` may live on a hidden intermediate prototype between
// `window` and `Window.prototype` (e.g. `WindowProperties`); flat lookup
// misses them.
function descriptorOnChain(
  start: object,
  key: string,
): PropertyDescriptor | undefined {
  let proto: object | null = start;
  while (proto) {
    const d = Object.getOwnPropertyDescriptor(proto, key);
    if (d) {
      return d;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

export function getterFromWindowOf(key: string): object | undefined {
  return descriptorOnChain(window, key)?.get;
}

export function setterFromWindowOf(key: string): object | undefined {
  return descriptorOnChain(window, key)?.set;
}

export function allGettersOf(proto: object): object[] {
  return ownFunctionsOf(proto, (descriptor) => descriptor.get);
}

export function allMethodsOf(obj: object): object[] {
  return ownFunctionsOf(obj, (descriptor) => descriptor.value);
}

export function allSettersOf(proto: object): object[] {
  return ownFunctionsOf(proto, (descriptor) => descriptor.set);
}

export function allGettersAndMethodsOf(proto: object): object[] {
  return [...allGettersOf(proto), ...allMethodsOf(proto)];
}

export function allMembersOf(proto: object): object[] {
  return [...allGettersAndMethodsOf(proto), ...allSettersOf(proto)];
}

export function allClassMethodsOf(
  ctor: object & { prototype: object },
): object[] {
  return [...allMethodsOf(ctor), ...allMethodsOf(ctor.prototype)];
}

export function allClassMembersOf(
  ctor: object & { prototype: object },
): object[] {
  return [...allMembersOf(ctor), ...allMembersOf(ctor.prototype)];
}

export function entireClassOf(ctor: object & { prototype: object }): object[] {
  return [ctor, ...allClassMembersOf(ctor)];
}

// Walk the prototype chain (excluding Object.prototype) and gather members at
// every level. Use when own-properties on a single prototype miss things —
// e.g. MessageChannel#port1/port2 may be inherited rather than own getters.
export function allInheritedMembersOf(start: object): object[] {
  const result: object[] = [];
  let proto: object | null = start;
  while (proto && proto !== Object.prototype) {
    result.push(...allMembersOf(proto));
    proto = Object.getPrototypeOf(proto);
  }
  return result;
}
