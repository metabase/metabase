```ts
type MetabotChartProps =
  | (Omit<StaticQuestionProps, "questionId" | "token" | "query" | "card"> & {
      drills?: false;
    })
  | (Omit<
      InteractiveQuestionProps,
      "questionId" | "token" | "query" | "card"
    > & {
      drills: true;
    });
```
