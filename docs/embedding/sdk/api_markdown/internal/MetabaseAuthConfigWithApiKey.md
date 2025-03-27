```ts
type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
  authProviderUri: never;
};
```

#### Type declaration

| Name               | Type     |
| ------------------ | -------- |
| `apiKey`           | `string` |
| `authProviderUri?` | `never`  |
