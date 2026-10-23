```ts
type SqlParameterChangePayload = {
  defaultParameters: ParameterValues;
  parameters: ParameterValues;
  source: SqlParameterChangeSource;
};
```

Payload passed to `onSqlParametersChange` callback

## Properties

<!-- [<snippet properties>] -->

| Property                                           | Type                                                                |
| :------------------------------------------------- | :------------------------------------------------------------------ |
| <a id="defaultparameters"></a> `defaultParameters` | [`ParameterValues`](./sdk/api/ParameterValues.md)                   |
| <a id="parameters"></a> `parameters`               | [`ParameterValues`](./sdk/api/ParameterValues.md)                   |
| <a id="source"></a> `source`                       | [`SqlParameterChangeSource`](./sdk/api/SqlParameterChangeSource.md) |

<!-- [<endsnippet properties>] -->
