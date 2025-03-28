```ts
type StaticQuestionProps = {
  withChartTypeSelector: boolean;
} & Pick<
  InteractiveQuestionProviderProps,
  "questionId" | "initialSqlParameters"
> &
  FlexibleSizeProps;
```

#### Type declaration

| Name                     | Type      |
| ------------------------ | --------- |
| `withChartTypeSelector?` | `boolean` |
