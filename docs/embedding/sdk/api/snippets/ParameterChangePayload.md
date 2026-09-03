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

| Property                                             | Type                                                      |
| :--------------------------------------------------- | :-------------------------------------------------------- |
| <a id="defaultparameters"></a> `defaultParameters`   | [`ParameterValues`](./api/ParameterValues.md)             |
| <a id="lastusedparameters"></a> `lastUsedParameters` | [`ParameterValues`](./api/ParameterValues.md)             |
| <a id="parameters"></a> `parameters`                 | [`ParameterValues`](./api/ParameterValues.md)             |
| <a id="source"></a> `source`                         | [`ParameterChangeSource`](./api/ParameterChangeSource.md) |

<!-- [<endsnippet properties>] -->
