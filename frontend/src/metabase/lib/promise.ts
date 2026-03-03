import { noop } from "underscore";

import type { Deferred } from "metabase-types/api";

// returns a promise that resolves after a given duration
export function delay(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
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
