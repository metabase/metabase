export type CancelablePromise<T> = PromiseLike<T> & { cancel: () => void };

// return a promise wrapping the provided one but with a "cancel" method
export function cancelable<T>(promise: PromiseLike<T>): CancelablePromise<T> {
  let canceled = false;

  const wrappedPromise: Partial<CancelablePromise<T>> = new Promise(
    (resolve, reject) => {
      promise.then(
        value => (canceled ? reject({ isCanceled: true }) : resolve(value)),
        error => (canceled ? reject({ isCanceled: true }) : reject(error)),
      );
    },
  );

  wrappedPromise.cancel = function() {
    canceled = true;
  };

  return wrappedPromise as CancelablePromise<T>;
}

// if a promise doesn't resolve/reject within a given duration it will reject
export function timeout<T>(
  promise: PromiseLike<T>,
  duration: number,
  error: any,
): Promise<T> {
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
  return new Promise((resolve, reject) => setTimeout(resolve, duration));
}

type DeferredPromise<T> = {
  promise: PromiseLike<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
};

export function defer<T = any>() {
  const deferred: Partial<DeferredPromise<T>> = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred as DeferredPromise<T>;
}
