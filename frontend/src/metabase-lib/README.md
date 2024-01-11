## Wrapper Objects:

- `setFoo(bar)`: returns clone of the wrapper but with the "foo" attribute to set to `bar`
- `replace(object)`: returns clone of parent wrapper with this object replaced by `object`
- `remove()`: returns clone of the parent wrapper with this object removed

Examples:

- `question().legacyQuery({ useStructuredQuery: true }) .aggregation()[0].setDimension(dimension)`

Exceptions:

- StructuredQuery::updateAggregation, updateBreakout, updateFilter, etc should be called setAggregation, etc

## Wrapper Hierarchy:

- Question
  - StructuredQuery
    - Aggregation
    - Breakout
    - Filter
  - NativeQuery
