An abstract class for all query types (StructuredQuery & NativeQuery)

## Extended by

- [`default`](default.md)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="_datasetquery"></a> `_datasetQuery` | [`DatasetQuery`](../type-aliases/DatasetQuery.md) | - |
| <a id="_metadata"></a> `_metadata` | [`Metadata`](Metadata.md) | - |
| <a id="_originalquestion"></a> `_originalQuestion` | [`Question`](Question.md) | Note that Question is not always in sync with _datasetQuery, calling question() will always merge the latest _datasetQuery to the question object |
| <a id="question"></a> `question` | () => [`Question`](Question.md) | Returns a question updated with the current dataset query. Can only be applied to query that is a direct child of the question. |

## Methods

### canRun()

```ts
canRun(): boolean
```

Query is valid (as far as we know) and can be executed

#### Returns

`boolean`

***

### datasetQuery()

```ts
datasetQuery(): DatasetQuery
```

Returns the dataset_query object underlying this Query

#### Returns

[`DatasetQuery`](../type-aliases/DatasetQuery.md)

***

### dimensionOptions()

```ts
dimensionOptions(_filter?: (dimension: default) => boolean): DimensionOptions
```

Dimensions exposed by this query
NOTE: Ideally we'd also have `dimensions()` that returns a flat list, but currently StructuredQuery has it's own `dimensions()` for another purpose.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`dimension`: [`default`](default.md)) => `boolean` |

#### Returns

`DimensionOptions`

***

### isEmpty()

```ts
isEmpty(): boolean
```

Query is considered empty, i.e. it is in a plain state with no properties / query clauses set

#### Returns

`boolean`

***

### metadata()

```ts
metadata(): Metadata
```

Convenience method for accessing the global metadata

#### Returns

[`Metadata`](Metadata.md)

***

### variables()

```ts
variables(_filter?: (variable: Variable) => boolean): TemplateTagVariable[]
```

Variables exposed by this query

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`variable`: `Variable`) => `boolean` |

#### Returns

`TemplateTagVariable`[]
