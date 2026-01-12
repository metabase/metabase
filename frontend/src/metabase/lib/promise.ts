import { noop } from "underscore";

// returns a promise that resolves after a given duration
export function delay(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export interface Deferred<T = unknown> {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: any): void;
}

export function defer<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] = noop;
  let reject: Deferred<T>["reject"] = noop;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
