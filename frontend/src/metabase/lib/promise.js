// return a promise wrapping the provided one but with a "cancel" method
export function cancelable(promise) {
  let canceled = false;

  const wrappedPromise = new Promise((resolve, reject) => {
    promise.then(
      value => (canceled ? reject({ isCanceled: true }) : resolve(value)),
      error => (canceled ? reject({ isCanceled: true }) : reject(error)),
    );
  });

  wrappedPromise.cancel = function() {
    canceled = true;
  };

  return wrappedPromise;
}

// if a promise doesn't resolve/reject within a given duration it will reject
export function timeout(promise, duration, error) {
  return new Promise((resolve, reject) => {
    promise.then(resolve, reject);
    setTimeout(
      () => reject(error || new Error("Operation timed out")),
      duration,
    );
  });
}

// returns a promise that resolves after a given duration
export function delay(duration) {
  return new Promise((resolve, reject) => setTimeout(resolve, duration));
}

export function defer() {
  let deferrred = {};
  deferrred.promise = new Promise((resolve, reject) => {
    deferrred.resolve = resolve;
    deferrred.reject = reject;
  });
  return deferrred;
}
