export interface Deferred<T = unknown> {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: any): void;
}
