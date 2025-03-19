```ts
type StaticQuestionProps = {
  height: string | number;
  initialSqlParameters: Record<string, string | number>;
  questionId:   | CardId
     | string;
  withChartTypeSelector: boolean;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="height"></a> `height`? | `string` \| `number` |
| <a id="initialsqlparameters"></a> `initialSqlParameters`? | `Record`\<`string`, `string` \| `number`\> |
| <a id="questionid"></a> `questionId` | \| [`CardId`](../../../MetabaseProvider/internal-types/type-aliases/CardId.md) \| `string` |
| <a id="withcharttypeselector"></a> `withChartTypeSelector`? | `boolean` |
