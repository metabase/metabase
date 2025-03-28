```ts
type ClickBehaviorParameterMapping = Record<
  ParameterId | StringifiedDimension,
  {
    id: ParameterId | StringifiedDimension;
    source: ClickBehaviorSource;
    target: ClickBehaviorTarget;
  }
>;
```
