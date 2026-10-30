```ts
type ParameterChangePayload = {
  defaultParameters: ParameterValues;
  lastUsedParameters: ParameterValues;
  parameters: ParameterValues;
  source: ParameterChangeSource;
};
```

Payload passed to `onParametersChange` callback

## Properties

<!-- [<snippet properties>] -->

| Property                                             | Type                                                                               |
| :--------------------------------------------------- | :--------------------------------------------------------------------------------- |
| <a id="defaultparameters"></a> `defaultParameters`   | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)             |
| <a id="lastusedparameters"></a> `lastUsedParameters` | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)             |
| <a id="parameters"></a> `parameters`                 | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)             |
| <a id="source"></a> `source`                         | [`ParameterChangeSource`](/docs/latest/embedding/sdk/api/ParameterChangeSource.md) |

<!-- [<endsnippet properties>] -->
