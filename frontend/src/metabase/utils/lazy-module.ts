import { useEffect, useState } from "react";

/**
 * A module that is loaded on first use instead of being part of the main bundle.
 * `get` returns it synchronously once it has loaded.
 */
export type LazyModule<T> = {
  load: () => Promise<T>;
  get: () => T | undefined;
};

export function createLazyModule<T>(loader: () => Promise<T>): LazyModule<T> {
  let module: T | undefined;
  let promise: Promise<T> | undefined;

  return {
    load: () => {
      promise ??= loader().then(
        (loaded) => {
          module = loaded;
          return loaded;
        },
        (error) => {
          // Let the next caller retry, e.g. after a failed chunk request.
          promise = undefined;
          throw error;
        },
      );
      return promise;
    },
    get: () => module,
  };
}

/**
 * Starts loading the module on mount and returns it once loaded. Returns
 * `undefined` until then, so callers need a fallback for that first render.
 */
export function useLazyModule<T>(lazyModule: LazyModule<T>): T | undefined {
  const [module, setModule] = useState(() => lazyModule.get());

  useEffect(() => {
    if (module !== undefined) {
      return;
    }
    let isCancelled = false;
    lazyModule.load().then(
      (loaded) => {
        if (!isCancelled) {
          setModule(() => loaded);
        }
      },
      () => undefined,
    );
    return () => {
      isCancelled = true;
    };
  }, [lazyModule, module]);

  return module;
}
