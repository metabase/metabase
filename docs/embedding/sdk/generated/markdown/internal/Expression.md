```ts
type Expression =
  | NumericLiteral
  | StringLiteral
  | BooleanLiteral
  | OffsetExpression
  | CaseOrIfExpression
  | CallExpression
  | ConcreteFieldReference
  | Filter;
```
