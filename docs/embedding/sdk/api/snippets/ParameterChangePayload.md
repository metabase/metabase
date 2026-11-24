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

| Property                                                                    | Type                                                                               |
| :-------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| <a id="parameterchangepayload-defaultparameters"></a> `defaultParameters`   | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)             |
| <a id="parameterchangepayload-lastusedparameters"></a> `lastUsedParameters` | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)             |
| <a id="parameterchangepayload-parameters"></a> `parameters`                 | [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md)             |
| <a id="parameterchangepayload-source"></a> `source`                         | [`ParameterChangeSource`](/docs/latest/embedding/sdk/api/ParameterChangeSource.md) |

<!-- [<endsnippet properties>] -->
