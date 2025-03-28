```ts
type JsonQuery = DatasetQuery & {
  cache-strategy: CacheStrategy & {
     avg-execution-ms: number;
     invalidated-at: string;
    };
  parameters: unknown[];
};
```

#### Type declaration

| Name              | Type                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `cache-strategy?` | [`CacheStrategy`](./generated/html/CacheStrategy.md) & { `avg-execution-ms`: `number`; `invalidated-at`: `string`; } |
| `parameters?`     | `unknown`\[]                                                                                                         |
