```ts
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
```

Makes every property in the object optional.

#### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |
