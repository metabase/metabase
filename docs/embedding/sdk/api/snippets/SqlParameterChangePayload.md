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

| Property                                                                     | Type                                                                                     |
| :--------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| <a id="sqlparameterchangepayload-defaultparameters"></a> `defaultParameters` | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)                   |
| <a id="sqlparameterchangepayload-parameters"></a> `parameters`               | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)                   |
| <a id="sqlparameterchangepayload-source"></a> `source`                       | [`SqlParameterChangeSource`](/docs/latest/embedding/sdk/api/SqlParameterChangeSource.md) |

<!-- [<endsnippet properties>] -->
