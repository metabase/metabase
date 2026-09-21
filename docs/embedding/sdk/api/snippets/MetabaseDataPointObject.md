```ts
type MetabaseDataPointObject = {
  column?: {
    display_name?: string;
    name?: string;
  };
  data?: Record<string, string | number | null | boolean | object>;
  event?: MouseEvent;
  question?: MetabaseQuestion;
  raw?: {
    column?: Record<string, any>;
    data?: {
      col: Record<string, any> | null;
      value: string | number | null | boolean;
    }[];
    event?: MouseEvent;
    value?: string | number | null | boolean;
  };
  value?: string | number | null | boolean | object;
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                          | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| :-------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="column"></a> `column?`     | \{ `display_name?`: `string`; `name?`: `string`; \}                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `column.display_name?`            | `string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `column.name?`                    | `string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| <a id="data"></a> `data?`         | [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `string` \| `number` \| `null` \| `boolean` \| `object`\>                                                                                                                                                                                                                                                                                                                     |
| <a id="event"></a> `event?`       | [`MouseEvent`](https://developer.mozilla.org/docs/Web/API/MouseEvent)                                                                                                                                                                                                                                                                                                                                                                                                                |
| <a id="question"></a> `question?` | [`MetabaseQuestion`](./api/MetabaseQuestion.md)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| <a id="raw"></a> `raw?`           | \{ `column?`: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `any`\>; `data?`: \{ `col`: \| [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `any`\> \| `null`; `value`: `string` \| `number` \| `null` \| `boolean`; \}[]; `event?`: [`MouseEvent`](https://developer.mozilla.org/docs/Web/API/MouseEvent); `value?`: `string` \| `number` \| `null` \| `boolean`; \} |
| `raw.column?`                     | [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `any`\>                                                                                                                                                                                                                                                                                                                                                                       |
| `raw.data?`                       | \{ `col`: \| [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `any`\> \| `null`; `value`: `string` \| `number` \| `null` \| `boolean`; \}[]                                                                                                                                                                                                                                                                                    |
| `raw.event?`                      | [`MouseEvent`](https://developer.mozilla.org/docs/Web/API/MouseEvent)                                                                                                                                                                                                                                                                                                                                                                                                                |
| `raw.value?`                      | `string` \| `number` \| `null` \| `boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| <a id="value"></a> `value?`       | `string` \| `number` \| `null` \| `boolean` \| `object`                                                                                                                                                                                                                                                                                                                                                                                                                              |

<!-- [<endsnippet properties>] -->
