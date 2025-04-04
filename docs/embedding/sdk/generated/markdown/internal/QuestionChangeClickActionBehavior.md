```ts
type QuestionChangeClickActionBehavior = "changeCardAndRun" | "updateQuestion";
```

What should happen when a "question change" click action is performed?

- `changeCardAndRun`: the card is changed and the query is run. this is the default behavior.
- `updateQuestion`: the question is updated (without running the query)
