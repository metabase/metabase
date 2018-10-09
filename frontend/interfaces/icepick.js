type Key = string | number;
type Value = any;

declare module icepick {
  declare function assoc<O: Object | Array<any>, K: Key, V: Value>(
    object: O,
    key: K,
    value: V,
  ): O;
  declare function dissoc<O: Object | Array<any>, K: Key, V: Value>(
    object: O,
    key: K,
  ): O;

  declare function getIn<O: Object | Array<any>, K: Key, V: Value>(
    object: ?O,
    path: Array<K>,
  ): ?V;
  declare function setIn<O: Object | Array<any>, K: Key, V: Value>(
    object: O,
    path: Array<K>,
    value: V,
  ): O;
  declare function assocIn<O: Object | Array<any>, K: Key, V: Value>(
    object: O,
    path: Array<K>,
    value: V,
  ): O;
  declare function dissocIn<O: Object | Array<any>, K: Key>(
    object: O,
    path: Array<K>,
  ): O;
  declare function updateIn<O: Object | Array<any>, K: Key, V: Value>(
    object: O,
    path: Array<K>,
    callback: (value: V) => V,
  ): O;

  declare function merge<O: Object | Array<any>>(object: O, other: O): O;

  // TODO: improve this
  declare function chain<O: Object | Array<any>>(object: O): any;
}
