type Key = string | number;
type Value = any;

declare module icepick {
    declare function assoc<O:Object, K:Key, V:Value>(object: O, key: K, value: V): O;
    declare function dissoc<O:Object, K:Key, V:Value>(object: O, key: K): O;

    declare function getIn<O:Object, K:Key, V:Value>(object: ?O, path: Array<K>): ?V;
    declare function setIn<O:Object, K:Key, V:Value>(object: O, path: Array<K>, value: V): O;
    declare function assocIn<O:Object, K:Key, V:Value>(object: O, path: Array<K>, value: V): O;
    declare function updateIn<O:Object, K:Key, V:Value>(object: O, path: Array<K>, callback: ((value: V) => V)): O;

    declare function merge<O:Object>(object: O, other: O): O;

    // TODO: improve this
    declare function chain<O:Object>(object: O): any;
}
