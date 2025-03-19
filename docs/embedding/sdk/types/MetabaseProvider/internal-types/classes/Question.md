This is a wrapper around a question/card object, which may contain one or more Query objects

## Constructors

### new Question()

```ts
new Question(
   card: any, 
   metadata?: Metadata, 
   parameterValues?: ParameterValuesMap): Question
```

Question constructor

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | `any` |
| `metadata`? | [`Metadata`](Metadata.md) |
| `parameterValues`? | [`ParameterValuesMap`](../type-aliases/ParameterValuesMap.md) |

#### Returns

[`Question`](Question.md)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="_card"></a> `_card` | [`Card`](../interfaces/Card.md) | The plain object presentation of this question, equal to the format that Metabase REST API understands. It is called `card` for both historical reasons and to make a clear distinction to this class. |
| <a id="_legacyquery"></a> `_legacyQuery` | () => [`default`](default.md) | A question contains either a: - StructuredQuery for queries written in MBQL - NativeQuery for queries written in data source's native query language This is just a wrapper object, the data is stored in `this._card.dataset_query` in a format specific to the query type. |
| <a id="_metadata"></a> `_metadata` | [`Metadata`](Metadata.md) | The Question wrapper requires a metadata object because the queries it contains (like [StructuredQuery](StructuredQuery.md)) need metadata for accessing databases, tables and metrics. |
| <a id="_parametervalues"></a> `_parameterValues` | [`ParameterValuesMap`](../type-aliases/ParameterValuesMap.md) | Parameter values mean either the current values of dashboard filters or SQL editor template parameters. They are in the grey area between UI state and question state, but having them in Question wrapper is convenient. |

## Methods

### alertType()

```ts
alertType(visualizationSettings: any): 
  | null
  | "alert-type-rows"
  | "alert-type-timeseries-goal"
  | "alert-type-progress-bar-goal"
```

Returns the type of alert that current question supports

The `visualization_settings` in card object doesn't contain default settings,
so you can provide the complete visualization settings object to `alertType`
for taking those into account

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `visualizationSettings` | `any` |

#### Returns

  \| `null`
  \| `"alert-type-rows"`
  \| `"alert-type-timeseries-goal"`
  \| `"alert-type-progress-bar-goal"`

***

### applyTemplateTagParameters()

```ts
applyTemplateTagParameters(): Question
```

Applies the template tag parameters from the card to the question.

#### Returns

[`Question`](Question.md)

***

### canRun()

```ts
canRun(): boolean
```

Question is valid (as far as we know) and can be executed

#### Returns

`boolean`

***

### composeQuestion()

```ts
composeQuestion(): Question
```

Visualization drill-through and action widget actions

Although most of these are essentially a way to modify the current query, having them as a part
of Question interface instead of Query interface makes it more convenient to also change the current visualization

#### Returns

[`Question`](Question.md)

***

### display()

```ts
display(): 
  | "object"
  | "area"
  | "map"
  | "progress"
  | "table"
  | "line"
  | "row"
  | "pivot"
  | "bar"
  | "funnel"
  | "gauge"
  | "pie"
  | "sankey"
  | "smartscalar"
  | "waterfall"
  | "scalar"
  | "combo"
  | "scatter"
```

The visualization type of the question

#### Returns

  \| `"object"`
  \| `"area"`
  \| `"map"`
  \| `"progress"`
  \| `"table"`
  \| `"line"`
  \| `"row"`
  \| `"pivot"`
  \| `"bar"`
  \| `"funnel"`
  \| `"gauge"`
  \| `"pie"`
  \| `"sankey"`
  \| `"smartscalar"`
  \| `"waterfall"`
  \| `"scalar"`
  \| `"combo"`
  \| `"scatter"`

***

### displayName()

```ts
displayName(): undefined | null | string
```

A user-defined name for the question

#### Returns

`undefined` \| `null` \| `string`

***

### getParameterUsageCount()

```ts
getParameterUsageCount(): number
```

How many filters or other widgets are this question's values used for?

#### Returns

`number`

***

### isEqual()

```ts
isEqual(other: any, __namedParameters: {
  compareResultsMetadata: boolean;
 }): boolean
```

Returns true if the questions are equivalent (including id, card, and parameters)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | `any` |
| `__namedParameters` | \{ `compareResultsMetadata`: `boolean`; \} |
| `__namedParameters.compareResultsMetadata`? | `boolean` |

#### Returns

`boolean`

***

### setLegacyQuery()

```ts
setLegacyQuery(newQuery: Query): Question
```

Returns a new Question object with an updated query.
The query is saved to the `dataset_query` field of the Card object.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `newQuery` | [`Query`](Query.md) |

#### Returns

[`Question`](Question.md)

***

### create()

```ts
static create(__namedParameters: QuestionCreatorOpts): Question
```

TODO Atte Keinänen 6/13/17: Discussed with Tom that we could use the default Question constructor instead,
but it would require changing the constructor signature so that `card` is an optional parameter and has a default value

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | [`QuestionCreatorOpts`](../type-aliases/QuestionCreatorOpts.md) |

#### Returns

[`Question`](Question.md)
