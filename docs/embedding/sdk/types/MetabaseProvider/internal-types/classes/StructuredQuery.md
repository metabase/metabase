A wrapper around an MBQL (`query` type

## Extends

- [`default`](default.md)

## Constructors

### new StructuredQuery()

```ts
new StructuredQuery(question: Question, datasetQuery: DatasetQuery): StructuredQuery
```

Creates a new StructuredQuery based on the provided DatasetQuery object

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `question` | [`Question`](Question.md) | `undefined` |
| `datasetQuery` | [`DatasetQuery`](../type-aliases/DatasetQuery.md) | `STRUCTURED_QUERY_TEMPLATE` |

#### Returns

[`StructuredQuery`](StructuredQuery.md)

#### Overrides

```ts
AtomicQuery.constructor
```

## Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="_datasetquery"></a> `_datasetQuery` | [`DatasetQuery`](../type-aliases/DatasetQuery.md) | - | [`default`](default.md).[`_datasetQuery`](default.md#_datasetquery) |
| <a id="_metadata"></a> `_metadata` | [`Metadata`](Metadata.md) | - | [`default`](default.md).[`_metadata`](default.md#_metadata) |
| <a id="_originalquestion"></a> `_originalQuestion` | [`Question`](Question.md) | Note that Question is not always in sync with _datasetQuery, calling question() will always merge the latest _datasetQuery to the question object | [`default`](default.md).[`_originalQuestion`](default.md#_originalquestion) |
| <a id="_structureddatasetquery"></a> `_structuredDatasetQuery` | [`StructuredDatasetQuery`](../interfaces/StructuredDatasetQuery.md) | - | - |
| <a id="question-1"></a> `question` | () => [`Question`](Question.md) | Returns a question updated with the current dataset query. Can only be applied to query that is a direct child of the question. | [`default`](default.md).[`question`](default.md#question) |
| <a id="table"></a> `table` | () => `null` \| [`Table`](Table.md) | - | - |

## Methods

### ~~\_database()~~

```ts
_database(): undefined | null | Database
```

#### Returns

`undefined` \| `null` \| [`Database`](Database.md)

#### Deprecated

Use MLv2

#### Inherited from

[`default`](default.md).[`_database`](default.md#_database)

***

### ~~\_databaseId()~~

```ts
_databaseId(): undefined | null | number
```

#### Returns

`undefined` \| `null` \| `number`

#### Deprecated

Use MLv2

#### Inherited from

[`default`](default.md).[`_databaseId`](default.md#_databaseid)

***

### canRun()

```ts
canRun(): boolean
```

Query is valid (as far as we know) and can be executed

#### Returns

`boolean`

#### Inherited from

[`default`](default.md).[`canRun`](default.md#canrun)

***

### datasetQuery()

```ts
datasetQuery(): DatasetQuery
```

Returns the dataset_query object underlying this Query

#### Returns

[`DatasetQuery`](../type-aliases/DatasetQuery.md)

#### Inherited from

[`default`](default.md).[`datasetQuery`](default.md#datasetquery)

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

#### Inherited from

[`default`](default.md).[`dimensionOptions`](default.md#dimensionoptions)

***

### isEmpty()

```ts
isEmpty(): boolean
```

Query is considered empty, i.e. it is in a plain state with no properties / query clauses set

#### Returns

`boolean`

#### Inherited from

[`default`](default.md).[`isEmpty`](default.md#isempty)

***

### legacyQuery()

```ts
legacyQuery(): StructuredQueryObject
```

#### Returns

`StructuredQueryObject`

the underlying MBQL query object

***

### metadata()

```ts
metadata(): Metadata
```

Convenience method for accessing the global metadata

#### Returns

[`Metadata`](Metadata.md)

#### Inherited from

[`default`](default.md).[`metadata`](default.md#metadata-1)

***

### tables()

```ts
tables(): undefined | null | Table[]
```

Tables this query could use, if the database is set

#### Returns

`undefined` \| `null` \| [`Table`](Table.md)[]

#### Inherited from

[`default`](default.md).[`tables`](default.md#tables)

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

#### Inherited from

[`default`](default.md).[`variables`](default.md#variables)
