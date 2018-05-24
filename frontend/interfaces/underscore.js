// type definitions for (some of) underscore

declare module "underscore" {
  declare function find<T>(list: ?(T[]), predicate: (val: T) => boolean): ?T;
  declare function findWhere<T>(
    list: ?(T[]),
    properties: { [key: string]: any },
  ): ?T;
  declare function findIndex<T>(
    list: ?(T[]),
    predicate: (val: T) => boolean,
  ): number;
  declare function findLastIndex<T>(
    list: ?(T[]),
    predicate: (val: T) => boolean,
  ): number;

  declare function clone<T>(obj: T): T;

  declare function isEqual(a: any, b: any): boolean;
  declare function range(a: number, b?: number): Array<number>;
  declare function extend<S, T>(o1: S, o2: T): S & T;

  declare function zip<S, T>(a1: S[], a2: T[]): Array<[S, T]>;

  declare function flatten<S>(a: Array<Array<S>>): S[];

  declare function each<T>(
    o: { [key: string]: T },
    iteratee: (val: T, key: string) => void,
  ): void;
  declare function each<T>(
    a: T[],
    iteratee: (val: T, key: string) => void,
  ): void;

  declare function map<T, U>(a: T[], iteratee: (val: T, n?: number) => U): U[];
  declare function map<K, T, U>(
    a: { [key: K]: T },
    iteratee: (val: T, k?: K) => U,
  ): U[];
  declare function mapObject(
    object: Object,
    iteratee: (val: any, key: string) => Object,
    context?: mixed,
  ): Object;

  declare function object<T>(a: Array<[string, T]>): { [key: string]: T };

  declare function every<T>(a: Array<T>, pred: (val: T) => boolean): boolean;
  declare function some<T>(a: Array<T>, pred: (val: T) => boolean): boolean;
  declare function all<T>(a: Array<T>, pred: (val: T) => boolean): boolean;
  declare function any<T>(a: Array<T>, pred: (val: T) => boolean): boolean;
  declare function contains<T>(a: Array<T>, val: T): boolean;

  declare function initial<T>(a: Array<T>, n?: number): Array<T>;
  declare function rest<T>(a: Array<T>, index?: number): Array<T>;

  declare function sortBy<T>(a: T[], iteratee: string | ((val: T) => any)): T[];

  declare function filter<T>(
    o: { [key: string]: T },
    pred: (val: T, k: string) => boolean,
  ): T[];

  declare function isEmpty(o: any): boolean;
  declare function isString(o: any): boolean;
  declare function isObject(o: any): boolean;
  declare function isArray(o: any): boolean;

  declare function groupBy<T>(
    a: Array<T>,
    iteratee: string | ((val: T, index: number) => any),
  ): { [key: string]: T[] };

  declare function min<T>(a: Array<T> | { [key: any]: T }): T;
  declare function max<T>(a: Array<T> | { [key: any]: T }): T;

  declare function uniq<T>(a: T[], iteratee?: (val: T) => boolean): T[];
  declare function uniq<T>(
    a: T[],
    isSorted: boolean,
    iteratee?: (val: T) => boolean,
  ): T[];

  declare function values<T>(o: { [key: any]: T }): T[];
  declare function omit(
    o: { [key: any]: any },
    ...properties: string[]
  ): { [key: any]: any };
  declare function omit(
    o: { [key: any]: any },
    predicate: (val: any, key: any, object: { [key: any]: any }) => boolean,
  ): { [key: any]: any };
  declare function pick(
    o: { [key: any]: any },
    ...properties: string[]
  ): { [key: any]: any };
  declare function pick(
    o: { [key: any]: any },
    predicate: (val: any, key: any, object: { [key: any]: any }) => boolean,
  ): { [key: any]: any };
  declare function pluck(
    o: Array<{ [key: any]: any }>,
    propertyNames: string,
  ): Array<any>;
  declare function has(
    o: { [key: any]: any },
    ...properties: string[]
  ): boolean;

  declare function difference<T>(array: T[], ...others: T[][]): T[];

  declare function flatten(a: Array<any>): Array<any>;

  declare function debounce<T: any => any>(func: T): T;

  declare function partition<T>(
    array: T[],
    pred: (val: T) => boolean,
  ): [T[], T[]];

  // TODO: improve this
  declare function chain<S>(obj: S): any;

  declare function constant<S>(obj: S): () => S;

  declare function isMatch(object: Object, properties: Object): boolean;
  declare function identity<T>(o: T): T;
}
