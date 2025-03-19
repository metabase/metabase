```ts
type TimeIntervalFilter = 
  | ["time-interval", ConcreteFieldReference, RelativeDatetimePeriod, DateTimeAbsoluteUnit]
  | ["time-interval", ConcreteFieldReference, RelativeDatetimePeriod, DateTimeAbsoluteUnit, TimeIntervalFilterOptions];
```
