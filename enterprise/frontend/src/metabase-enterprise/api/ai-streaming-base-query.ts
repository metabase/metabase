import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
  FetchBaseQueryMeta,
  QueryReturnValue,
} from "@reduxjs/toolkit/query";

class Defer<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void = () => {};
  reject: (reason?: any) => void = () => {};

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export function aiStreamingBaseQuery<RequestBody extends BodyInit>(
  url: string,
): BaseQueryFn<
  { config: RequestInit; body: RequestBody },
  unknown,
  FetchBaseQueryError,
  | {
      onChunkReceived?:
        | ((chunk: unknown) => void)
        | ((chunk: unknown) => Promise<void>);
    }
  | undefined,
  FetchBaseQueryMeta
> {
  return async (arg, api, extraOptions) => {
    const deferred = new Defer<
      QueryReturnValue<unknown, FetchBaseQueryError, FetchBaseQueryMeta>
    >();

    const chunks: unknown[] = [];
    await fetch(url, { ...arg.config, body: arg.body }).then(
      async (response) => {
        if (!response || !response.body) {
          deferred.reject({ status: "FETCH_ERROR", error: "No response" });
          return;
        }

        const reader = response.body.getReader();

        return await reader.read().then(async function pump({
          done,
          value,
        }): Promise<any> {
          if (value) {
            const stringValue = new TextDecoder().decode(value);

            console.log(stringValue);
            const parsedValue = JSON.parse(stringValue);

            chunks.push(parsedValue);

            if (extraOptions?.onChunkReceived) {
              await extraOptions.onChunkReceived(parsedValue);
            }
          }

          if (done) {
            deferred.resolve({ data: chunks });
            return;
          }

          return await reader.read().then(pump);
        });
      },
    );

    return deferred.promise;
  };
}
