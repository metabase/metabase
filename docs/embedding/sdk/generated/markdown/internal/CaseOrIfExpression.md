```ts
type CaseOrIfExpression =
  | [CaseOrIfOperator, [Expression, Expression][]]
  | [CaseOrIfOperator, [Expression, Expression][], CaseOptions];
```
