import { noop } from "underscore";

type CancellablePromise<T> = Promise<T> & {
  cancel: () => void;
};

// return a promise wrapping the provided one but with a "cancel" method
export function cancelable<T>(promise: Promise<T>): CancellablePromise<T> {
  let canceled = false;

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    promise.then(
      value => (canceled ? reject({ isCanceled: true }) : resolve(value)),
      error => (canceled ? reject({ isCanceled: true }) : reject(error)),
    );
  });

  return Object.assign(wrappedPromise, { cancel: () => (canceled = true) });
}

// if a promise doesn't resolve/reject within a given duration it will reject
export function timeout(
  promise: Promise<unknown>,
  duration: number,
  error: unknown,
) {
  return new Promise((resolve, reject) => {
    promise.then(resolve, reject);
    setTimeout(
      () => reject(error || new Error("Operation timed out")),
      duration,
    );
  });
}

// returns a promise that resolves after a given duration
export function delay(duration: number) {
  return new Promise(resolve => setTimeout(resolve, duration));
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
