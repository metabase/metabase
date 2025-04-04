```ts
type BaseMetabaseAuthConfig = {
  fetchRequestToken: MetabaseFetchRequestTokenFn;
  metabaseInstanceUrl: string;
};
```

## Properties

### fetchRequestToken?

```ts
optional fetchRequestToken: MetabaseFetchRequestTokenFn;
```

Specifies a function to fetch the refresh token.
The refresh token should be in the format of { id: string, exp: number }

---

### metabaseInstanceUrl

```ts
metabaseInstanceUrl: string;
```
