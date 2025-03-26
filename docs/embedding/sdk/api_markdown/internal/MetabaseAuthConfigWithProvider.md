```ts
type MetabaseAuthConfigWithProvider = BaseMetabaseAuthConfig & {
  apiKey: never;
  authProviderUri: string;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `apiKey?` | `never` |
| `authProviderUri` | `string` |
