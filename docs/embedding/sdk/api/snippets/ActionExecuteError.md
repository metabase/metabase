```ts
type ActionExecuteError = {
  data: {
    errors?: Record<string, string>;
    message?: string;
  };
  isCancelled: boolean;
  status?: number;
};
```

Shape of the thrown error captured into the hook's `error` state on a
non-2xx response. The hook types `error` as `ActionExecuteError | null`,
so consumers read its fields directly — no cast needed:

    const message = error?.data?.message;

`error.data.message` is the actionable diagnostic for end users.
`error.data.errors` is a per-field map (`{ <slug>: <message> }`) when the
backend reports parameter-level validation failures; it is `{}` for
whole-request failures (e.g. a foreign-key constraint:
`{ message: "Other rows refer to this row…", errors: {} }`).
`status` is absent for transport-layer failures (offline, aborted) where
no HTTP response was received.

## Properties

<!-- [<snippet properties>] -->

| Property                               | Type                                                                                                                                                      |
| :------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="data"></a> `data`               | \{ `errors?`: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `string`\>; `message?`: `string`; \} |
| `data.errors?`                         | [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `string`\>                                         |
| `data.message?`                        | `string`                                                                                                                                                  |
| <a id="iscancelled"></a> `isCancelled` | `boolean`                                                                                                                                                 |
| <a id="status"></a> `status?`          | `number`                                                                                                                                                  |

<!-- [<endsnippet properties>] -->
