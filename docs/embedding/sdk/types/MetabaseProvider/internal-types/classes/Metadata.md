## Deprecated

The class shouldn't be used for anything but to create a MetadataProvider instance from MBQL lib.

  For finding a database/table/field/card by id, use the corresponding RTK query endpoints.
  Do not rely on data being implicitly loaded in some other place.

## Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="databases"></a> ~~`databases`~~ | `Record`\<`string`, [`Database`](Database.md)\> | `{}` |
| <a id="fields"></a> ~~`fields`~~ | `Record`\<`string`, [`default`](default.md)\> | `{}` |
| <a id="questions"></a> ~~`questions`~~ | `Record`\<`string`, [`Question`](Question.md)\> | `{}` |
| <a id="schemas"></a> ~~`schemas`~~ | `Record`\<`string`, [`Schema`](Schema.md)\> | `{}` |
| <a id="segments"></a> ~~`segments`~~ | `Record`\<`string`, [`Segment`](Segment.md)\> | `{}` |
| <a id="settings"></a> ~~`settings?`~~ | [`Settings`](../type-aliases/Settings.md) | `undefined` |
| <a id="tables"></a> ~~`tables`~~ | `Record`\<`string`, [`Table`](Table.md)\> | `{}` |

## Methods

### ~~database()~~

```ts
database(databaseId: undefined | null | number): null | Database
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `databaseId` | `undefined` \| `null` \| `number` |

#### Returns

`null` \| [`Database`](Database.md)

#### Deprecated

load data via RTK Query - useGetDatabaseQuery

***

### ~~databasesList()~~

```ts
databasesList(__namedParameters: {
  savedQuestions: boolean;
 }): Database[]
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | \{ `savedQuestions`: `boolean`; \} |
| `__namedParameters.savedQuestions`? | `boolean` |

#### Returns

[`Database`](Database.md)[]

#### Deprecated

load data via RTK Query - useListDatabasesQuery

***

### ~~field()~~

```ts
field(fieldId: 
  | undefined
  | null
  | string
  | number
  | FieldReference, tableId?: null | TableId): null | default
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fieldId` | \| `undefined` \| `null` \| `string` \| `number` \| [`FieldReference`](../type-aliases/FieldReference.md) |
| `tableId`? | `null` \| [`TableId`](../type-aliases/TableId.md) |

#### Returns

`null` \| [`default`](default.md)

#### Deprecated

load data via RTK Query - useGetFieldQuery

***

### ~~fieldsList()~~

```ts
fieldsList(): default[]
```

#### Returns

[`default`](default.md)[]

#### Deprecated

load data via RTK Query - useListFieldsQuery

***

### ~~question()~~

```ts
question(cardId: undefined | null | number): null | Question
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cardId` | `undefined` \| `null` \| `number` |

#### Returns

`null` \| [`Question`](Question.md)

#### Deprecated

load data via RTK Query - useGetCardQuery

***

### ~~savedQuestionsDatabase()~~

```ts
savedQuestionsDatabase(): Database
```

#### Returns

[`Database`](Database.md)

#### Deprecated

load data via RTK Query - useListDatabasesQuery({ saved: true })

***

### ~~schema()~~

```ts
schema(schemaId: undefined | null | string): null | Schema
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `schemaId` | `undefined` \| `null` \| `string` |

#### Returns

`null` \| [`Schema`](Schema.md)

#### Deprecated

load data via RTK Query - useListSchemasQuery or useListDatabaseSchemaTablesQuery

***

### ~~segment()~~

```ts
segment(segmentId: undefined | null | number): null | Segment
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segmentId` | `undefined` \| `null` \| `number` |

#### Returns

`null` \| [`Segment`](Segment.md)

#### Deprecated

load data via RTK Query - useGetSegmentQuery

***

### ~~segmentsList()~~

```ts
segmentsList(): Segment[]
```

#### Returns

[`Segment`](Segment.md)[]

#### Deprecated

load data via RTK Query - useListSegmentsQuery

***

### ~~table()~~

```ts
table(tableId: undefined | null | TableId): null | Table
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tableId` | `undefined` \| `null` \| [`TableId`](../type-aliases/TableId.md) |

#### Returns

`null` \| [`Table`](Table.md)

#### Deprecated

load data via RTK Query - useGetTableQuery or useGetTableQueryMetadataQuery

***

### ~~tablesList()~~

```ts
tablesList(): Table[]
```

#### Returns

[`Table`](Table.md)[]

#### Deprecated

load data via RTK Query - useListDatabaseSchemaTablesQuery
