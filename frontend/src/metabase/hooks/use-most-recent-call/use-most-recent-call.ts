import { useRef, useCallback } from "react";

import { AsyncFn } from "metabase-types/types";

export function useMostRecentCall(asyncFn: AsyncFn): AsyncFn {
  const promiseRef = useRef<Promise<any>>();

  return useCallback(
    async (...args: any[]) => {
      const promise = asyncFn(...args);
      promiseRef.current = promise;

      return new Promise((resolve, reject) => {
        return promise
          .then((res: any) => {
            if (promiseRef.current === promise) {
              resolve(res);
            }
          })
          .catch((err: Error) => {
            if (promiseRef.current === promise) {
              reject(err);
            }
          });
      });
    },
    [asyncFn],
  );
}
