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

export function getterOf(key: string): object | undefined {
  return (
    Object.getOwnPropertyDescriptor(window, key)?.get ??
    Object.getOwnPropertyDescriptor(Window.prototype, key)?.get
  );
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
