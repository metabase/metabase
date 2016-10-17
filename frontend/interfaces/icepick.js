type Key = string | number;
type Value = any;

declare module icepick {
    declare function getIn<O:Object, K:Key, V:Value>(object: ?O, path: Array<K>): ?V;
    declare function setIn<O:Object, K:Key, V:Value>(object: O, path: Array<K>, value: V): O;
    declare function updateIn<O:Object, K:Key, V:Value>(object: O, path: Array<K>, callback: ((value: V) => V)): O;
}
