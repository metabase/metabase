```ts
function useMetabot(): UseMetabotResult | null;
```

Returns the Metabot conversation API.

Returns `null` until the SDK bundle has loaded and `<MetabaseProvider>`
has mounted its internal subscriber. Guard before use:

## Returns

<!-- [<snippet returns>] -->

[`UseMetabotResult`](./api/UseMetabotResult.md) \| `null`

<!-- [<endsnippet returns>] -->

## Example

<!-- [<snippet example>] -->

```ts
const metabot = useMetabot();
if (!metabot) {
  return <Spinner />;
}
metabot.submitMessage("Show me orders");

@function
```

<!-- [<endsnippet example>] -->
