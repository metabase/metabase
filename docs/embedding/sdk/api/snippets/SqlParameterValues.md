```ts
type SqlParameterValues = Record<
  string,
  | string
  | number
  | boolean
  | (string | number | boolean | null)[]
  | null
  | undefined
>;
```
