/// We require two type parameters and use K to specify the base class of T so
/// that type inference works - otherwise it isn't recognized as a class
export type Constructor<K, T extends K> = new (...args: any[]) => T;
