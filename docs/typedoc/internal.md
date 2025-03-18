## BLOCKED

```ts
BLOCKED: "blocked";
```

## FULL

```ts
FULL: "full";
```

## IMPERSONATED

```ts
IMPERSONATED: "impersonated";
```

## LEGACY\_NO\_SELF\_SERVICE

```ts
LEGACY_NO_SELF_SERVICE: "legacy-no-self-service";
```

## LIMITED

```ts
LIMITED: "limited";
```

## NO

```ts
NO: "no";
```

## NONE

```ts
NONE: "none";
```

## QUERY\_BUILDER

```ts
QUERY_BUILDER: "query-builder";
```

## QUERY\_BUILDER\_AND\_NATIVE

```ts
QUERY_BUILDER_AND_NATIVE: "query-builder-and-native";
```

## SANDBOXED

```ts
SANDBOXED: "sandboxed";
```

## UNRESTRICTED

```ts
UNRESTRICTED: "unrestricted";
```

## YES

```ts
YES: "yes";
```

***

## AtomicQuery

A query type for queries that are attached to a specific database table
and form a single MBQL / native query clause

### Extends

- [`Query`](internal.md#query-1)

### Extended by

- [`StructuredQuery`](internal.md#structuredquery)

### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="_datasetquery"></a> `_datasetQuery` | [`DatasetQuery`](internal.md#datasetquery-3) | - | [`Query`](internal.md#query-1).[`_datasetQuery`](internal.md#_datasetquery-1) |
| <a id="_metadata"></a> `_metadata` | [`Metadata`](internal.md#metadata-4) | - | [`Query`](internal.md#query-1).[`_metadata`](internal.md#_metadata-3) |
| <a id="_originalquestion"></a> `_originalQuestion` | [`Question`](internal.md#question-3) | Note that Question is not always in sync with _datasetQuery, calling question() will always merge the latest _datasetQuery to the question object | [`Query`](internal.md#query-1).[`_originalQuestion`](internal.md#_originalquestion-1) |
| <a id="question"></a> `question` | () => [`Question`](internal.md#question-3) | Returns a question updated with the current dataset query. Can only be applied to query that is a direct child of the question. | [`Query`](internal.md#query-1).[`question`](internal.md#question-2) |

### Methods

#### ~~\_database()~~

```ts
_database(): undefined | null | Database
```

##### Returns

`undefined` \| `null` \| [`Database`](internal.md#database)

##### Deprecated

Use MLv2

#### ~~\_databaseId()~~

```ts
_databaseId(): undefined | null | number
```

##### Returns

`undefined` \| `null` \| `number`

##### Deprecated

Use MLv2

#### canRun()

```ts
canRun(): boolean
```

Query is valid (as far as we know) and can be executed

##### Returns

`boolean`

##### Inherited from

[`Query`](internal.md#query-1).[`canRun`](internal.md#canrun-1)

#### datasetQuery()

```ts
datasetQuery(): DatasetQuery
```

Returns the dataset_query object underlying this Query

##### Returns

[`DatasetQuery`](internal.md#datasetquery-3)

##### Inherited from

[`Query`](internal.md#query-1).[`datasetQuery`](internal.md#datasetquery-1)

#### dimensionOptions()

```ts
dimensionOptions(_filter?: (dimension: Dimension) => boolean): DimensionOptions
```

Dimensions exposed by this query
NOTE: Ideally we'd also have `dimensions()` that returns a flat list, but currently StructuredQuery has it's own `dimensions()` for another purpose.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`dimension`: [`Dimension`](internal.md#dimension)) => `boolean` |

##### Returns

`DimensionOptions`

##### Inherited from

[`Query`](internal.md#query-1).[`dimensionOptions`](internal.md#dimensionoptions-1)

#### isEmpty()

```ts
isEmpty(): boolean
```

Query is considered empty, i.e. it is in a plain state with no properties / query clauses set

##### Returns

`boolean`

##### Inherited from

[`Query`](internal.md#query-1).[`isEmpty`](internal.md#isempty-1)

#### metadata()

```ts
metadata(): Metadata
```

Convenience method for accessing the global metadata

##### Returns

[`Metadata`](internal.md#metadata-4)

##### Inherited from

[`Query`](internal.md#query-1).[`metadata`](internal.md#metadata-5)

#### tables()

```ts
tables(): undefined | null | Table[]
```

Tables this query could use, if the database is set

##### Returns

`undefined` \| `null` \| [`Table`](internal.md#table-4)[]

#### variables()

```ts
variables(_filter?: (variable: Variable) => boolean): TemplateTagVariable[]
```

Variables exposed by this query

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`variable`: `Variable`) => `boolean` |

##### Returns

`TemplateTagVariable`[]

##### Inherited from

[`Query`](internal.md#query-1).[`variables`](internal.md#variables-1)

***

## ~~Database~~

### Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

### Extends

- `Omit`\<[`NormalizedDatabase`](internal.md#normalizeddatabase), `"tables"` \| `"schemas"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="auto_run_queries"></a> ~~`auto_run_queries`~~ | `null` \| `boolean` | `Omit.auto_run_queries` |
| <a id="cache_ttl"></a> ~~`cache_ttl`~~ | `null` \| `number` | `Omit.cache_ttl` |
| <a id="can_upload"></a> ~~`can_upload`~~ | `boolean` | `Omit.can_upload` |
| <a id="can-manage"></a> ~~`can-manage?`~~ | `boolean` | `Omit.can-manage` |
| <a id="caveats"></a> ~~`caveats?`~~ | `string` | `Omit.caveats` |
| <a id="created_at"></a> ~~`created_at`~~ | `string` | `Omit.created_at` |
| <a id="creator_id"></a> ~~`creator_id?`~~ | `number` | `Omit.creator_id` |
| <a id="details"></a> ~~`details?`~~ | `Record`\<`string`, `unknown`\> | `Omit.details` |
| <a id="engine"></a> ~~`engine`~~ | `undefined` \| `string` | `Omit.engine` |
| <a id="features"></a> ~~`features?`~~ | [`DatabaseFeature`](internal.md#databasefeature)[] | `Omit.features` |
| <a id="id"></a> ~~`id`~~ | `number` | `Omit.id` |
| <a id="initial_sync_status"></a> ~~`initial_sync_status`~~ | [`LongTaskStatus`](internal.md#longtaskstatus) | `Omit.initial_sync_status` |
| <a id="is_attached_dwh"></a> ~~`is_attached_dwh?`~~ | `boolean` | `Omit.is_attached_dwh` |
| <a id="is_audit"></a> ~~`is_audit?`~~ | `boolean` | `Omit.is_audit` |
| <a id="is_full_sync"></a> ~~`is_full_sync`~~ | `boolean` | `Omit.is_full_sync` |
| <a id="is_on_demand"></a> ~~`is_on_demand`~~ | `boolean` | `Omit.is_on_demand` |
| <a id="is_sample"></a> ~~`is_sample`~~ | `boolean` | `Omit.is_sample` |
| <a id="is_saved_questions"></a> ~~`is_saved_questions`~~ | `boolean` | `Omit.is_saved_questions` |
| <a id="metadata-1"></a> ~~`metadata?`~~ | [`Metadata`](internal.md#metadata-4) | - |
| <a id="name"></a> ~~`name`~~ | `string` | `Omit.name` |
| <a id="native_permissions"></a> ~~`native_permissions`~~ | `"write"` \| `"none"` | `Omit.native_permissions` |
| <a id="points_of_interest"></a> ~~`points_of_interest?`~~ | `string` | `Omit.points_of_interest` |
| <a id="refingerprint"></a> ~~`refingerprint`~~ | `null` \| `boolean` | `Omit.refingerprint` |
| <a id="schedules"></a> ~~`schedules`~~ | [`DatabaseSchedules`](internal.md#databaseschedules) | `Omit.schedules` |
| <a id="schemas"></a> ~~`schemas?`~~ | [`Schema`](internal.md#schema-1)[] | - |
| <a id="settings"></a> ~~`settings?`~~ | `null` \| [`DatabaseSettings`](internal.md#databasesettings) | `Omit.settings` |
| <a id="tables-1"></a> ~~`tables?`~~ | [`Table`](internal.md#table-4)[] | - |
| <a id="timezone"></a> ~~`timezone?`~~ | `string` | `Omit.timezone` |
| <a id="updated_at"></a> ~~`updated_at`~~ | `string` | `Omit.updated_at` |
| <a id="uploads_enabled"></a> ~~`uploads_enabled`~~ | `boolean` | `Omit.uploads_enabled` |
| <a id="uploads_schema_name"></a> ~~`uploads_schema_name`~~ | `null` \| `string` | `Omit.uploads_schema_name` |
| <a id="uploads_table_prefix"></a> ~~`uploads_table_prefix`~~ | `null` \| `string` | `Omit.uploads_table_prefix` |

***

## `abstract` Dimension

Dimension base class, represents an MBQL field reference.

Used for displaying fields (like Created At) and their "sub-dimensions" (like Created At by Day)
in field lists and active value widgets for filters, aggregations and breakouts.

### Extended by

- [`FieldDimension`](internal.md#fielddimension)

### Constructors

#### new Dimension()

```ts
new Dimension(
   parent: undefined | null | Dimension, 
   args: any[], 
   metadata?: any, 
   query?: null | StructuredQuery, 
   options?: any): Dimension
```

Dimension constructor

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `parent` | `undefined` \| `null` \| [`Dimension`](internal.md#dimension) |
| `args` | `any`[] |
| `metadata`? | `any` |
| `query`? | `null` \| [`StructuredQuery`](internal.md#structuredquery) |
| `options`? | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="_args"></a> `_args` | `any` |
| <a id="_metadata-1"></a> `_metadata` | `any` |
| <a id="_options"></a> `_options` | `any` |
| <a id="_parent"></a> `_parent` | `undefined` \| `null` \| [`Dimension`](internal.md#dimension) |
| <a id="_query"></a> `_query` | `any` |
| <a id="_subdisplayname"></a> `_subDisplayName` | `undefined` \| `null` \| `string` |
| <a id="_subtriggerdisplayname"></a> `_subTriggerDisplayName` | `undefined` \| `null` \| `string` |

### Methods

#### \_describeBinning()

```ts
_describeBinning(): string
```

Short string that describes the binning options used. Used for both subTriggerDisplayName() and render()

##### Returns

`string`

#### \_dimensionForOption()

```ts
_dimensionForOption(option: DimensionOption): undefined | null | Dimension
```

Internal method gets a Dimension from a DimensionOption

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `option` | [`DimensionOption`](internal.md#dimensionoption) |

##### Returns

`undefined` \| `null` \| [`Dimension`](internal.md#dimension)

#### \_isBinnable()

```ts
_isBinnable(): boolean
```

Whether this is a numeric Field that can be binned

##### Returns

`boolean`

#### \_withOptions()

```ts
abstract _withOptions(_options: any): Dimension
```

Return a copy of this Dimension that includes the specified `options`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_options` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

#### baseDimension()

```ts
baseDimension(): Dimension
```

Return a copy of this Dimension with any temporal bucketing or binning options removed.

##### Returns

[`Dimension`](internal.md#dimension)

#### columnName()

```ts
columnName(): string
```

The `name` appearing in the column object (except duplicates would normally be suffxied)

##### Returns

`string`

#### defaultBreakout()

```ts
defaultBreakout(): undefined | null | FieldReference
```

Returns MBQL for the default breakout

Tries to look up a default subdimension (like "Created At: Day" for "Created At" field)
and if it isn't found, uses the plain field id dimension (like "Product ID") as a fallback.

##### Returns

`undefined` \| `null` \| [`FieldReference`](internal.md#fieldreference)

#### defaultDimension()

```ts
abstract defaultDimension(DimensionTypes: any[]): undefined | null | Dimension
```

Returns the default sub-dimension of this dimension, if any.

##### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `DimensionTypes` | `any`[] | `DIMENSION_TYPES` |

##### Returns

`undefined` \| `null` \| [`Dimension`](internal.md#dimension)

#### dimensions()

```ts
abstract dimensions(DimensionTypes?: typeof Dimension[]): Dimension[]
```

Returns "sub-dimensions" of this dimension.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `DimensionTypes`? | *typeof* [`Dimension`](internal.md#dimension)[] |

##### Returns

[`Dimension`](internal.md#dimension)[]

#### displayName()

```ts
abstract displayName(..._args: unknown[]): string
```

The display name of this dimension, e.x. the field's display_name

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`_args` | `unknown`[] |

##### Returns

`string`

#### field()

```ts
field(): Field
```

The underlying field for this dimension

##### Returns

[`Field`](internal.md#field-1)

#### getOption()

```ts
getOption(k: string): any
```

Get an option from the field options map, if there is one.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `k` | `string` |

##### Returns

`any`

#### icon()

```ts
abstract icon(): undefined | null | string
```

An icon name representing this dimension's type, to be used in the <Icon> component.

##### Returns

`undefined` \| `null` \| `string`

#### isEqual()

```ts
isEqual(other: 
  | undefined
  | null
  | ConcreteFieldReference
  | Dimension): boolean
```

Is this dimension identical to another dimension or MBQL clause

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | \| `undefined` \| `null` \| [`ConcreteFieldReference`](internal.md#concretefieldreference) \| [`Dimension`](internal.md#dimension) |

##### Returns

`boolean`

#### isSameBaseDimension()

```ts
isSameBaseDimension(other: 
  | undefined
  | null
  | FieldReference
  | Dimension): boolean
```

Does this dimension have the same underlying base dimension, typically a field

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | \| `undefined` \| `null` \| [`FieldReference`](internal.md#fieldreference) \| [`Dimension`](internal.md#dimension) |

##### Returns

`boolean`

#### isTemporalExtraction()

```ts
isTemporalExtraction(): boolean
```

Whether temporal bucketing is being applied, *and* the bucketing is a truncation operation such as "month" or
"quarter";

##### Returns

`boolean`

#### joinAlias()

```ts
joinAlias(): any
```

Return the join alias associated with this field, if any.

##### Returns

`any`

#### render()

```ts
render(): any
```

Renders a dimension to a string for display in query builders

##### Returns

`any`

#### subDisplayName()

```ts
subDisplayName(): string
```

The name to be shown when this dimension is being displayed as a sub-dimension of another.

Example: a temporal bucketing option such as 'by Day' or 'by Month'.

##### Returns

`string`

#### subTriggerDisplayName()

```ts
subTriggerDisplayName(): string
```

A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger (e.g. the list of temporal
bucketing options like 'Day' or 'Month')

##### Returns

`string`

#### withJoinAlias()

```ts
withJoinAlias(newAlias: any): Dimension
```

Return a copy of this Dimension with join alias set to `newAlias`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `newAlias` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

#### withOption()

```ts
withOption(key: string, value: any): Dimension
```

Return a copy of this Dimension with option `key` set to `value`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `value` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

#### withoutOptions()

```ts
abstract withoutOptions(..._options: string[]): Dimension
```

Return a copy of this Dimension that excludes `options`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`_options` | `string`[] |

##### Returns

[`Dimension`](internal.md#dimension)

#### withoutTemporalBucketing()

```ts
withoutTemporalBucketing(): Dimension
```

Return a copy of this Dimension with any temporal unit options removed.

##### Returns

[`Dimension`](internal.md#dimension)

#### withSourceField()

```ts
withSourceField(sourceField: any): Dimension
```

Return a copy of this Dimension with a replacement source field.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `sourceField` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

#### withTemporalUnit()

```ts
withTemporalUnit(unit: string): Dimension
```

Return a copy of this Dimension, bucketed by the specified temporal unit.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `unit` | `string` |

##### Returns

[`Dimension`](internal.md#dimension)

#### defaultDimension()

```ts
abstract static defaultDimension(_parent: Dimension): undefined | null | Dimension
```

The default sub-dimension for the provided dimension of this type, if any.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_parent` | [`Dimension`](internal.md#dimension) |

##### Returns

`undefined` \| `null` \| [`Dimension`](internal.md#dimension)

#### dimensions()

```ts
abstract static dimensions(_parent: Dimension): Dimension[]
```

Sub-dimensions for the provided dimension of this type.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_parent` | [`Dimension`](internal.md#dimension) |

##### Returns

[`Dimension`](internal.md#dimension)[]

#### isEqual()

```ts
static isEqual(a: 
  | undefined
  | null
  | ConcreteFieldReference
  | Dimension, b: undefined | null | Dimension): boolean
```

Returns true if these two dimensions are identical to one another.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | \| `undefined` \| `null` \| [`ConcreteFieldReference`](internal.md#concretefieldreference) \| [`Dimension`](internal.md#dimension) |
| `b` | `undefined` \| `null` \| [`Dimension`](internal.md#dimension) |

##### Returns

`boolean`

#### parseMBQL()

```ts
static parseMBQL(
   mbql: 
  | VariableTarget
  | FieldReference, 
   metadata?: any, 
   query?: null | StructuredQuery | NativeQuery): undefined | null | Dimension
```

Parses an MBQL expression into an appropriate Dimension subclass, if possible.
Metadata should be provided if you intend to use the display name or render methods.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `mbql` | \| [`VariableTarget`](internal.md#variabletarget) \| [`FieldReference`](internal.md#fieldreference) |
| `metadata`? | `any` |
| `query`? | `null` \| [`StructuredQuery`](internal.md#structuredquery) \| `NativeQuery` |

##### Returns

`undefined` \| `null` \| [`Dimension`](internal.md#dimension)

***

## ~~Field~~

### Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

### Extends

- `default`

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="_plainobject"></a> ~~`_plainObject`~~ | `Record`\<`string`, `unknown`\> | `Base._plainObject` |
| <a id="base_type"></a> ~~`base_type`~~ | `null` \| `string` | - |
| <a id="coercion_strategy"></a> ~~`coercion_strategy`~~ | `null` \| `string` | - |
| <a id="description"></a> ~~`description`~~ | `null` \| `string` | - |
| <a id="display_name"></a> ~~`display_name`~~ | `string` | - |
| <a id="effective_type"></a> ~~`effective_type?`~~ | `null` \| `string` | - |
| <a id="fingerprint"></a> ~~`fingerprint?`~~ | [`FieldFingerprint`](internal.md#fieldfingerprint) | - |
| <a id="fk_target_field_id"></a> ~~`fk_target_field_id`~~ | `null` \| `number` | - |
| <a id="has_field_values"></a> ~~`has_field_values?`~~ | [`FieldValuesType`](internal.md#fieldvaluestype) | - |
| <a id="has_more_values"></a> ~~`has_more_values?`~~ | `boolean` | - |
| <a id="id-1"></a> ~~`id`~~ | `number` \| [`FieldReference`](internal.md#fieldreference) | - |
| <a id="json_unfolding"></a> ~~`json_unfolding`~~ | `null` \| `boolean` | - |
| <a id="metadata-2"></a> ~~`metadata?`~~ | [`Metadata`](internal.md#metadata-4) | - |
| <a id="name-1"></a> ~~`name`~~ | `string` | - |
| <a id="name_field"></a> ~~`name_field?`~~ | [`Field`](internal.md#field-1) | - |
| <a id="nfc_path"></a> ~~`nfc_path?`~~ | `string`[] | - |
| <a id="position"></a> ~~`position`~~ | `number` | - |
| <a id="query"></a> ~~`query?`~~ | [`StructuredQuery`](internal.md#structuredquery) \| `NativeQuery` | - |
| <a id="remapping"></a> ~~`remapping?`~~ | `unknown` | - |
| <a id="semantic_type"></a> ~~`semantic_type`~~ | `null` \| `string` | - |
| <a id="settings-1"></a> ~~`settings?`~~ | [`FieldFormattingSettings`](internal.md#fieldformattingsettings) | - |
| <a id="source"></a> ~~`source?`~~ | `string` | - |
| <a id="table"></a> ~~`table?`~~ | [`Table`](internal.md#table-4) | - |
| <a id="table_id"></a> ~~`table_id?`~~ | [`TableId`](internal.md#tableid-3) | - |
| <a id="target"></a> ~~`target?`~~ | [`Field`](internal.md#field-1) | - |
| <a id="values"></a> ~~`values`~~ | `any`[] | - |
| <a id="visibility_type"></a> ~~`visibility_type`~~ | [`FieldVisibilityType`](internal.md#fieldvisibilitytype) | - |

### Methods

#### ~~fieldValues()~~

```ts
fieldValues(): any[]
```

##### Returns

`any`[]

#### ~~foreign()~~

```ts
foreign(foreignField: any): FieldDimension
```

Returns a FKDimension for this field and the provided field

##### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `foreignField` | `any` |  |

##### Returns

[`FieldDimension`](internal.md#fielddimension)

#### ~~getDefaultDateTimeUnit()~~

```ts
getDefaultDateTimeUnit(): "month" | "week" | "day" | "minute" | "hour"
```

Returns a default date/time unit for this field

##### Returns

`"month"` \| `"week"` \| `"day"` \| `"minute"` \| `"hour"`

#### ~~getPlainObject()~~

```ts
getPlainObject(): IField
```

Get the plain metadata object without hydrated fields.
Useful for situations where you want serialize the metadata object.

##### Returns

`IField`

##### Overrides

```ts
Base.getPlainObject
```

#### ~~hasRemappedValue()~~

```ts
hasRemappedValue(value: any): any
```

Returns whether the field has a human readable remapped value for this value

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `any` |

##### Returns

`any`

#### ~~isComparableWith()~~

```ts
isComparableWith(field: any): boolean
```

Predicate to decide whether `this` is comparable with `field`.

Currently only the MongoBSONID erroneous case is ruled out to fix the issue #49149. To the best of my knowledge
there's no logic on FE to reliably decide whether two columns are comparable. Trying to come up with that in ad-hoc
manner could disable some cases that users may depend on.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `any` |

##### Returns

`boolean`

#### ~~isDimension()~~

```ts
isDimension(): any
```

Tells if this column can be used in a breakout
Currently returns `true` for everything expect for aggregation columns

##### Returns

`any`

#### ~~isSearchable()~~

```ts
isSearchable(): boolean
```

Returns true if this field can be searched, e.x. in filter or parameter widgets

##### Returns

`boolean`

#### ~~remappedField()~~

```ts
remappedField(): null | Field
```

Returns the remapped field, if any

##### Returns

`null` \| [`Field`](internal.md#field-1)

#### ~~remappedValue()~~

```ts
remappedValue(value: any): any
```

Returns the human readable remapped value, if any

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `any` |

##### Returns

`any`

#### ~~targetObjectName()~~

```ts
targetObjectName(): string
```

The name of the object type this field points to.
Currently we try to guess this by stripping trailing `ID` from `display_name`, but ideally it would be configurable in metadata
See also `table.objectName()`

##### Returns

`string`

***

## FieldDimension

`:field` clause e.g. `["field", fieldIdOrName, options]`

### Extends

- [`Dimension`](internal.md#dimension)

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="_args-1"></a> `_args` | `any` | [`Dimension`](internal.md#dimension).[`_args`](internal.md#_args) |
| <a id="_metadata-2"></a> `_metadata` | `any` | [`Dimension`](internal.md#dimension).[`_metadata`](internal.md#_metadata-1) |
| <a id="_options-1"></a> `_options` | `any` | [`Dimension`](internal.md#dimension).[`_options`](internal.md#_options) |
| <a id="_parent-1"></a> `_parent` | `undefined` \| `null` \| [`Dimension`](internal.md#dimension) | [`Dimension`](internal.md#dimension).[`_parent`](internal.md#_parent) |
| <a id="_query-1"></a> `_query` | `any` | [`Dimension`](internal.md#dimension).[`_query`](internal.md#_query) |
| <a id="_subdisplayname-1"></a> `_subDisplayName` | `undefined` \| `null` \| `string` | [`Dimension`](internal.md#dimension).[`_subDisplayName`](internal.md#_subdisplayname) |
| <a id="_subtriggerdisplayname-1"></a> `_subTriggerDisplayName` | `undefined` \| `null` \| `string` | [`Dimension`](internal.md#dimension).[`_subTriggerDisplayName`](internal.md#_subtriggerdisplayname) |

### Methods

#### \_describeBinning()

```ts
_describeBinning(): string
```

Short string that describes the binning options used. Used for both subTriggerDisplayName() and render()

##### Returns

`string`

##### Inherited from

[`Dimension`](internal.md#dimension).[`_describeBinning`](internal.md#_describebinning)

#### \_dimensionForOption()

```ts
_dimensionForOption(option: any): FieldDimension
```

Internal method gets a Dimension from a DimensionOption

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `option` | `any` |

##### Returns

[`FieldDimension`](internal.md#fielddimension)

##### Overrides

[`Dimension`](internal.md#dimension).[`_dimensionForOption`](internal.md#_dimensionforoption)

#### \_isBinnable()

```ts
_isBinnable(): boolean
```

Whether this is a numeric Field that can be binned

##### Returns

`boolean`

##### Inherited from

[`Dimension`](internal.md#dimension).[`_isBinnable`](internal.md#_isbinnable)

#### \_withOptions()

```ts
_withOptions(options: any): FieldDimension
```

Return a copy of this FieldDimension that includes the specified `options`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `any` |

##### Returns

[`FieldDimension`](internal.md#fielddimension)

##### Overrides

[`Dimension`](internal.md#dimension).[`_withOptions`](internal.md#_withoptions)

#### baseDimension()

```ts
baseDimension(): Dimension
```

Return a copy of this Dimension with any temporal bucketing or binning options removed.

##### Returns

[`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`baseDimension`](internal.md#basedimension)

#### columnName()

```ts
columnName(): any
```

The `name` appearing in the column object (except duplicates would normally be suffxied)

##### Returns

`any`

##### Overrides

[`Dimension`](internal.md#dimension).[`columnName`](internal.md#columnname)

#### defaultBreakout()

```ts
defaultBreakout(): undefined | null | FieldReference
```

Returns MBQL for the default breakout

Tries to look up a default subdimension (like "Created At: Day" for "Created At" field)
and if it isn't found, uses the plain field id dimension (like "Product ID") as a fallback.

##### Returns

`undefined` \| `null` \| [`FieldReference`](internal.md#fieldreference)

##### Inherited from

[`Dimension`](internal.md#dimension).[`defaultBreakout`](internal.md#defaultbreakout)

#### defaultDimension()

```ts
abstract defaultDimension(dimensionTypes: never[]): FieldDimension
```

Returns the default sub-dimension of this dimension, if any.

##### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `dimensionTypes` | `never`[] | `[]` |

##### Returns

[`FieldDimension`](internal.md#fielddimension)

##### Overrides

[`Dimension`](internal.md#dimension).[`defaultDimension`](internal.md#defaultdimension)

#### dimensions()

```ts
abstract dimensions(DimensionTypes?: typeof Dimension[]): FieldDimension[]
```

Returns "sub-dimensions" of this dimension.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `DimensionTypes`? | *typeof* [`Dimension`](internal.md#dimension)[] |

##### Returns

[`FieldDimension`](internal.md#fielddimension)[]

##### Overrides

[`Dimension`](internal.md#dimension).[`dimensions`](internal.md#dimensions)

#### displayName()

```ts
abstract displayName(...args: any[]): string
```

The display name of this dimension, e.x. the field's display_name

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

##### Returns

`string`

##### Overrides

[`Dimension`](internal.md#dimension).[`displayName`](internal.md#displayname)

#### field()

```ts
field(): Field
```

The underlying field for this dimension

##### Returns

[`Field`](internal.md#field-1)

##### Overrides

[`Dimension`](internal.md#dimension).[`field`](internal.md#field)

#### fieldIdOrName()

```ts
fieldIdOrName(): string | number
```

Return integer ID *or* string name of the Field this `field` clause refers to.

##### Returns

`string` \| `number`

#### fk()

```ts
fk(): null | FieldDimension
```

For `:field` clauses with an FK source field, returns a new Dimension for the source field.

##### Returns

`null` \| [`FieldDimension`](internal.md#fielddimension)

#### getOption()

```ts
getOption(k: string): any
```

Get an option from the field options map, if there is one.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `k` | `string` |

##### Returns

`any`

##### Inherited from

[`Dimension`](internal.md#dimension).[`getOption`](internal.md#getoption)

#### icon()

```ts
abstract icon(): string
```

An icon name representing this dimension's type, to be used in the <Icon> component.

##### Returns

`string`

##### Overrides

[`Dimension`](internal.md#dimension).[`icon`](internal.md#icon)

#### isEqual()

```ts
isEqual(somethingElse: any): any
```

Is this dimension identical to another dimension or MBQL clause

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `somethingElse` | `any` |

##### Returns

`any`

##### Overrides

[`Dimension`](internal.md#dimension).[`isEqual`](internal.md#isequal)

#### isIntegerFieldId()

```ts
isIntegerFieldId(): boolean
```

Whether this Field clause has an integer Field ID (as opposed to a string Field name).

##### Returns

`boolean`

#### isSameBaseDimension()

```ts
isSameBaseDimension(other: 
  | undefined
  | null
  | FieldReference
  | Dimension): boolean
```

Does this dimension have the same underlying base dimension, typically a field

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | \| `undefined` \| `null` \| [`FieldReference`](internal.md#fieldreference) \| [`Dimension`](internal.md#dimension) |

##### Returns

`boolean`

##### Inherited from

[`Dimension`](internal.md#dimension).[`isSameBaseDimension`](internal.md#issamebasedimension)

#### isStringFieldName()

```ts
isStringFieldName(): boolean
```

Whether this Field clause has a string Field name (as opposed to an integer Field ID). This generally means the
Field comes from a native query.

##### Returns

`boolean`

#### isTemporalExtraction()

```ts
isTemporalExtraction(): boolean
```

Whether temporal bucketing is being applied, *and* the bucketing is a truncation operation such as "month" or
"quarter";

##### Returns

`boolean`

##### Inherited from

[`Dimension`](internal.md#dimension).[`isTemporalExtraction`](internal.md#istemporalextraction)

#### joinAlias()

```ts
joinAlias(): any
```

Return the join alias associated with this field, if any.

##### Returns

`any`

##### Inherited from

[`Dimension`](internal.md#dimension).[`joinAlias`](internal.md#joinalias)

#### render()

```ts
render(): string
```

Renders a dimension to a string for display in query builders

##### Returns

`string`

##### Overrides

[`Dimension`](internal.md#dimension).[`render`](internal.md#render)

#### subDisplayName()

```ts
subDisplayName(): string
```

The name to be shown when this dimension is being displayed as a sub-dimension of another.

Example: a temporal bucketing option such as 'by Day' or 'by Month'.

##### Returns

`string`

##### Inherited from

[`Dimension`](internal.md#dimension).[`subDisplayName`](internal.md#subdisplayname)

#### subTriggerDisplayName()

```ts
subTriggerDisplayName(): string
```

A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger (e.g. the list of temporal
bucketing options like 'Day' or 'Month')

##### Returns

`string`

##### Inherited from

[`Dimension`](internal.md#dimension).[`subTriggerDisplayName`](internal.md#subtriggerdisplayname)

#### withJoinAlias()

```ts
withJoinAlias(newAlias: any): Dimension
```

Return a copy of this Dimension with join alias set to `newAlias`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `newAlias` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`withJoinAlias`](internal.md#withjoinalias)

#### withOption()

```ts
withOption(key: string, value: any): Dimension
```

Return a copy of this Dimension with option `key` set to `value`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `value` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`withOption`](internal.md#withoption)

#### withoutOptions()

```ts
withoutOptions(...options: string[]): FieldDimension
```

Return a copy of this FieldDimension that excludes `options`.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`options` | `string`[] |

##### Returns

[`FieldDimension`](internal.md#fielddimension)

##### Overrides

[`Dimension`](internal.md#dimension).[`withoutOptions`](internal.md#withoutoptions)

#### withoutTemporalBucketing()

```ts
withoutTemporalBucketing(): Dimension
```

Return a copy of this Dimension with any temporal unit options removed.

##### Returns

[`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`withoutTemporalBucketing`](internal.md#withouttemporalbucketing)

#### withSourceField()

```ts
withSourceField(sourceField: any): Dimension
```

Return a copy of this Dimension with a replacement source field.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `sourceField` | `any` |

##### Returns

[`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`withSourceField`](internal.md#withsourcefield)

#### withTemporalUnit()

```ts
withTemporalUnit(unit: string): Dimension
```

Return a copy of this Dimension, bucketed by the specified temporal unit.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `unit` | `string` |

##### Returns

[`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`withTemporalUnit`](internal.md#withtemporalunit)

#### defaultDimension()

```ts
abstract static defaultDimension(_parent: Dimension): undefined | null | Dimension
```

The default sub-dimension for the provided dimension of this type, if any.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_parent` | [`Dimension`](internal.md#dimension) |

##### Returns

`undefined` \| `null` \| [`Dimension`](internal.md#dimension)

##### Inherited from

[`Dimension`](internal.md#dimension).[`defaultDimension`](internal.md#defaultdimension-1)

#### dimensions()

```ts
abstract static dimensions(_parent: Dimension): Dimension[]
```

Sub-dimensions for the provided dimension of this type.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_parent` | [`Dimension`](internal.md#dimension) |

##### Returns

[`Dimension`](internal.md#dimension)[]

##### Inherited from

[`Dimension`](internal.md#dimension).[`dimensions`](internal.md#dimensions-1)

#### isEqual()

```ts
static isEqual(a: 
  | undefined
  | null
  | ConcreteFieldReference
  | Dimension, b: undefined | null | Dimension): boolean
```

Returns true if these two dimensions are identical to one another.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | \| `undefined` \| `null` \| [`ConcreteFieldReference`](internal.md#concretefieldreference) \| [`Dimension`](internal.md#dimension) |
| `b` | `undefined` \| `null` \| [`Dimension`](internal.md#dimension) |

##### Returns

`boolean`

##### Inherited from

[`Dimension`](internal.md#dimension).[`isEqual`](internal.md#isequal-1)

#### parseMBQL()

```ts
static parseMBQL(
   mbql: any, 
   metadata: null, 
   query: null): undefined | null | FieldDimension
```

Parses an MBQL expression into an appropriate Dimension subclass, if possible.
Metadata should be provided if you intend to use the display name or render methods.

##### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `mbql` | `any` | `undefined` |
| `metadata` | `null` | `null` |
| `query` | `null` | `null` |

##### Returns

`undefined` \| `null` \| [`FieldDimension`](internal.md#fielddimension)

##### Overrides

[`Dimension`](internal.md#dimension).[`parseMBQL`](internal.md#parsembql)

#### parseMBQLOrWarn()

```ts
static parseMBQLOrWarn(
   mbql: any, 
   metadata: null, 
   query: null): undefined | null | FieldDimension
```

Parse MBQL field clause or log a warning message if it could not be parsed. Use this when you expect the clause to
be a `:field` clause

##### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `mbql` | `any` | `undefined` |
| `metadata` | `null` | `null` |
| `query` | `null` | `null` |

##### Returns

`undefined` \| `null` \| [`FieldDimension`](internal.md#fielddimension)

***

## ~~ForeignKey~~

### Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

### Extends

- `Omit`\<[`NormalizedForeignKey`](internal.md#normalizedforeignkey), `"origin"` \| `"destination"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="destination"></a> ~~`destination?`~~ | [`Field`](internal.md#field-1) | - |
| <a id="destination_id"></a> ~~`destination_id`~~ | `number` | `Omit.destination_id` |
| <a id="metadata-3"></a> ~~`metadata?`~~ | [`Metadata`](internal.md#metadata-4) | - |
| <a id="origin"></a> ~~`origin?`~~ | [`Field`](internal.md#field-1) | - |
| <a id="origin_id"></a> ~~`origin_id`~~ | `number` | `Omit.origin_id` |
| <a id="relationship"></a> ~~`relationship`~~ | `"Mt1"` | `Omit.relationship` |

***

## ~~Metadata~~

### Deprecated

The class shouldn't be used for anything but to create a MetadataProvider instance from MBQL lib.

  For finding a database/table/field/card by id, use the corresponding RTK query endpoints.
  Do not rely on data being implicitly loaded in some other place.

### Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="databases"></a> ~~`databases`~~ | `Record`\<`string`, [`Database`](internal.md#database)\> | `{}` |
| <a id="fields"></a> ~~`fields`~~ | `Record`\<`string`, [`Field`](internal.md#field-1)\> | `{}` |
| <a id="questions"></a> ~~`questions`~~ | `Record`\<`string`, [`Question`](internal.md#question-3)\> | `{}` |
| <a id="schemas-1"></a> ~~`schemas`~~ | `Record`\<`string`, [`Schema`](internal.md#schema-1)\> | `{}` |
| <a id="segments"></a> ~~`segments`~~ | `Record`\<`string`, [`Segment`](internal.md#segment-1)\> | `{}` |
| <a id="settings-2"></a> ~~`settings?`~~ | [`Settings`](internal.md#settings-15) | `undefined` |
| <a id="tables-2"></a> ~~`tables`~~ | `Record`\<`string`, [`Table`](internal.md#table-4)\> | `{}` |

### Methods

#### ~~database()~~

```ts
database(databaseId: undefined | null | number): null | Database
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `databaseId` | `undefined` \| `null` \| `number` |

##### Returns

`null` \| [`Database`](internal.md#database)

##### Deprecated

load data via RTK Query - useGetDatabaseQuery

#### ~~databasesList()~~

```ts
databasesList(__namedParameters: {
  savedQuestions: boolean;
 }): Database[]
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | \{ `savedQuestions`: `boolean`; \} |
| `__namedParameters.savedQuestions`? | `boolean` |

##### Returns

[`Database`](internal.md#database)[]

##### Deprecated

load data via RTK Query - useListDatabasesQuery

#### ~~field()~~

```ts
field(fieldId: 
  | undefined
  | null
  | string
  | number
  | FieldReference, tableId?: null | TableId): null | Field
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `fieldId` | \| `undefined` \| `null` \| `string` \| `number` \| [`FieldReference`](internal.md#fieldreference) |
| `tableId`? | `null` \| [`TableId`](internal.md#tableid-3) |

##### Returns

`null` \| [`Field`](internal.md#field-1)

##### Deprecated

load data via RTK Query - useGetFieldQuery

#### ~~fieldsList()~~

```ts
fieldsList(): Field[]
```

##### Returns

[`Field`](internal.md#field-1)[]

##### Deprecated

load data via RTK Query - useListFieldsQuery

#### ~~question()~~

```ts
question(cardId: undefined | null | number): null | Question
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `cardId` | `undefined` \| `null` \| `number` |

##### Returns

`null` \| [`Question`](internal.md#question-3)

##### Deprecated

load data via RTK Query - useGetCardQuery

#### ~~savedQuestionsDatabase()~~

```ts
savedQuestionsDatabase(): Database
```

##### Returns

[`Database`](internal.md#database)

##### Deprecated

load data via RTK Query - useListDatabasesQuery({ saved: true })

#### ~~schema()~~

```ts
schema(schemaId: undefined | null | string): null | Schema
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `schemaId` | `undefined` \| `null` \| `string` |

##### Returns

`null` \| [`Schema`](internal.md#schema-1)

##### Deprecated

load data via RTK Query - useListSchemasQuery or useListDatabaseSchemaTablesQuery

#### ~~segment()~~

```ts
segment(segmentId: undefined | null | number): null | Segment
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `segmentId` | `undefined` \| `null` \| `number` |

##### Returns

`null` \| [`Segment`](internal.md#segment-1)

##### Deprecated

load data via RTK Query - useGetSegmentQuery

#### ~~segmentsList()~~

```ts
segmentsList(): Segment[]
```

##### Returns

[`Segment`](internal.md#segment-1)[]

##### Deprecated

load data via RTK Query - useListSegmentsQuery

#### ~~table()~~

```ts
table(tableId: undefined | null | TableId): null | Table
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `tableId` | `undefined` \| `null` \| [`TableId`](internal.md#tableid-3) |

##### Returns

`null` \| [`Table`](internal.md#table-4)

##### Deprecated

load data via RTK Query - useGetTableQuery or useGetTableQueryMetadataQuery

#### ~~tablesList()~~

```ts
tablesList(): Table[]
```

##### Returns

[`Table`](internal.md#table-4)[]

##### Deprecated

load data via RTK Query - useListDatabaseSchemaTablesQuery

***

## Query

An abstract class for all query types (StructuredQuery & NativeQuery)

### Extended by

- [`AtomicQuery`](internal.md#atomicquery)

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="_datasetquery-1"></a> `_datasetQuery` | [`DatasetQuery`](internal.md#datasetquery-3) | - |
| <a id="_metadata-3"></a> `_metadata` | [`Metadata`](internal.md#metadata-4) | - |
| <a id="_originalquestion-1"></a> `_originalQuestion` | [`Question`](internal.md#question-3) | Note that Question is not always in sync with _datasetQuery, calling question() will always merge the latest _datasetQuery to the question object |
| <a id="question-2"></a> `question` | () => [`Question`](internal.md#question-3) | Returns a question updated with the current dataset query. Can only be applied to query that is a direct child of the question. |

### Methods

#### canRun()

```ts
canRun(): boolean
```

Query is valid (as far as we know) and can be executed

##### Returns

`boolean`

#### datasetQuery()

```ts
datasetQuery(): DatasetQuery
```

Returns the dataset_query object underlying this Query

##### Returns

[`DatasetQuery`](internal.md#datasetquery-3)

#### dimensionOptions()

```ts
dimensionOptions(_filter?: (dimension: Dimension) => boolean): DimensionOptions
```

Dimensions exposed by this query
NOTE: Ideally we'd also have `dimensions()` that returns a flat list, but currently StructuredQuery has it's own `dimensions()` for another purpose.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`dimension`: [`Dimension`](internal.md#dimension)) => `boolean` |

##### Returns

`DimensionOptions`

#### isEmpty()

```ts
isEmpty(): boolean
```

Query is considered empty, i.e. it is in a plain state with no properties / query clauses set

##### Returns

`boolean`

#### metadata()

```ts
metadata(): Metadata
```

Convenience method for accessing the global metadata

##### Returns

[`Metadata`](internal.md#metadata-4)

#### variables()

```ts
variables(_filter?: (variable: Variable) => boolean): TemplateTagVariable[]
```

Variables exposed by this query

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`variable`: `Variable`) => `boolean` |

##### Returns

`TemplateTagVariable`[]

***

## Question

This is a wrapper around a question/card object, which may contain one or more Query objects

### Constructors

#### new Question()

```ts
new Question(
   card: any, 
   metadata?: Metadata, 
   parameterValues?: ParameterValuesMap): Question
```

Question constructor

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | `any` |
| `metadata`? | [`Metadata`](internal.md#metadata-4) |
| `parameterValues`? | [`ParameterValuesMap`](internal.md#parametervaluesmap) |

##### Returns

[`Question`](internal.md#question-3)

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="_card"></a> `_card` | [`Card`](internal.md#cardq) | The plain object presentation of this question, equal to the format that Metabase REST API understands. It is called `card` for both historical reasons and to make a clear distinction to this class. |
| <a id="_legacyquery"></a> `_legacyQuery` | () => [`AtomicQuery`](internal.md#atomicquery) | A question contains either a: - StructuredQuery for queries written in MBQL - NativeQuery for queries written in data source's native query language This is just a wrapper object, the data is stored in `this._card.dataset_query` in a format specific to the query type. |
| <a id="_metadata-4"></a> `_metadata` | [`Metadata`](internal.md#metadata-4) | The Question wrapper requires a metadata object because the queries it contains (like [StructuredQuery](internal.md#structuredquery)) need metadata for accessing databases, tables and metrics. |
| <a id="_parametervalues"></a> `_parameterValues` | [`ParameterValuesMap`](internal.md#parametervaluesmap) | Parameter values mean either the current values of dashboard filters or SQL editor template parameters. They are in the grey area between UI state and question state, but having them in Question wrapper is convenient. |

### Methods

#### alertType()

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

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `visualizationSettings` | `any` |

##### Returns

  \| `null`
  \| `"alert-type-rows"`
  \| `"alert-type-timeseries-goal"`
  \| `"alert-type-progress-bar-goal"`

#### applyTemplateTagParameters()

```ts
applyTemplateTagParameters(): Question
```

Applies the template tag parameters from the card to the question.

##### Returns

[`Question`](internal.md#question-3)

#### canRun()

```ts
canRun(): boolean
```

Question is valid (as far as we know) and can be executed

##### Returns

`boolean`

#### composeQuestion()

```ts
composeQuestion(): Question
```

Visualization drill-through and action widget actions

Although most of these are essentially a way to modify the current query, having them as a part
of Question interface instead of Query interface makes it more convenient to also change the current visualization

##### Returns

[`Question`](internal.md#question-3)

#### display()

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

##### Returns

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

#### displayName()

```ts
displayName(): undefined | null | string
```

A user-defined name for the question

##### Returns

`undefined` \| `null` \| `string`

#### getParameterUsageCount()

```ts
getParameterUsageCount(): number
```

How many filters or other widgets are this question's values used for?

##### Returns

`number`

#### isEqual()

```ts
isEqual(other: any, __namedParameters: {
  compareResultsMetadata: boolean;
 }): boolean
```

Returns true if the questions are equivalent (including id, card, and parameters)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | `any` |
| `__namedParameters` | \{ `compareResultsMetadata`: `boolean`; \} |
| `__namedParameters.compareResultsMetadata`? | `boolean` |

##### Returns

`boolean`

#### setLegacyQuery()

```ts
setLegacyQuery(newQuery: Query): Question
```

Returns a new Question object with an updated query.
The query is saved to the `dataset_query` field of the Card object.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `newQuery` | [`Query`](internal.md#query-1) |

##### Returns

[`Question`](internal.md#question-3)

#### create()

```ts
static create(__namedParameters: QuestionCreatorOpts): Question
```

TODO Atte Keinänen 6/13/17: Discussed with Tom that we could use the default Question constructor instead,
but it would require changing the constructor signature so that `card` is an optional parameter and has a default value

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | [`QuestionCreatorOpts`](internal.md#questioncreatoropts) |

##### Returns

[`Question`](internal.md#question-3)

***

## ~~Schema~~

### Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

### Extends

- `Omit`\<[`NormalizedSchema`](internal.md#normalizedschema), `"database"` \| `"tables"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="database-2"></a> ~~`database?`~~ | [`Database`](internal.md#database) | - |
| <a id="id-2"></a> ~~`id`~~ | `string` | `Omit.id` |
| <a id="metadata-6"></a> ~~`metadata?`~~ | [`Metadata`](internal.md#metadata-4) | - |
| <a id="name-2"></a> ~~`name`~~ | `string` | `Omit.name` |
| <a id="tables-3"></a> ~~`tables?`~~ | [`Table`](internal.md#table-4)[] | - |

***

## ~~Segment~~

### Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

### Extends

- `Omit`\<[`NormalizedSegment`](internal.md#normalizedsegment), `"table"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="archived"></a> ~~`archived`~~ | `boolean` | `Omit.archived` |
| <a id="definition"></a> ~~`definition`~~ | [`StructuredQuery`](internal.md#structuredquery-1) | `Omit.definition` |
| <a id="definition_description"></a> ~~`definition_description`~~ | `string` | `Omit.definition_description` |
| <a id="description-1"></a> ~~`description`~~ | `string` | `Omit.description` |
| <a id="id-3"></a> ~~`id`~~ | `number` | `Omit.id` |
| <a id="metadata-7"></a> ~~`metadata?`~~ | [`Metadata`](internal.md#metadata-4) | - |
| <a id="name-3"></a> ~~`name`~~ | `string` | `Omit.name` |
| <a id="revision_message"></a> ~~`revision_message?`~~ | `string` | `Omit.revision_message` |
| <a id="table-2"></a> ~~`table?`~~ | [`Table`](internal.md#table-4) | - |
| <a id="table_id-1"></a> ~~`table_id`~~ | [`TableId`](internal.md#tableid-3) | `Omit.table_id` |

***

## StructuredQuery

A wrapper around an MBQL (`query` type

### Extends

- [`AtomicQuery`](internal.md#atomicquery)

### Constructors

#### new StructuredQuery()

```ts
new StructuredQuery(question: Question, datasetQuery: DatasetQuery): StructuredQuery
```

Creates a new StructuredQuery based on the provided DatasetQuery object

##### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `question` | [`Question`](internal.md#question-3) | `undefined` |
| `datasetQuery` | [`DatasetQuery`](internal.md#datasetquery-3) | `STRUCTURED_QUERY_TEMPLATE` |

##### Returns

[`StructuredQuery`](internal.md#structuredquery)

##### Overrides

```ts
AtomicQuery.constructor
```

### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="_datasetquery-2"></a> `_datasetQuery` | [`DatasetQuery`](internal.md#datasetquery-3) | - | [`AtomicQuery`](internal.md#atomicquery).[`_datasetQuery`](internal.md#_datasetquery) |
| <a id="_metadata-5"></a> `_metadata` | [`Metadata`](internal.md#metadata-4) | - | [`AtomicQuery`](internal.md#atomicquery).[`_metadata`](internal.md#_metadata) |
| <a id="_originalquestion-2"></a> `_originalQuestion` | [`Question`](internal.md#question-3) | Note that Question is not always in sync with _datasetQuery, calling question() will always merge the latest _datasetQuery to the question object | [`AtomicQuery`](internal.md#atomicquery).[`_originalQuestion`](internal.md#_originalquestion) |
| <a id="_structureddatasetquery"></a> `_structuredDatasetQuery` | [`StructuredDatasetQuery`](internal.md#structureddatasetquery) | - | - |
| <a id="question-4"></a> `question` | () => [`Question`](internal.md#question-3) | Returns a question updated with the current dataset query. Can only be applied to query that is a direct child of the question. | [`AtomicQuery`](internal.md#atomicquery).[`question`](internal.md#question) |
| <a id="table-3"></a> `table` | () => `null` \| [`Table`](internal.md#table-4) | - | - |

### Methods

#### ~~\_database()~~

```ts
_database(): undefined | null | Database
```

##### Returns

`undefined` \| `null` \| [`Database`](internal.md#database)

##### Deprecated

Use MLv2

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`_database`](internal.md#_database)

#### ~~\_databaseId()~~

```ts
_databaseId(): undefined | null | number
```

##### Returns

`undefined` \| `null` \| `number`

##### Deprecated

Use MLv2

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`_databaseId`](internal.md#_databaseid)

#### canRun()

```ts
canRun(): boolean
```

Query is valid (as far as we know) and can be executed

##### Returns

`boolean`

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`canRun`](internal.md#canrun)

#### datasetQuery()

```ts
datasetQuery(): DatasetQuery
```

Returns the dataset_query object underlying this Query

##### Returns

[`DatasetQuery`](internal.md#datasetquery-3)

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`datasetQuery`](internal.md#datasetquery)

#### dimensionOptions()

```ts
dimensionOptions(_filter?: (dimension: Dimension) => boolean): DimensionOptions
```

Dimensions exposed by this query
NOTE: Ideally we'd also have `dimensions()` that returns a flat list, but currently StructuredQuery has it's own `dimensions()` for another purpose.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`dimension`: [`Dimension`](internal.md#dimension)) => `boolean` |

##### Returns

`DimensionOptions`

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`dimensionOptions`](internal.md#dimensionoptions)

#### isEmpty()

```ts
isEmpty(): boolean
```

Query is considered empty, i.e. it is in a plain state with no properties / query clauses set

##### Returns

`boolean`

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`isEmpty`](internal.md#isempty)

#### legacyQuery()

```ts
legacyQuery(): StructuredQueryObject
```

##### Returns

`StructuredQueryObject`

the underlying MBQL query object

#### metadata()

```ts
metadata(): Metadata
```

Convenience method for accessing the global metadata

##### Returns

[`Metadata`](internal.md#metadata-4)

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`metadata`](internal.md#metadata)

#### tables()

```ts
tables(): undefined | null | Table[]
```

Tables this query could use, if the database is set

##### Returns

`undefined` \| `null` \| [`Table`](internal.md#table-4)[]

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`tables`](internal.md#tables)

#### variables()

```ts
variables(_filter?: (variable: Variable) => boolean): TemplateTagVariable[]
```

Variables exposed by this query

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `_filter`? | (`variable`: `Variable`) => `boolean` |

##### Returns

`TemplateTagVariable`[]

##### Inherited from

[`AtomicQuery`](internal.md#atomicquery).[`variables`](internal.md#variables)

***

## ~~Table~~

### Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

### Extends

- `Omit`\<[`NormalizedTable`](internal.md#normalizedtable), `"db"` \| `"schema"` \| `"fields"` \| `"fks"` \| `"segments"` \| `"metrics"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="active"></a> ~~`active`~~ | `boolean` | `Omit.active` |
| <a id="caveats-1"></a> ~~`caveats?`~~ | `string` | `Omit.caveats` |
| <a id="created_at-1"></a> ~~`created_at`~~ | `string` | `Omit.created_at` |
| <a id="db"></a> ~~`db?`~~ | [`Database`](internal.md#database) | - |
| <a id="db_id"></a> ~~`db_id`~~ | `number` | `Omit.db_id` |
| <a id="description-2"></a> ~~`description`~~ | `null` \| `string` | `Omit.description` |
| <a id="dimension_options"></a> ~~`dimension_options?`~~ | `Record`\<`string`, [`FieldDimensionOption`](internal.md#fielddimensionoption)\> | `Omit.dimension_options` |
| <a id="display_name-1"></a> ~~`display_name`~~ | `string` | `Omit.display_name` |
| <a id="field_order"></a> ~~`field_order`~~ | [`TableFieldOrder`](internal.md#tablefieldorder) | `Omit.field_order` |
| <a id="fields-1"></a> ~~`fields?`~~ | [`Field`](internal.md#field-1)[] | - |
| <a id="fks"></a> ~~`fks?`~~ | [`ForeignKey`](internal.md#foreignkey)[] | - |
| <a id="id-4"></a> ~~`id`~~ | [`TableId`](internal.md#tableid-3) | `Omit.id` |
| <a id="initial_sync_status-1"></a> ~~`initial_sync_status`~~ | [`LongTaskStatus`](internal.md#longtaskstatus) | `Omit.initial_sync_status` |
| <a id="is_upload"></a> ~~`is_upload`~~ | `boolean` | `Omit.is_upload` |
| <a id="metadata-9"></a> ~~`metadata?`~~ | [`Metadata`](internal.md#metadata-4) | - |
| <a id="metrics"></a> ~~`metrics?`~~ | [`Question`](internal.md#question-3)[] | - |
| <a id="name-4"></a> ~~`name`~~ | `string` | `Omit.name` |
| <a id="original_fields"></a> ~~`original_fields?`~~ | [`Field`](internal.md#field-5)[] | `Omit.original_fields` |
| <a id="points_of_interest-1"></a> ~~`points_of_interest?`~~ | `string` | `Omit.points_of_interest` |
| <a id="schema-2"></a> ~~`schema?`~~ | [`Schema`](internal.md#schema-1) | - |
| <a id="schema_name"></a> ~~`schema_name?`~~ | `string` | `Omit.schema_name` |
| <a id="segments-1"></a> ~~`segments?`~~ | [`Segment`](internal.md#segment-1)[] | - |
| <a id="type"></a> ~~`type?`~~ | [`CardType`](internal.md#cardtype) | `Omit.type` |
| <a id="updated_at-1"></a> ~~`updated_at`~~ | `string` | `Omit.updated_at` |
| <a id="visibility_type-1"></a> ~~`visibility_type`~~ | [`TableVisibilityType`](internal.md#tablevisibilitytype) | `Omit.visibility_type` |

### Methods

#### ~~objectName()~~

```ts
objectName(): string
```

The singular form of the object type this table represents
Currently we try to guess this by singularizing `display_name`, but ideally it would be configurable in metadata
See also `field.targetObjectName()`

##### Returns

`string`

***

## ActionFormSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="confirmmessage"></a> `confirmMessage?` | `string` |
| <a id="description-3"></a> `description?` | `string` |
| <a id="errormessage"></a> `errorMessage?` | `string` |
| <a id="fields-2"></a> `fields?` | [`FieldSettingsMap`](internal.md#fieldsettingsmap) |
| <a id="name-5"></a> `name?` | `string` |
| <a id="submitbuttoncolor"></a> `submitButtonColor?` | `string` |
| <a id="submitbuttonlabel"></a> `submitButtonLabel?` | `string` |
| <a id="successmessage"></a> `successMessage?` | `string` |
| <a id="type-1"></a> `type?` | [`ActionDisplayType`](internal.md#actiondisplaytype) |

***

## AdaptiveStrategy

### Extends

- [`CacheStrategyBase`](internal.md#cachestrategybase)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="min_duration_ms"></a> `min_duration_ms` | `number` | - |
| <a id="min_duration_seconds"></a> `min_duration_seconds?` | `number` | - |
| <a id="multiplier"></a> `multiplier` | `number` | - |
| <a id="type-2"></a> `type` | `"ttl"` | [`CacheStrategyBase`](internal.md#cachestrategybase).[`type`](internal.md#type-6) |

***

## AdminAppState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="isnoticeenabled"></a> `isNoticeEnabled` | `boolean` |
| <a id="paths"></a> `paths` | [`AdminPath`](internal.md#adminpath)[] |

***

## AdminSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="active-users-count"></a> `active-users-count?` | `number` |
| <a id="deprecation-notice-version"></a> `deprecation-notice-version?` | `string` |
| <a id="embedding-homepage"></a> `embedding-homepage` | [`EmbeddingHomepageStatus`](internal.md#embeddinghomepagestatus) |
| <a id="embedding-secret-key"></a> `embedding-secret-key?` | `string` |
| <a id="google-auth-auto-create-accounts-domain"></a> `google-auth-auto-create-accounts-domain` | `null` \| `string` |
| <a id="google-auth-configured"></a> `google-auth-configured` | `boolean` |
| <a id="jwt-configured"></a> `jwt-configured?` | `boolean` |
| <a id="jwt-enabled"></a> `jwt-enabled?` | `boolean` |
| <a id="last-acknowledged-version"></a> `last-acknowledged-version` | `null` \| `string` |
| <a id="other-sso-enabled?"></a> `other-sso-enabled??` | `boolean` |
| <a id="premium-embedding-token"></a> `premium-embedding-token` | `null` \| `string` |
| <a id="query-caching-min-ttl"></a> `query-caching-min-ttl` | `number` |
| <a id="query-caching-ttl-ratio"></a> `query-caching-ttl-ratio` | `number` |
| <a id="saml-configured"></a> `saml-configured?` | `boolean` |
| <a id="saml-enabled"></a> `saml-enabled?` | `boolean` |
| <a id="saml-identity-provider-uri"></a> `saml-identity-provider-uri` | `null` \| `string` |
| <a id="setup-license-active-at-setup"></a> `setup-license-active-at-setup` | `boolean` |
| <a id="show-database-syncing-modal"></a> `show-database-syncing-modal` | `boolean` |
| <a id="show-sdk-embed-terms"></a> `show-sdk-embed-terms` | `null` \| `boolean` |
| <a id="show-static-embed-terms"></a> `show-static-embed-terms` | `null` \| `boolean` |
| <a id="store-url"></a> `store-url` | `string` |
| <a id="token-status"></a> `token-status` | `null` \| [`TokenStatus`](internal.md#tokenstatus) |
| <a id="version-info"></a> `version-info` | `null` \| [`VersionInfo`](internal.md#versioninfo) |

***

## AdminState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="app"></a> `app` | [`AdminAppState`](internal.md#adminappstate) |
| <a id="permissions"></a> `permissions` | \{ `collectionPermissions`: [`CollectionPermissions`](internal.md#collectionpermissions); `dataPermissions`: [`GroupsPermissions`](internal.md#groupspermissions); `hasRevisionChanged`: \{ `hasChanged`: `boolean`; `revision`: `null` \| `number`; \}; `isHelpReferenceOpen`: `boolean`; `originalCollectionPermissions`: [`CollectionPermissions`](internal.md#collectionpermissions); `originalDataPermissions`: [`GroupsPermissions`](internal.md#groupspermissions); `saveError`: `string`; \} |
| `permissions.collectionPermissions` | [`CollectionPermissions`](internal.md#collectionpermissions) |
| `permissions.dataPermissions` | [`GroupsPermissions`](internal.md#groupspermissions) |
| `permissions.hasRevisionChanged` | \{ `hasChanged`: `boolean`; `revision`: `null` \| `number`; \} |
| `permissions.hasRevisionChanged.hasChanged` | `boolean` |
| `permissions.hasRevisionChanged.revision` | `null` \| `number` |
| `permissions.isHelpReferenceOpen` | `boolean` |
| `permissions.originalCollectionPermissions` | [`CollectionPermissions`](internal.md#collectionpermissions) |
| `permissions.originalDataPermissions` | [`GroupsPermissions`](internal.md#groupspermissions) |
| `permissions.saveError?` | `string` |
| <a id="settings-3"></a> `settings` | \{ `settings`: [`SettingDefinition`](internal.md#settingdefinitionkey)\< \| `"enable-xrays"` \| `"version"` \| `"admin-email"` \| `"email-smtp-host"` \| `"email-smtp-port"` \| `"email-smtp-security"` \| `"email-smtp-username"` \| `"email-smtp-password"` \| `"enable-embedding"` \| `"enable-embedding-static"` \| `"enable-embedding-sdk"` \| `"enable-embedding-interactive"` \| `"enable-nested-queries"` \| `"enable-public-sharing"` \| `"example-dashboard-id"` \| `"instance-creation"` \| `"read-only-mode"` \| `"search-typeahead-enabled"` \| `"show-homepage-data"` \| `"show-homepage-pin-message"` \| `"show-homepage-xrays"` \| `"site-name"` \| `"site-uuid"` \| `"subscription-allowed-domains"` \| `"uploads-settings"` \| `"user-visibility"` \| `"query-analysis-enabled"` \| `"allowed-iframe-hosts"` \| `"anon-tracking-enabled"` \| `"application-font"` \| `"application-font-files"` \| `"application-name"` \| `"application-favicon-url"` \| `"available-fonts"` \| `"available-locales"` \| `"bug-reporting-enabled"` \| `"check-for-updates"` \| `"cloud-gateway-ips"` \| `"custom-formatting"` \| `"custom-homepage"` \| `"custom-homepage-dashboard"` \| `"ee-ai-features-enabled"` \| `"email-configured?"` \| `"embedding-app-origin"` \| `"embedding-app-origins-sdk"` \| `"embedding-app-origins-interactive"` \| `"enable-enhancements?"` \| `"enable-password-login"` \| `"enable-pivoted-exports"` \| `"engines"` \| `"google-auth-client-id"` \| `"google-auth-enabled"` \| `"gsheets"` \| `"has-user-setup"` \| `"help-link"` \| `"help-link-custom-destination"` \| `"humanization-strategy"` \| `"hide-embed-branding?"` \| `"is-hosted?"` \| `"ldap-configured?"` \| `"ldap-enabled"` \| `"ldap-port"` \| `"ldap-group-membership-filter"` \| `"loading-message"` \| `"map-tile-server-url"` \| `"native-query-autocomplete-match-style"` \| `"other-sso-enabled?"` \| `"password-complexity"` \| `"persisted-models-enabled"` \| `"persisted-model-refresh-cron-schedule"` \| `"report-timezone-long"` \| `"report-timezone-short"` \| `"session-cookies"` \| `"setup-token"` \| `"show-metabase-links"` \| `"show-metabot"` \| `"show-google-sheets-integration"` \| `"site-locale"` \| `"site-url"` \| `"snowplow-enabled"` \| `"snowplow-url"` \| `"start-of-week"` \| `"token-features"` \| `"update-channel"` \| `"version-info-last-checked"` \| `"airgap-enabled"` \| `"dismissed-collection-cleanup-banner"` \| `"dismissed-browse-models-banner"` \| `"dismissed-custom-dashboard-toast"` \| `"dismissed-onboarding-sidebar-link"` \| `"last-used-native-database-id"` \| `"notebook-native-preview-shown"` \| `"notebook-native-preview-sidebar-width"` \| `"expand-browse-in-nav"` \| `"expand-bookmarks-in-nav"` \| `"browse-filter-only-verified-models"` \| `"browse-filter-only-verified-metrics"` \| `"show-updated-permission-modal"` \| `"show-updated-permission-banner"` \| `"trial-banner-dismissal-timestamp"` \| `"active-users-count"` \| `"deprecation-notice-version"` \| `"embedding-secret-key"` \| `"query-caching-min-ttl"` \| `"query-caching-ttl-ratio"` \| `"google-auth-auto-create-accounts-domain"` \| `"google-auth-configured"` \| `"jwt-configured"` \| `"jwt-enabled"` \| `"premium-embedding-token"` \| `"saml-configured"` \| `"saml-enabled"` \| `"saml-identity-provider-uri"` \| `"show-database-syncing-modal"` \| `"token-status"` \| `"version-info"` \| `"last-acknowledged-version"` \| `"show-static-embed-terms"` \| `"show-sdk-embed-terms"` \| `"embedding-homepage"` \| `"setup-license-active-at-setup"` \| `"store-url"` \| `"bcc-enabled?"` \| `"ee-openai-api-key"` \| `"openai-api-key"` \| `"openai-available-models"` \| `"openai-model"` \| `"openai-organization"` \| `"session-cookie-samesite"` \| `"slack-app-token"` \| `"slack-bug-report-channel"` \| `"slack-token"` \| `"slack-token-valid?"`\>[]; `warnings`: `Partial`\<`Record`\< \| `"enable-xrays"` \| `"version"` \| `"admin-email"` \| `"email-smtp-host"` \| `"email-smtp-port"` \| `"email-smtp-security"` \| `"email-smtp-username"` \| `"email-smtp-password"` \| `"enable-embedding"` \| `"enable-embedding-static"` \| `"enable-embedding-sdk"` \| `"enable-embedding-interactive"` \| `"enable-nested-queries"` \| `"enable-public-sharing"` \| `"example-dashboard-id"` \| `"instance-creation"` \| `"read-only-mode"` \| `"search-typeahead-enabled"` \| `"show-homepage-data"` \| `"show-homepage-pin-message"` \| `"show-homepage-xrays"` \| `"site-name"` \| `"site-uuid"` \| `"subscription-allowed-domains"` \| `"uploads-settings"` \| `"user-visibility"` \| `"query-analysis-enabled"` \| `"allowed-iframe-hosts"` \| `"anon-tracking-enabled"` \| `"application-font"` \| `"application-font-files"` \| `"application-name"` \| `"application-favicon-url"` \| `"available-fonts"` \| `"available-locales"` \| `"bug-reporting-enabled"` \| `"check-for-updates"` \| `"cloud-gateway-ips"` \| `"custom-formatting"` \| `"custom-homepage"` \| `"custom-homepage-dashboard"` \| `"ee-ai-features-enabled"` \| `"email-configured?"` \| `"embedding-app-origin"` \| `"embedding-app-origins-sdk"` \| `"embedding-app-origins-interactive"` \| `"enable-enhancements?"` \| `"enable-password-login"` \| `"enable-pivoted-exports"` \| `"engines"` \| `"google-auth-client-id"` \| `"google-auth-enabled"` \| `"gsheets"` \| `"has-user-setup"` \| `"help-link"` \| `"help-link-custom-destination"` \| `"humanization-strategy"` \| `"hide-embed-branding?"` \| `"is-hosted?"` \| `"ldap-configured?"` \| `"ldap-enabled"` \| `"ldap-port"` \| `"ldap-group-membership-filter"` \| `"loading-message"` \| `"map-tile-server-url"` \| `"native-query-autocomplete-match-style"` \| `"other-sso-enabled?"` \| `"password-complexity"` \| `"persisted-models-enabled"` \| `"persisted-model-refresh-cron-schedule"` \| `"report-timezone-long"` \| `"report-timezone-short"` \| `"session-cookies"` \| `"setup-token"` \| `"show-metabase-links"` \| `"show-metabot"` \| `"show-google-sheets-integration"` \| `"site-locale"` \| `"site-url"` \| `"snowplow-enabled"` \| `"snowplow-url"` \| `"start-of-week"` \| `"token-features"` \| `"update-channel"` \| `"version-info-last-checked"` \| `"airgap-enabled"` \| `"dismissed-collection-cleanup-banner"` \| `"dismissed-browse-models-banner"` \| `"dismissed-custom-dashboard-toast"` \| `"dismissed-onboarding-sidebar-link"` \| `"last-used-native-database-id"` \| `"notebook-native-preview-shown"` \| `"notebook-native-preview-sidebar-width"` \| `"expand-browse-in-nav"` \| `"expand-bookmarks-in-nav"` \| `"browse-filter-only-verified-models"` \| `"browse-filter-only-verified-metrics"` \| `"show-updated-permission-modal"` \| `"show-updated-permission-banner"` \| `"trial-banner-dismissal-timestamp"` \| `"active-users-count"` \| `"deprecation-notice-version"` \| `"embedding-secret-key"` \| `"query-caching-min-ttl"` \| `"query-caching-ttl-ratio"` \| `"google-auth-auto-create-accounts-domain"` \| `"google-auth-configured"` \| `"jwt-configured"` \| `"jwt-enabled"` \| `"premium-embedding-token"` \| `"saml-configured"` \| `"saml-enabled"` \| `"saml-identity-provider-uri"` \| `"show-database-syncing-modal"` \| `"token-status"` \| `"version-info"` \| `"last-acknowledged-version"` \| `"show-static-embed-terms"` \| `"show-sdk-embed-terms"` \| `"embedding-homepage"` \| `"setup-license-active-at-setup"` \| `"store-url"` \| `"bcc-enabled?"` \| `"ee-openai-api-key"` \| `"openai-api-key"` \| `"openai-available-models"` \| `"openai-model"` \| `"openai-organization"` \| `"session-cookie-samesite"` \| `"slack-app-token"` \| `"slack-bug-report-channel"` \| `"slack-token"` \| `"slack-token-valid?"`, `unknown`\>\>; \} |
| `settings.settings` | [`SettingDefinition`](internal.md#settingdefinitionkey)\< \| `"enable-xrays"` \| `"version"` \| `"admin-email"` \| `"email-smtp-host"` \| `"email-smtp-port"` \| `"email-smtp-security"` \| `"email-smtp-username"` \| `"email-smtp-password"` \| `"enable-embedding"` \| `"enable-embedding-static"` \| `"enable-embedding-sdk"` \| `"enable-embedding-interactive"` \| `"enable-nested-queries"` \| `"enable-public-sharing"` \| `"example-dashboard-id"` \| `"instance-creation"` \| `"read-only-mode"` \| `"search-typeahead-enabled"` \| `"show-homepage-data"` \| `"show-homepage-pin-message"` \| `"show-homepage-xrays"` \| `"site-name"` \| `"site-uuid"` \| `"subscription-allowed-domains"` \| `"uploads-settings"` \| `"user-visibility"` \| `"query-analysis-enabled"` \| `"allowed-iframe-hosts"` \| `"anon-tracking-enabled"` \| `"application-font"` \| `"application-font-files"` \| `"application-name"` \| `"application-favicon-url"` \| `"available-fonts"` \| `"available-locales"` \| `"bug-reporting-enabled"` \| `"check-for-updates"` \| `"cloud-gateway-ips"` \| `"custom-formatting"` \| `"custom-homepage"` \| `"custom-homepage-dashboard"` \| `"ee-ai-features-enabled"` \| `"email-configured?"` \| `"embedding-app-origin"` \| `"embedding-app-origins-sdk"` \| `"embedding-app-origins-interactive"` \| `"enable-enhancements?"` \| `"enable-password-login"` \| `"enable-pivoted-exports"` \| `"engines"` \| `"google-auth-client-id"` \| `"google-auth-enabled"` \| `"gsheets"` \| `"has-user-setup"` \| `"help-link"` \| `"help-link-custom-destination"` \| `"humanization-strategy"` \| `"hide-embed-branding?"` \| `"is-hosted?"` \| `"ldap-configured?"` \| `"ldap-enabled"` \| `"ldap-port"` \| `"ldap-group-membership-filter"` \| `"loading-message"` \| `"map-tile-server-url"` \| `"native-query-autocomplete-match-style"` \| `"other-sso-enabled?"` \| `"password-complexity"` \| `"persisted-models-enabled"` \| `"persisted-model-refresh-cron-schedule"` \| `"report-timezone-long"` \| `"report-timezone-short"` \| `"session-cookies"` \| `"setup-token"` \| `"show-metabase-links"` \| `"show-metabot"` \| `"show-google-sheets-integration"` \| `"site-locale"` \| `"site-url"` \| `"snowplow-enabled"` \| `"snowplow-url"` \| `"start-of-week"` \| `"token-features"` \| `"update-channel"` \| `"version-info-last-checked"` \| `"airgap-enabled"` \| `"dismissed-collection-cleanup-banner"` \| `"dismissed-browse-models-banner"` \| `"dismissed-custom-dashboard-toast"` \| `"dismissed-onboarding-sidebar-link"` \| `"last-used-native-database-id"` \| `"notebook-native-preview-shown"` \| `"notebook-native-preview-sidebar-width"` \| `"expand-browse-in-nav"` \| `"expand-bookmarks-in-nav"` \| `"browse-filter-only-verified-models"` \| `"browse-filter-only-verified-metrics"` \| `"show-updated-permission-modal"` \| `"show-updated-permission-banner"` \| `"trial-banner-dismissal-timestamp"` \| `"active-users-count"` \| `"deprecation-notice-version"` \| `"embedding-secret-key"` \| `"query-caching-min-ttl"` \| `"query-caching-ttl-ratio"` \| `"google-auth-auto-create-accounts-domain"` \| `"google-auth-configured"` \| `"jwt-configured"` \| `"jwt-enabled"` \| `"premium-embedding-token"` \| `"saml-configured"` \| `"saml-enabled"` \| `"saml-identity-provider-uri"` \| `"show-database-syncing-modal"` \| `"token-status"` \| `"version-info"` \| `"last-acknowledged-version"` \| `"show-static-embed-terms"` \| `"show-sdk-embed-terms"` \| `"embedding-homepage"` \| `"setup-license-active-at-setup"` \| `"store-url"` \| `"bcc-enabled?"` \| `"ee-openai-api-key"` \| `"openai-api-key"` \| `"openai-available-models"` \| `"openai-model"` \| `"openai-organization"` \| `"session-cookie-samesite"` \| `"slack-app-token"` \| `"slack-bug-report-channel"` \| `"slack-token"` \| `"slack-token-valid?"`\>[] |
| `settings.warnings` | `Partial`\<`Record`\< \| `"enable-xrays"` \| `"version"` \| `"admin-email"` \| `"email-smtp-host"` \| `"email-smtp-port"` \| `"email-smtp-security"` \| `"email-smtp-username"` \| `"email-smtp-password"` \| `"enable-embedding"` \| `"enable-embedding-static"` \| `"enable-embedding-sdk"` \| `"enable-embedding-interactive"` \| `"enable-nested-queries"` \| `"enable-public-sharing"` \| `"example-dashboard-id"` \| `"instance-creation"` \| `"read-only-mode"` \| `"search-typeahead-enabled"` \| `"show-homepage-data"` \| `"show-homepage-pin-message"` \| `"show-homepage-xrays"` \| `"site-name"` \| `"site-uuid"` \| `"subscription-allowed-domains"` \| `"uploads-settings"` \| `"user-visibility"` \| `"query-analysis-enabled"` \| `"allowed-iframe-hosts"` \| `"anon-tracking-enabled"` \| `"application-font"` \| `"application-font-files"` \| `"application-name"` \| `"application-favicon-url"` \| `"available-fonts"` \| `"available-locales"` \| `"bug-reporting-enabled"` \| `"check-for-updates"` \| `"cloud-gateway-ips"` \| `"custom-formatting"` \| `"custom-homepage"` \| `"custom-homepage-dashboard"` \| `"ee-ai-features-enabled"` \| `"email-configured?"` \| `"embedding-app-origin"` \| `"embedding-app-origins-sdk"` \| `"embedding-app-origins-interactive"` \| `"enable-enhancements?"` \| `"enable-password-login"` \| `"enable-pivoted-exports"` \| `"engines"` \| `"google-auth-client-id"` \| `"google-auth-enabled"` \| `"gsheets"` \| `"has-user-setup"` \| `"help-link"` \| `"help-link-custom-destination"` \| `"humanization-strategy"` \| `"hide-embed-branding?"` \| `"is-hosted?"` \| `"ldap-configured?"` \| `"ldap-enabled"` \| `"ldap-port"` \| `"ldap-group-membership-filter"` \| `"loading-message"` \| `"map-tile-server-url"` \| `"native-query-autocomplete-match-style"` \| `"other-sso-enabled?"` \| `"password-complexity"` \| `"persisted-models-enabled"` \| `"persisted-model-refresh-cron-schedule"` \| `"report-timezone-long"` \| `"report-timezone-short"` \| `"session-cookies"` \| `"setup-token"` \| `"show-metabase-links"` \| `"show-metabot"` \| `"show-google-sheets-integration"` \| `"site-locale"` \| `"site-url"` \| `"snowplow-enabled"` \| `"snowplow-url"` \| `"start-of-week"` \| `"token-features"` \| `"update-channel"` \| `"version-info-last-checked"` \| `"airgap-enabled"` \| `"dismissed-collection-cleanup-banner"` \| `"dismissed-browse-models-banner"` \| `"dismissed-custom-dashboard-toast"` \| `"dismissed-onboarding-sidebar-link"` \| `"last-used-native-database-id"` \| `"notebook-native-preview-shown"` \| `"notebook-native-preview-sidebar-width"` \| `"expand-browse-in-nav"` \| `"expand-bookmarks-in-nav"` \| `"browse-filter-only-verified-models"` \| `"browse-filter-only-verified-metrics"` \| `"show-updated-permission-modal"` \| `"show-updated-permission-banner"` \| `"trial-banner-dismissal-timestamp"` \| `"active-users-count"` \| `"deprecation-notice-version"` \| `"embedding-secret-key"` \| `"query-caching-min-ttl"` \| `"query-caching-ttl-ratio"` \| `"google-auth-auto-create-accounts-domain"` \| `"google-auth-configured"` \| `"jwt-configured"` \| `"jwt-enabled"` \| `"premium-embedding-token"` \| `"saml-configured"` \| `"saml-enabled"` \| `"saml-identity-provider-uri"` \| `"show-database-syncing-modal"` \| `"token-status"` \| `"version-info"` \| `"last-acknowledged-version"` \| `"show-static-embed-terms"` \| `"show-sdk-embed-terms"` \| `"embedding-homepage"` \| `"setup-license-active-at-setup"` \| `"store-url"` \| `"bcc-enabled?"` \| `"ee-openai-api-key"` \| `"openai-api-key"` \| `"openai-available-models"` \| `"openai-model"` \| `"openai-organization"` \| `"session-cookie-samesite"` \| `"slack-app-token"` \| `"slack-bug-report-channel"` \| `"slack-token"` \| `"slack-token-valid?"`, `unknown`\>\> |

***

## AppErrorDescriptor

### Properties

| Property | Type |
| ------ | ------ |
| <a id="context"></a> `context?` | `string` |
| <a id="data"></a> `data?` | \{ `error_code`: `string`; `message`: `string`; \} |
| `data.error_code` | `string` |
| `data.message?` | `string` |
| <a id="status"></a> `status` | `number` |

***

## AppState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="errorpage"></a> `errorPage` | `null` \| [`AppErrorDescriptor`](internal.md#apperrordescriptor) |
| <a id="isdndavailable"></a> `isDndAvailable` | `boolean` |
| <a id="iserrordiagnosticsopen"></a> `isErrorDiagnosticsOpen` | `boolean` |
| <a id="isnavbaropen"></a> `isNavbarOpen` | `boolean` |
| <a id="tempstorage"></a> `tempStorage` | [`TempStorage`](internal.md#tempstorage-1) |

***

## ArbitraryCustomDestinationClickBehavior

### Properties

| Property | Type |
| ------ | ------ |
| <a id="linktemplate"></a> `linkTemplate` | `string` |
| <a id="linktexttemplate"></a> `linkTextTemplate?` | `string` |
| <a id="linktype"></a> `linkType` | `"url"` |
| <a id="type-3"></a> `type` | `"link"` |

***

## AuthState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="loginpending"></a> `loginPending` | `boolean` |
| <a id="redirect"></a> `redirect` | `boolean` |

***

## BaseActionClickBehavior

### Extended by

- [`InsertActionClickBehavior`](internal.md#insertactionclickbehavior)
- [`UpdateActionClickBehavior`](internal.md#updateactionclickbehavior)
- [`DeleteActionClickBehavior`](internal.md#deleteactionclickbehavior)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="actiontype"></a> `actionType` | `string` |
| <a id="type-4"></a> `type` | `"action"` |

***

## BaseSidebarState

### Extended by

- [`ClickBehaviorSidebarState`](internal.md#clickbehaviorsidebarstate)
- [`EditParameterSidebarState`](internal.md#editparametersidebarstate)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="name-6"></a> `name?` | [`DashboardSidebarName`](internal.md#dashboardsidebarname) |
| <a id="props"></a> `props` | `Record`\<`string`, `unknown`\> & \{ `dashcardId`: `number`; \} |

***

## BaseSmartScalarComparison

### Extended by

- [`SmartScalarComparisonAnotherColumn`](internal.md#smartscalarcomparisonanothercolumn)
- [`SmartScalarComparisonPreviousValue`](internal.md#smartscalarcomparisonpreviousvalue)
- [`SmartScalarComparisonPreviousPeriod`](internal.md#smartscalarcomparisonpreviousperiod)
- [`SmartScalarComparisonPeriodsAgo`](internal.md#smartscalarcomparisonperiodsago)
- [`SmartScalarComparisonStaticNumber`](internal.md#smartscalarcomparisonstaticnumber)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-5"></a> `id` | `string` |
| <a id="type-5"></a> `type` | [`SmartScalarComparisonType`](internal.md#smartscalarcomparisontype) |

***

## BaseUser

### Extended by

- [`User`](internal.md#user-1)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="common_name"></a> `common_name` | `string` |
| <a id="date_joined"></a> `date_joined` | `string` |
| <a id="email"></a> `email` | `string` |
| <a id="first_login"></a> `first_login` | `string` |
| <a id="first_name"></a> `first_name` | `null` \| `string` |
| <a id="google_auth"></a> `google_auth` | `boolean` |
| <a id="id-6"></a> `id` | `number` |
| <a id="is_active"></a> `is_active` | `boolean` |
| <a id="is_qbnewb"></a> `is_qbnewb` | `boolean` |
| <a id="is_superuser"></a> `is_superuser` | `boolean` |
| <a id="last_login"></a> `last_login` | `string` |
| <a id="last_name"></a> `last_name` | `null` \| `string` |
| <a id="locale"></a> `locale` | `null` \| `string` |

***

## BinWidthBinningOptions

### Properties

| Property | Type |
| ------ | ------ |
| <a id="bin-width"></a> `bin-width` | `number` |
| <a id="strategy"></a> `strategy` | `"bin-width"` |

***

## CacheStrategyBase

### Extended by

- [`DoNotCacheStrategy`](internal.md#donotcachestrategy)
- [`AdaptiveStrategy`](internal.md#adaptivestrategy)
- [`DurationStrategy`](internal.md#durationstrategy)
- [`InheritStrategy`](internal.md#inheritstrategy)
- [`ScheduleStrategy`](internal.md#schedulestrategy)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="type-6"></a> `type` | [`CacheStrategyType`](internal.md#cachestrategytype) |

***

## Card\<Q\>

### Extends

- [`UnsavedCard`](internal.md#unsavedcardq)\<`Q`\>

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Q` *extends* [`DatasetQuery`](internal.md#datasetquery-3) | [`DatasetQuery`](internal.md#datasetquery-3) |

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="archived-1"></a> `archived` | `boolean` | - |
| <a id="average_query_time"></a> `average_query_time` | `null` \| `number` | - |
| <a id="based_on_upload"></a> `based_on_upload?` | `null` \| [`TableId`](internal.md#tableid-3) | - |
| <a id="cache_ttl-1"></a> `cache_ttl` | `null` \| `number` | - |
| <a id="can_delete"></a> `can_delete` | `boolean` | - |
| <a id="can_manage_db"></a> `can_manage_db` | `boolean` | - |
| <a id="can_restore"></a> `can_restore` | `boolean` | - |
| <a id="can_write"></a> `can_write` | `boolean` | - |
| <a id="collection"></a> `collection?` | `null` \| [`Collection`](internal.md#collection-1) | - |
| <a id="collection_id"></a> `collection_id` | `null` \| `number` | - |
| <a id="collection_position"></a> `collection_position` | `null` \| `number` | - |
| <a id="created_at-2"></a> `created_at` | `string` | - |
| <a id="creator"></a> `creator?` | [`CreatorInfo`](internal.md#creatorinfo) | - |
| <a id="dashboard"></a> `dashboard` | \| `null` \| `Pick`\<[`Dashboard`](internal.md#dashboard-1), `"id"` \| `"name"`\> | - |
| <a id="dashboard_count"></a> `dashboard_count` | `null` \| `number` | - |
| <a id="dashboard_id"></a> `dashboard_id` | `null` \| [`DashboardId`](internal.md#dashboardid-4) | - |
| <a id="dashboardid"></a> `dashboardId?` | [`DashboardId`](internal.md#dashboardid-4) | [`UnsavedCard`](internal.md#unsavedcardq).[`dashboardId`](internal.md#dashboardid-3) |
| <a id="dashcardid"></a> `dashcardId?` | `number` | [`UnsavedCard`](internal.md#unsavedcardq).[`dashcardId`](internal.md#dashcardid-1) |
| <a id="database_id"></a> `database_id?` | `number` | - |
| <a id="dataset_query"></a> `dataset_query` | `Q` | [`UnsavedCard`](internal.md#unsavedcardq).[`dataset_query`](internal.md#dataset_query-2) |
| <a id="description-4"></a> `description` | `null` \| `string` | - |
| <a id="display-1"></a> `display` | [`VisualizationDisplay`](internal.md#visualizationdisplay) | [`UnsavedCard`](internal.md#unsavedcardq).[`display`](internal.md#display-3) |
| <a id="embedding_params"></a> `embedding_params` | `null` \| [`EmbeddingParameters`](internal.md#embeddingparameters) | - |
| <a id="enable_embedding"></a> `enable_embedding` | `boolean` | - |
| <a id="entity_id"></a> `entity_id` | [`NanoID`](internal.md#nanoid) | - |
| <a id="id-7"></a> `id` | `number` | - |
| <a id="initially_published_at"></a> `initially_published_at` | `null` \| `string` | - |
| <a id="last_query_start"></a> `last_query_start` | `null` \| `string` | - |
| <a id="last-edit-info"></a> `last-edit-info?` | [`LastEditInfo`](internal.md#lasteditinfo) | - |
| <a id="moderation_reviews"></a> `moderation_reviews?` | [`ModerationReview`](internal.md#moderationreview)[] | - |
| <a id="name-7"></a> `name` | `string` | - |
| <a id="original_card_id"></a> `original_card_id?` | `number` | [`UnsavedCard`](internal.md#unsavedcardq).[`original_card_id`](internal.md#original_card_id-1) |
| <a id="parameters"></a> `parameters?` | [`Parameter`](internal.md#parameter)[] | [`UnsavedCard`](internal.md#unsavedcardq).[`parameters`](internal.md#parameters-7) |
| <a id="persisted"></a> `persisted?` | `boolean` | - |
| <a id="public_uuid"></a> `public_uuid` | `null` \| `string` | - |
| <a id="query_average_duration"></a> `query_average_duration?` | `null` \| `number` | - |
| <a id="result_metadata"></a> `result_metadata` | [`Field`](internal.md#field-5)[] | - |
| <a id="type-7"></a> `type` | [`CardType`](internal.md#cardtype) | - |
| <a id="updated_at-2"></a> `updated_at` | `string` | - |
| <a id="visualization_settings"></a> `visualization_settings` | [`VisualizationSettings`](internal.md#visualizationsettings) | [`UnsavedCard`](internal.md#unsavedcardq).[`visualization_settings`](internal.md#visualization_settings-1) |

***

## ClickBehaviorDimensionTarget

### Properties

| Property | Type |
| ------ | ------ |
| <a id="dimension-1"></a> `dimension` | \| \[`"dimension"`, `undefined` \| `null` \| [`FieldReference`](internal.md#fieldreference)\] \| \[`"dimension"`, `undefined` \| `null` \| [`FieldReference`](internal.md#fieldreference), [`DimensionTargetOptions`](internal.md#dimensiontargetoptions)\] |
| <a id="id-8"></a> `id` | `string` |
| <a id="type-8"></a> `type` | `"dimension"` |

***

## ClickBehaviorParameterTarget

### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-9"></a> `id` | `string` |
| <a id="type-9"></a> `type` | `"parameter"` |

***

## ClickBehaviorSidebarState

### Extends

- [`BaseSidebarState`](internal.md#basesidebarstate)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="name-8"></a> `name` | `"clickBehavior"` | [`BaseSidebarState`](internal.md#basesidebarstate).[`name`](internal.md#name-6) |
| <a id="props-1"></a> `props` | [`ClickBehaviorSidebarProps`](internal.md#clickbehaviorsidebarprops) | [`BaseSidebarState`](internal.md#basesidebarstate).[`props`](internal.md#props) |

***

## ClickBehaviorSource

### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-10"></a> `id` | `string` |
| <a id="name-9"></a> `name` | `string` |
| <a id="type-10"></a> `type` | `"column"` \| `"parameter"` |

***

## ClickBehaviorVariableTarget

### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-11"></a> `id` | `string` |
| <a id="type-11"></a> `type` | `"variable"` |

***

## ClickObject

### Properties

| Property | Type |
| ------ | ------ |
| <a id="cardid"></a> `cardId?` | `number` |
| <a id="column"></a> `column?` | [`DatasetColumn`](internal.md#datasetcolumn) |
| <a id="columnshortcuts"></a> `columnShortcuts?` | `boolean` |
| <a id="data-1"></a> `data?` | [`ClickObjectDataRow`](internal.md#clickobjectdatarow)[] |
| <a id="dimensions-4"></a> `dimensions?` | [`ClickObjectDimension`](internal.md#clickobjectdimension)[] |
| <a id="element"></a> `element?` | `Element` |
| <a id="event"></a> `event?` | `MouseEvent` |
| <a id="extradata"></a> `extraData?` | `Record`\<`string`, `unknown`\> |
| <a id="origin-1"></a> `origin?` | \{ `cols`: [`DatasetColumn`](internal.md#datasetcolumn)[]; `row`: [`RowValue`](internal.md#rowvalue); \} |
| `origin.cols` | [`DatasetColumn`](internal.md#datasetcolumn)[] |
| `origin.row` | [`RowValue`](internal.md#rowvalue) |
| <a id="seriesindex"></a> `seriesIndex?` | `number` |
| <a id="settings-4"></a> `settings?` | `Record`\<`string`, `unknown`\> |
| <a id="value"></a> `value?` | [`RowValue`](internal.md#rowvalue) |

***

## ClickObjectDataRow

### Properties

| Property | Type |
| ------ | ------ |
| <a id="col"></a> `col` | `null` \| [`DatasetColumn`](internal.md#datasetcolumn) |
| <a id="value-1"></a> `value` | [`RowValue`](internal.md#rowvalue) |

***

## ClickObjectDimension

### Properties

| Property | Type |
| ------ | ------ |
| <a id="column-1"></a> `column` | [`DatasetColumn`](internal.md#datasetcolumn) |
| <a id="value-2"></a> `value` | [`RowValue`](internal.md#rowvalue) |

***

## Collection

### Properties

| Property | Type |
| ------ | ------ |
| <a id="archived-2"></a> `archived` | `boolean` |
| <a id="authority_level"></a> `authority_level?` | [`CollectionAuthorityLevel`](internal.md#collectionauthoritylevel) |
| <a id="below"></a> `below?` | [`CollectionContentModel`](internal.md#collectioncontentmodel)[] |
| <a id="can_delete-1"></a> `can_delete` | `boolean` |
| <a id="can_restore-1"></a> `can_restore` | `boolean` |
| <a id="can_write-1"></a> `can_write` | `boolean` |
| <a id="children"></a> `children?` | [`Collection`](internal.md#collection-1)[] |
| <a id="description-5"></a> `description` | `null` \| `string` |
| <a id="effective_ancestors"></a> `effective_ancestors?` | [`CollectionEssentials`](internal.md#collectionessentials)[] |
| <a id="effective_location"></a> `effective_location?` | `string` |
| <a id="entity_id-1"></a> `entity_id?` | `string` |
| <a id="here"></a> `here?` | [`CollectionContentModel`](internal.md#collectioncontentmodel)[] |
| <a id="id-12"></a> `id` | [`CollectionId`](internal.md#collectionid) |
| <a id="is_personal"></a> `is_personal?` | `boolean` |
| <a id="is_sample-1"></a> `is_sample?` | `boolean` |
| <a id="location"></a> `location` | `null` \| `string` |
| <a id="name-10"></a> `name` | `string` |
| <a id="originalname"></a> `originalName?` | `string` |
| <a id="parent_id"></a> `parent_id?` | `null` \| [`CollectionId`](internal.md#collectionid) |
| <a id="path"></a> `path?` | [`CollectionId`](internal.md#collectionid)[] |
| <a id="personal_owner_id"></a> `personal_owner_id?` | `number` |
| <a id="slug"></a> `slug?` | `string` |
| <a id="type-12"></a> `type?` | `null` \| `"trash"` \| `"instance-analytics"` |

***

## CollectionItem

### Properties

| Property | Type |
| ------ | ------ |
| <a id="archived-3"></a> `archived` | `boolean` |
| <a id="authority_level-1"></a> `authority_level?` | [`CollectionAuthorityLevel`](internal.md#collectionauthoritylevel) |
| <a id="based_on_upload-1"></a> `based_on_upload?` | `null` \| [`TableId`](internal.md#tableid-3) |
| <a id="below-1"></a> `below?` | ( \| `"card"` \| `"metric"` \| `"snippet"` \| `"dashboard"` \| `"collection"` \| `"dataset"` \| `"indexed-entity"`)[] |
| <a id="can_delete-2"></a> `can_delete?` | `boolean` |
| <a id="can_restore-2"></a> `can_restore?` | `boolean` |
| <a id="can_write-2"></a> `can_write?` | `boolean` |
| <a id="collection-2"></a> `collection?` | `null` \| [`Collection`](internal.md#collection-1) |
| <a id="collection_id-1"></a> `collection_id` | `null` \| [`CollectionId`](internal.md#collectionid) |
| <a id="collection_position-1"></a> `collection_position?` | `null` \| `number` |
| <a id="collection_preview"></a> `collection_preview?` | `null` \| `boolean` |
| <a id="copy"></a> `copy?` | `boolean` |
| <a id="dashboard_count-1"></a> `dashboard_count?` | `null` \| `number` |
| <a id="database_id-1"></a> `database_id?` | `number` |
| <a id="description-6"></a> `description` | `null` \| `string` |
| <a id="display-2"></a> `display?` | [`VisualizationDisplay`](internal.md#visualizationdisplay) |
| <a id="effective_location-1"></a> `effective_location?` | `string` |
| <a id="fully_parameterized"></a> `fully_parameterized?` | `null` \| `boolean` |
| <a id="geticon"></a> `getIcon` | () => [`IconProps`](internal.md#iconprops) |
| <a id="geturl"></a> `getUrl` | (`opts`?: `Record`\<`string`, `unknown`\>) => `string` |
| <a id="here-1"></a> `here?` | ( \| `"card"` \| `"metric"` \| `"snippet"` \| `"dashboard"` \| `"collection"` \| `"dataset"` \| `"indexed-entity"`)[] |
| <a id="id-13"></a> `id` | `number` |
| <a id="last-edit-info-1"></a> `last-edit-info?` | [`LastEditInfo`](internal.md#lasteditinfo) |
| <a id="location-1"></a> `location?` | `string` |
| <a id="model"></a> `model` | \| `"card"` \| `"metric"` \| `"snippet"` \| `"dashboard"` \| `"collection"` \| `"dataset"` \| `"indexed-entity"` |
| <a id="moderated_status"></a> `moderated_status?` | `string` |
| <a id="name-11"></a> `name` | `string` |
| <a id="personal_owner_id-1"></a> `personal_owner_id?` | `number` |
| <a id="setarchived"></a> `setArchived?` | (`isArchived`: `boolean`, `opts`?: `Record`\<`string`, `unknown`\>) => `Promise`\<`void`\> |
| <a id="setcollection"></a> `setCollection?` | (`collection`: \| `Pick`\<[`Dashboard`](internal.md#dashboard-1), `"id"`\> \| `Pick`\<[`Collection`](internal.md#collection-1), `"id"`\>) => `void` |
| <a id="setcollectionpreview"></a> `setCollectionPreview?` | (`isEnabled`: `boolean`) => `void` |
| <a id="setpinned"></a> `setPinned?` | (`isPinned`: `boolean`) => `void` |
| <a id="type-13"></a> `type?` | \| [`CardType`](internal.md#cardtype) \| [`CollectionType`](internal.md#collectiontype) |

***

## ColumnSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="column_title"></a> `column_title?` | `string` |
| <a id="currency"></a> `currency?` | `string` |
| <a id="number_separators"></a> `number_separators?` | `string` |

***

## CreateDashboardProperties

### Properties

| Property | Type |
| ------ | ------ |
| <a id="collection_id-2"></a> `collection_id` | [`CollectionId`](internal.md#collectionid) |
| <a id="description-7"></a> `description` | `null` \| `string` |
| <a id="name-12"></a> `name` | `string` |

***

## CrossFilterClickBehavior

### Properties

| Property | Type |
| ------ | ------ |
| <a id="parametermapping"></a> `parameterMapping?` | [`ClickBehaviorParameterMapping`](internal.md#clickbehaviorparametermapping) |
| <a id="type-14"></a> `type` | `"crossfilter"` |

***

## CurrencyFormattingSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="currency-1"></a> `currency?` | `string` |
| <a id="currency_in_header"></a> `currency_in_header?` | `boolean` |
| <a id="currency_style"></a> `currency_style?` | `string` |

***

## Dashboard

### Properties

| Property | Type |
| ------ | ------ |
| <a id="archived-4"></a> `archived` | `boolean` |
| <a id="auto_apply_filters"></a> `auto_apply_filters` | `boolean` |
| <a id="cache_ttl-2"></a> `cache_ttl` | `null` \| `number` |
| <a id="can_delete-3"></a> `can_delete` | `boolean` |
| <a id="can_restore-3"></a> `can_restore` | `boolean` |
| <a id="can_write-3"></a> `can_write` | `boolean` |
| <a id="collection-3"></a> `collection?` | `null` \| [`Collection`](internal.md#collection-1) |
| <a id="collection_authority_level"></a> `collection_authority_level?` | [`CollectionAuthorityLevel`](internal.md#collectionauthoritylevel) |
| <a id="collection_id-3"></a> `collection_id` | `null` \| [`CollectionId`](internal.md#collectionid) |
| <a id="created_at-3"></a> `created_at` | `string` |
| <a id="creator_id-1"></a> `creator_id` | `number` |
| <a id="dashcards"></a> `dashcards` | [`DashboardCard`](internal.md#dashboardcard)[] |
| <a id="description-8"></a> `description` | `null` \| `string` |
| <a id="embedding_params-1"></a> `embedding_params?` | `null` \| [`EmbeddingParameters`](internal.md#embeddingparameters) |
| <a id="enable_embedding-1"></a> `enable_embedding` | `boolean` |
| <a id="entity_id-2"></a> `entity_id` | [`NanoID`](internal.md#nanoid) |
| <a id="id-14"></a> `id` | [`DashboardId`](internal.md#dashboardid-4) |
| <a id="initially_published_at-1"></a> `initially_published_at` | `null` \| `string` |
| <a id="last_used_param_values"></a> `last_used_param_values` | `Record`\<`string`, `null` \| `string` \| `number` \| `boolean` \| `string`[] \| `number`[]\> |
| <a id="last-edit-info-2"></a> `last-edit-info` | \{ `email`: `string`; `first_name`: `string`; `id`: `number`; `last_name`: `string`; `timestamp`: `string`; \} |
| `last-edit-info.email` | `string` |
| `last-edit-info.first_name` | `string` |
| `last-edit-info.id` | `number` |
| `last-edit-info.last_name` | `string` |
| `last-edit-info.timestamp` | `string` |
| <a id="model-1"></a> `model?` | `string` |
| <a id="moderation_reviews-1"></a> `moderation_reviews` | [`ModerationReview`](internal.md#moderationreview)[] |
| <a id="name-13"></a> `name` | `string` |
| <a id="parameters-1"></a> `parameters?` | `null` \| [`Parameter`](internal.md#parameter)[] |
| <a id="point_of_interest"></a> `point_of_interest?` | `null` \| `string` |
| <a id="public_uuid-1"></a> `public_uuid` | `null` \| `string` |
| <a id="show_in_getting_started"></a> `show_in_getting_started?` | `null` \| `boolean` |
| <a id="tabs"></a> `tabs?` | [`DashboardTab`](internal.md#dashboardtab)[] |
| <a id="updated_at-3"></a> `updated_at` | `string` |
| <a id="width"></a> `width` | [`DashboardWidth`](internal.md#dashboardwidth) |

***

## DashboardCustomDestinationClickBehavior

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="linktype-1"></a> `linkType` | `"dashboard"` | - |
| <a id="parametermapping-1"></a> `parameterMapping?` | [`ClickBehaviorParameterMapping`](internal.md#clickbehaviorparametermapping) | - |
| <a id="tabid"></a> `tabId?` | `number` | tabId will be undefined when user edits click behavior that was created before we supported links to dashboard tabs. |
| <a id="targetid"></a> `targetId?` | [`DashboardId`](internal.md#dashboardid-4) | - |
| <a id="type-15"></a> `type` | `"link"` | - |

***

## DashboardState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="autoapplyfilters"></a> `autoApplyFilters` | \{ `toastDashboardId`: `null` \| `number`; `toastId`: `null` \| `number`; \} |
| `autoApplyFilters.toastDashboardId` | `null` \| `number` |
| `autoApplyFilters.toastId` | `null` \| `number` |
| <a id="dashboardid-1"></a> `dashboardId` | `null` \| [`DashboardId`](internal.md#dashboardid-4) |
| <a id="dashboards"></a> `dashboards` | `Record`\<[`DashboardId`](internal.md#dashboardid-4), [`StoreDashboard`](internal.md#storedashboard)\> |
| <a id="dashcarddata"></a> `dashcardData` | [`DashCardDataMap`](internal.md#dashcarddatamap) |
| <a id="dashcards-1"></a> `dashcards` | `Record`\<`number`, [`StoreDashcard`](internal.md#storedashcard)\> |
| <a id="draftparametervalues"></a> `draftParameterValues` | `Record`\<`string`, `null` \| [`ParameterValueOrArray`](internal.md#parametervalueorarray)\> |
| <a id="editingdashboard"></a> `editingDashboard` | `null` \| [`Dashboard`](internal.md#dashboard-1) |
| <a id="isaddparameterpopoveropen"></a> `isAddParameterPopoverOpen` | `boolean` |
| <a id="isnavigatingbacktodashboard"></a> `isNavigatingBackToDashboard` | `boolean` |
| <a id="loadingcontrols"></a> `loadingControls` | [`DashboardLoadingControls`](internal.md#dashboardloadingcontrols) |
| <a id="loadingdashcards"></a> `loadingDashCards` | [`DashboardCardsLoadingState`](internal.md#dashboardcardsloadingstate) |
| <a id="missingactionparameters"></a> `missingActionParameters` | `unknown` |
| <a id="parametervalues"></a> `parameterValues` | `Record`\<`string`, [`ParameterValueOrArray`](internal.md#parametervalueorarray)\> |
| <a id="selectedtabid"></a> `selectedTabId` | [`SelectedTabId`](internal.md#selectedtabid-1) |
| <a id="sidebar"></a> `sidebar` | [`DashboardSidebarState`](internal.md#dashboardsidebarstate) |
| <a id="slowcards"></a> `slowCards` | `Record`\<`number`, `boolean`\> |
| <a id="tabdeletions"></a> `tabDeletions` | `Record`\<`number`, [`TabDeletion`](internal.md#tabdeletion)\> |
| <a id="theme"></a> `theme` | [`DisplayTheme`](internal.md#displaytheme) |

***

## Database

### Extends

- [`DatabaseData`](internal.md#databasedata)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="auto_run_queries-1"></a> `auto_run_queries` | `null` \| `boolean` | - | [`DatabaseData`](internal.md#databasedata).[`auto_run_queries`](internal.md#auto_run_queries-2) |
| <a id="cache_ttl-3"></a> `cache_ttl` | `null` \| `number` | - | [`DatabaseData`](internal.md#databasedata).[`cache_ttl`](internal.md#cache_ttl-4) |
| <a id="can_upload-1"></a> `can_upload` | `boolean` | - | - |
| <a id="can-manage-1"></a> `can-manage?` | `boolean` | - | - |
| <a id="caveats-2"></a> `caveats?` | `string` | - | - |
| <a id="created_at-4"></a> `created_at` | `string` | - | - |
| <a id="creator_id-2"></a> `creator_id?` | `number` | - | - |
| <a id="details-1"></a> `details?` | `Record`\<`string`, `unknown`\> | - | [`DatabaseData`](internal.md#databasedata).[`details`](internal.md#details-2) |
| <a id="engine-1"></a> `engine` | `undefined` \| `string` | - | [`DatabaseData`](internal.md#databasedata).[`engine`](internal.md#engine-2) |
| <a id="features-1"></a> `features?` | [`DatabaseFeature`](internal.md#databasefeature)[] | - | - |
| <a id="id-15"></a> `id` | `number` | [`DatabaseData`](internal.md#databasedata).[`id`](internal.md#id-16) | - |
| <a id="initial_sync_status-2"></a> `initial_sync_status` | [`LongTaskStatus`](internal.md#longtaskstatus) | - | - |
| <a id="is_attached_dwh-1"></a> `is_attached_dwh?` | `boolean` | - | - |
| <a id="is_audit-1"></a> `is_audit?` | `boolean` | - | - |
| <a id="is_full_sync-1"></a> `is_full_sync` | `boolean` | - | [`DatabaseData`](internal.md#databasedata).[`is_full_sync`](internal.md#is_full_sync-2) |
| <a id="is_on_demand-1"></a> `is_on_demand` | `boolean` | - | [`DatabaseData`](internal.md#databasedata).[`is_on_demand`](internal.md#is_on_demand-2) |
| <a id="is_sample-2"></a> `is_sample` | `boolean` | - | [`DatabaseData`](internal.md#databasedata).[`is_sample`](internal.md#is_sample-3) |
| <a id="is_saved_questions-1"></a> `is_saved_questions` | `boolean` | - | - |
| <a id="name-14"></a> `name` | `string` | - | [`DatabaseData`](internal.md#databasedata).[`name`](internal.md#name-15) |
| <a id="native_permissions-1"></a> `native_permissions` | `"write"` \| `"none"` | - | - |
| <a id="points_of_interest-2"></a> `points_of_interest?` | `string` | - | - |
| <a id="refingerprint-1"></a> `refingerprint` | `null` \| `boolean` | - | [`DatabaseData`](internal.md#databasedata).[`refingerprint`](internal.md#refingerprint-2) |
| <a id="schedules-1"></a> `schedules` | [`DatabaseSchedules`](internal.md#databaseschedules) | - | [`DatabaseData`](internal.md#databasedata).[`schedules`](internal.md#schedules-2) |
| <a id="settings-5"></a> `settings?` | `null` \| [`DatabaseSettings`](internal.md#databasesettings) | - | [`DatabaseData`](internal.md#databasedata).[`settings`](internal.md#settings-6) |
| <a id="tables-5"></a> `tables?` | [`Table`](internal.md#table-12)[] | - | - |
| <a id="timezone-1"></a> `timezone?` | `string` | - | - |
| <a id="updated_at-4"></a> `updated_at` | `string` | - | - |
| <a id="uploads_enabled-1"></a> `uploads_enabled` | `boolean` | - | - |
| <a id="uploads_schema_name-1"></a> `uploads_schema_name` | `null` \| `string` | - | - |
| <a id="uploads_table_prefix-1"></a> `uploads_table_prefix` | `null` \| `string` | - | - |

***

## DatabaseData

### Extended by

- [`Database`](internal.md#database-3)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="auto_run_queries-2"></a> `auto_run_queries` | `null` \| `boolean` |
| <a id="cache_ttl-4"></a> `cache_ttl` | `null` \| `number` |
| <a id="details-2"></a> `details?` | `Record`\<`string`, `unknown`\> |
| <a id="engine-2"></a> `engine` | `undefined` \| `string` |
| <a id="id-16"></a> `id?` | `number` |
| <a id="is_full_sync-2"></a> `is_full_sync` | `boolean` |
| <a id="is_on_demand-2"></a> `is_on_demand` | `boolean` |
| <a id="is_sample-3"></a> `is_sample` | `boolean` |
| <a id="name-15"></a> `name` | `string` |
| <a id="refingerprint-2"></a> `refingerprint` | `null` \| `boolean` |
| <a id="schedules-2"></a> `schedules` | [`DatabaseSchedules`](internal.md#databaseschedules) |
| <a id="settings-6"></a> `settings?` | `null` \| [`DatabaseSettings`](internal.md#databasesettings) |

***

## DatabaseSchedules

### Properties

| Property | Type |
| ------ | ------ |
| <a id="cache_field_values"></a> `cache_field_values?` | `null` \| [`ScheduleSettings`](internal.md#schedulesettings) |
| <a id="metadata_sync"></a> `metadata_sync?` | [`ScheduleSettings`](internal.md#schedulesettings) |

***

## Dataset

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="average_execution_time"></a> `average_execution_time?` | `number` | In milliseconds |
| <a id="cached"></a> `cached?` | `string` | A date in ISO 8601 format |
| <a id="context-1"></a> `context?` | `string` | - |
| <a id="data-2"></a> `data` | [`DatasetData`](internal.md#datasetdata) | - |
| <a id="database_id-2"></a> `database_id` | `number` | - |
| <a id="error"></a> `error?` | \| `string` \| \{ `data`: `string`; `status`: `number`; \} | - |
| <a id="error_is_curated"></a> `error_is_curated?` | `boolean` | - |
| <a id="error_type"></a> `error_type?` | `string` | - |
| <a id="json_query"></a> `json_query?` | [`JsonQuery`](internal.md#jsonquery) | - |
| <a id="row_count"></a> `row_count` | `number` | - |
| <a id="running_time"></a> `running_time` | `number` | - |
| <a id="started_at"></a> `started_at?` | `string` | A date in ISO 8601 format |
| <a id="status-1"></a> `status?` | `string` | - |

***

## DatasetColumn

### Properties

| Property | Type |
| ------ | ------ |
| <a id="aggregation_index"></a> `aggregation_index?` | `number` |
| <a id="aggregation_type"></a> `aggregation_type?` | [`AggregationType`](internal.md#aggregationtype) |
| <a id="base_type-1"></a> `base_type?` | `string` |
| <a id="binning_info"></a> `binning_info?` | `null` \| [`BinningMetadata`](internal.md#binningmetadata) |
| <a id="coercion_strategy-1"></a> `coercion_strategy?` | `null` \| `string` |
| <a id="description-9"></a> `description?` | `null` \| `string` |
| <a id="display_name-2"></a> `display_name` | `string` |
| <a id="effective_type-1"></a> `effective_type?` | `string` |
| <a id="expression_name"></a> `expression_name?` | `any` |
| <a id="field_ref"></a> `field_ref?` | [`DimensionReference`](internal.md#dimensionreference) |
| <a id="fingerprint-1"></a> `fingerprint?` | `null` \| [`FieldFingerprint`](internal.md#fieldfingerprint) |
| <a id="fk_target_field_id-1"></a> `fk_target_field_id?` | `null` \| `number` |
| <a id="id-17"></a> `id?` | `number` |
| <a id="name-16"></a> `name` | `string` |
| <a id="remapped_from"></a> `remapped_from?` | `string` |
| <a id="remapped_to"></a> `remapped_to?` | `string` |
| <a id="remapped_to_column"></a> `remapped_to_column?` | [`DatasetColumn`](internal.md#datasetcolumn) |
| <a id="semantic_type-1"></a> `semantic_type?` | `null` \| `string` |
| <a id="settings-7"></a> `settings?` | `Record`\<`string`, `any`\> |
| <a id="source-1"></a> `source` | `string` |
| <a id="table_id-2"></a> `table_id?` | [`TableId`](internal.md#tableid-3) |
| <a id="unit"></a> `unit?` | [`DatetimeUnit`](internal.md#datetimeunit) |
| <a id="visibility_type-2"></a> `visibility_type?` | [`FieldVisibilityType`](internal.md#fieldvisibilitytype) |

***

## DatasetData

### Properties

| Property | Type |
| ------ | ------ |
| <a id="cols"></a> `cols` | [`DatasetColumn`](internal.md#datasetcolumn)[] |
| <a id="download_perms"></a> `download_perms?` | [`DownloadPermission`](internal.md#downloadpermission) |
| <a id="insights"></a> `insights?` | `null` \| [`Insight`](internal.md#insight)[] |
| <a id="is_sandboxed"></a> `is_sandboxed?` | `boolean` |
| <a id="native_form"></a> `native_form` | \{ `query`: `string`; \} |
| `native_form.query` | `string` |
| <a id="requested_timezone"></a> `requested_timezone?` | `string` |
| <a id="results_metadata"></a> `results_metadata` | [`ResultsMetadata`](internal.md#resultsmetadata) |
| <a id="results_timezone"></a> `results_timezone?` | `string` |
| <a id="rows"></a> `rows` | [`RowValues`](internal.md#rowvalues)[] |
| <a id="rows_truncated"></a> `rows_truncated` | `number` |

***

## DateFormattingSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="date_abbreviate"></a> `date_abbreviate?` | `boolean` |
| <a id="date_separator"></a> `date_separator?` | `string` |
| <a id="date_style"></a> `date_style?` | `string` |
| <a id="time_style"></a> `time_style?` | `string` |

***

## DefaultBinningOptions

### Properties

| Property | Type |
| ------ | ------ |
| <a id="strategy-1"></a> `strategy` | `"default"` |

***

## Deferred\<T\>

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

### Properties

| Property | Type |
| ------ | ------ |
| <a id="promise"></a> `promise` | `Promise`\<`T`\> |

***

## DeleteActionClickBehavior

### Extends

- [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="actiontype-1"></a> `actionType` | `"delete"` | [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior).[`actionType`](internal.md#actiontype) | - |
| <a id="objectdetaildashcardid"></a> `objectDetailDashCardId` | `number` | - | - |
| <a id="type-16"></a> `type` | `"action"` | - | [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior).[`type`](internal.md#type-4) |

***

## DimensionFK

### Properties

| Property | Type |
| ------ | ------ |
| <a id="dimensions-5"></a> `dimensions` | [`Dimension`](internal.md#dimension)[] |
| <a id="field-4"></a> `field` | [`Field`](internal.md#field-1) |
| <a id="icon-2"></a> `icon?` | `string` |
| <a id="name-17"></a> `name?` | `string` |

***

## DimensionOptionsProps

### Properties

| Property | Type |
| ------ | ------ |
| <a id="count"></a> `count` | `number` |
| <a id="dimensions-6"></a> `dimensions` | [`Dimension`](internal.md#dimension)[] |
| <a id="fks-1"></a> `fks` | [`DimensionFK`](internal.md#dimensionfk)[] |
| <a id="icon-3"></a> `icon?` | `string` |
| <a id="name-18"></a> `name?` | `string` |

***

## DimensionOptionsSection

### Properties

| Property | Type |
| ------ | ------ |
| <a id="icon-4"></a> `icon` | `string` |
| <a id="items"></a> `items` | [`DimensionOptionsSectionItem`](internal.md#dimensionoptionssectionitem)[] |
| <a id="name-19"></a> `name` | `null` \| `string` |

***

## DimensionOptionsSectionItem

### Properties

| Property | Type |
| ------ | ------ |
| <a id="dimension-2"></a> `dimension` | [`Dimension`](internal.md#dimension) |

***

## DoNotCacheStrategy

### Extends

- [`CacheStrategyBase`](internal.md#cachestrategybase)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="type-17"></a> `type` | `"nocache"` | [`CacheStrategyBase`](internal.md#cachestrategybase).[`type`](internal.md#type-6) |

***

## Download

### Properties

| Property | Type |
| ------ | ------ |
| <a id="error-1"></a> `error?` | `string` |
| <a id="id-18"></a> `id` | `number` |
| <a id="status-2"></a> `status` | `"error"` \| `"complete"` \| `"in-progress"` |
| <a id="title"></a> `title` | `string` |

***

## DownloadWidgetProps

### Extends

- `StackProps`

***

## DurationStrategy

### Extends

- [`CacheStrategyBase`](internal.md#cachestrategybase)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="duration"></a> `duration` | `number` | - |
| <a id="refresh_automatically"></a> `refresh_automatically` | `boolean` | - |
| <a id="type-18"></a> `type` | `"duration"` | [`CacheStrategyBase`](internal.md#cachestrategybase).[`type`](internal.md#type-6) |
| <a id="unit-1"></a> `unit` | `CacheDurationUnit` | - |

***

## EditParameterSidebarState

### Extends

- [`BaseSidebarState`](internal.md#basesidebarstate)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="name-20"></a> `name` | `"editParameter"` | [`BaseSidebarState`](internal.md#basesidebarstate).[`name`](internal.md#name-6) |
| <a id="props-2"></a> `props` | [`EditParameterSidebarProps`](internal.md#editparametersidebarprops) | [`BaseSidebarState`](internal.md#basesidebarstate).[`props`](internal.md#props) |

***

## EmbedState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="isembeddingsdk"></a> `isEmbeddingSdk?` | `boolean` |
| <a id="options"></a> `options` | [`InteractiveEmbeddingOptions`](internal.md#interactiveembeddingoptions) |

***

## Engine

### Properties

| Property | Type |
| ------ | ------ |
| <a id="details-fields"></a> `details-fields?` | [`EngineField`](internal.md#enginefield)[] |
| <a id="driver-name"></a> `driver-name` | `string` |
| <a id="source-2"></a> `source` | [`EngineSource`](internal.md#enginesource) |
| <a id="superseded-by"></a> `superseded-by` | `null` \| `string` |

***

## EngineField

### Properties

| Property | Type |
| ------ | ------ |
| <a id="default"></a> `default?` | `unknown` |
| <a id="description-10"></a> `description?` | `string` |
| <a id="display-name"></a> `display-name?` | `string` |
| <a id="helper-text"></a> `helper-text?` | `string` |
| <a id="name-21"></a> `name` | `string` |
| <a id="options-1"></a> `options?` | [`EngineFieldOption`](internal.md#enginefieldoption)[] |
| <a id="placeholder"></a> `placeholder?` | `unknown` |
| <a id="required"></a> `required?` | `boolean` |
| <a id="treat-before-posting"></a> `treat-before-posting?` | `"base64"` |
| <a id="type-19"></a> `type?` | [`EngineFieldType`](internal.md#enginefieldtype) |
| <a id="visible-if"></a> `visible-if?` | `Record`\<`string`, `unknown`\> |

***

## EngineFieldOption

### Properties

| Property | Type |
| ------ | ------ |
| <a id="name-22"></a> `name` | `string` |
| <a id="value-3"></a> `value` | `string` |

***

## EngineSource

### Properties

| Property | Type |
| ------ | ------ |
| <a id="contact"></a> `contact` | `null` \| [`EngineSourceContact`](internal.md#enginesourcecontact) |
| <a id="type-20"></a> `type` | `"official"` \| `"community"` \| `"partner"` |

***

## EngineSourceContact

### Properties

| Property | Type |
| ------ | ------ |
| <a id="address"></a> `address?` | `string` |
| <a id="name-23"></a> `name?` | `string` |

***

## EntitiesState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="actions"></a> `actions` | `Record`\<`string`, [`WritebackAction`](internal.md#writebackaction)\> |
| <a id="collections"></a> `collections` | `Record`\<`string`, [`NormalizedCollection`](internal.md#normalizedcollection)\> |
| <a id="dashboards-1"></a> `dashboards` | `Record`\<`string`, [`Dashboard`](internal.md#dashboard-1)\> |
| <a id="databases-1"></a> `databases` | `Record`\<`string`, [`NormalizedDatabase`](internal.md#normalizeddatabase)\> |
| <a id="fields-3"></a> `fields` | `Record`\<`string`, [`NormalizedField`](internal.md#normalizedfield)\> |
| <a id="indexedentities"></a> `indexedEntities` | `Record`\<`string`, [`IndexedEntity`](internal.md#indexedentity)\> |
| <a id="questions-1"></a> `questions` | `Record`\<`string`, [`NormalizedCard`](internal.md#normalizedcard)\> |
| <a id="schemas-2"></a> `schemas` | `Record`\<`string`, [`NormalizedSchema`](internal.md#normalizedschema)\> |
| <a id="segments-2"></a> `segments` | `Record`\<`string`, [`NormalizedSegment`](internal.md#normalizedsegment)\> |
| <a id="snippets"></a> `snippets` | `Record`\<`string`, [`NativeQuerySnippet`](internal.md#nativequerysnippet)\> |
| <a id="tables-6"></a> `tables` | `Record`\<`string`, [`NormalizedTable`](internal.md#normalizedtable)\> |
| <a id="users"></a> `users` | `Record`\<`string`, [`User`](internal.md#user-1)\> |

***

## Field

### Properties

| Property | Type |
| ------ | ------ |
| <a id="active-1"></a> `active` | `boolean` |
| <a id="base_type-2"></a> `base_type` | `string` |
| <a id="caveats-3"></a> `caveats?` | `null` \| `string` |
| <a id="coercion_strategy-2"></a> `coercion_strategy` | `null` \| `string` |
| <a id="created_at-5"></a> `created_at` | `string` |
| <a id="default_dimension_option"></a> `default_dimension_option?` | [`FieldDimensionOption`](internal.md#fielddimensionoption) |
| <a id="description-11"></a> `description` | `null` \| `string` |
| <a id="dimension_options-1"></a> `dimension_options?` | [`FieldDimensionOption`](internal.md#fielddimensionoption)[] |
| <a id="dimensions-7"></a> `dimensions?` | [`FieldDimension`](internal.md#fielddimension-1)[] |
| <a id="display_name-3"></a> `display_name` | `string` |
| <a id="effective_type-2"></a> `effective_type?` | `string` |
| <a id="field_ref-1"></a> `field_ref?` | [`FieldReference`](internal.md#fieldreference) |
| <a id="fingerprint-2"></a> `fingerprint` | `null` \| [`FieldFingerprint`](internal.md#fieldfingerprint) |
| <a id="fk_target_field_id-2"></a> `fk_target_field_id` | `null` \| `number` |
| <a id="has_field_values-1"></a> `has_field_values` | [`FieldValuesType`](internal.md#fieldvaluestype) |
| <a id="has_more_values-1"></a> `has_more_values?` | `boolean` |
| <a id="id-19"></a> `id` | `number` \| [`FieldReference`](internal.md#fieldreference) |
| <a id="json_unfolding-1"></a> `json_unfolding` | `null` \| `boolean` |
| <a id="last_analyzed"></a> `last_analyzed` | `string` |
| <a id="max_value"></a> `max_value?` | `number` |
| <a id="min_value"></a> `min_value?` | `number` |
| <a id="name-24"></a> `name` | `string` |
| <a id="name_field-1"></a> `name_field?` | [`Field`](internal.md#field-5) |
| <a id="nfc_path-1"></a> `nfc_path` | `null` \| `string`[] |
| <a id="parent_id-1"></a> `parent_id?` | `number` |
| <a id="points_of_interest-3"></a> `points_of_interest?` | `string` |
| <a id="position-1"></a> `position` | `number` |
| <a id="preview_display"></a> `preview_display` | `boolean` |
| <a id="remappings"></a> `remappings?` | [`FieldValue`](internal.md#fieldvalue)[] |
| <a id="semantic_type-2"></a> `semantic_type` | `null` \| `string` |
| <a id="settings-8"></a> `settings?` | [`FieldFormattingSettings`](internal.md#fieldformattingsettings) |
| <a id="table-5"></a> `table?` | [`Table`](internal.md#table-12) |
| <a id="table_id-3"></a> `table_id` | [`TableId`](internal.md#tableid-3) |
| <a id="target-1"></a> `target?` | [`Field`](internal.md#field-5) |
| <a id="updated_at-5"></a> `updated_at` | `string` |
| <a id="values-1"></a> `values?` | [`FieldValue`](internal.md#fieldvalue)[] |
| <a id="visibility_type-3"></a> `visibility_type` | [`FieldVisibilityType`](internal.md#fieldvisibilitytype) |

***

## FieldFilterUiParameter

### Extends

- [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter)

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="default-1"></a> `default?` | `any` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`default`](internal.md#default-6) |
| <a id="display-name-1"></a> `display-name?` | `string` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`display-name`](internal.md#display-name-5) |
| <a id="fields-4"></a> `fields` | [`Field`](internal.md#field-1)[] | - |
| <a id="filteringparameters"></a> `filteringParameters?` | `string`[] | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`filteringParameters`](internal.md#filteringparameters-3) |
| <a id="hasvariabletemplatetagtarget"></a> `hasVariableTemplateTagTarget?` | `boolean` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`hasVariableTemplateTagTarget`](internal.md#hasvariabletemplatetagtarget-2) |
| <a id="id-20"></a> `id` | `string` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`id`](internal.md#id-43) |
| <a id="ismultiselect"></a> `isMultiSelect?` | `boolean` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`isMultiSelect`](internal.md#ismultiselect-3) |
| <a id="name-25"></a> `name` | `string` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`name`](internal.md#name-43) |
| <a id="options-2"></a> `options?` | [`ParameterOptions`](internal.md#parameteroptions) | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`options`](internal.md#options-7) |
| <a id="required-1"></a> `required?` | `boolean` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`required`](internal.md#required-6) |
| <a id="sectionid"></a> `sectionId?` | `string` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`sectionId`](internal.md#sectionid-3) |
| <a id="slug-1"></a> `slug` | `string` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`slug`](internal.md#slug-5) |
| <a id="target-2"></a> `target?` | [`ParameterTarget`](internal.md#parametertarget) | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`target`](internal.md#target-6) |
| <a id="temporal_units"></a> `temporal_units?` | [`TemporalUnit`](internal.md#temporalunit)[] | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`temporal_units`](internal.md#temporal_units-3) |
| <a id="type-21"></a> `type` | `string` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`type`](internal.md#type-48) |
| <a id="value-4"></a> `value?` | `any` | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`value`](internal.md#value-10) |
| <a id="values_query_type"></a> `values_query_type?` | [`ValuesQueryType`](internal.md#valuesquerytype) | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`values_query_type`](internal.md#values_query_type-4) |
| <a id="values_source_config"></a> `values_source_config?` | [`ValuesSourceConfig`](internal.md#valuessourceconfig) | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`values_source_config`](internal.md#values_source_config-4) |
| <a id="values_source_type"></a> `values_source_type?` | [`ValuesSourceType`](internal.md#valuessourcetype) | [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter).[`values_source_type`](internal.md#values_source_type-4) |

***

## FieldFingerprint

### Properties

| Property | Type |
| ------ | ------ |
| <a id="global"></a> `global?` | [`FieldGlobalFingerprint`](internal.md#fieldglobalfingerprint) |
| <a id="type-22"></a> `type?` | [`FieldTypeFingerprint`](internal.md#fieldtypefingerprint) |

***

## FieldFormattingSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="currency-2"></a> `currency?` | `string` |

***

## FieldGlobalFingerprint

### Properties

| Property | Type |
| ------ | ------ |
| <a id="distinct-count"></a> `distinct-count?` | `number` |
| <a id="nil%"></a> `nil%?` | `number` |

***

## FieldSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="defaultvalue"></a> `defaultValue?` | `string` \| `number` |
| <a id="description-12"></a> `description?` | `null` \| `string` |
| <a id="fieldtype"></a> `fieldType` | [`FieldType`](internal.md#fieldtype-1) |
| <a id="hassearch"></a> `hasSearch?` | `boolean` |
| <a id="height"></a> `height?` | `number` |
| <a id="hidden"></a> `hidden` | `boolean` |
| <a id="id-21"></a> `id` | `string` |
| <a id="inputtype"></a> `inputType` | [`InputSettingType`](internal.md#inputsettingtype) |
| <a id="name-26"></a> `name` | `string` |
| <a id="order"></a> `order` | `number` |
| <a id="placeholder-1"></a> `placeholder?` | `string` |
| <a id="range"></a> `range?` | \| [`DateRange`](internal.md#daterange) \| [`NumberRange`](internal.md#numberrange) |
| <a id="required-2"></a> `required` | `boolean` |
| <a id="title-1"></a> `title` | `string` |
| <a id="valueoptions"></a> `valueOptions?` | [`FieldValueOptions`](internal.md#fieldvalueoptions) |
| <a id="width-1"></a> `width?` | [`Size`](internal.md#size) |

***

## FieldTypeFingerprint

### Properties

| Property | Type |
| ------ | ------ |
| <a id="type/datetime"></a> `type/DateTime?` | [`DateTimeFieldFingerprint`](internal.md#datetimefieldfingerprint) |
| <a id="type/number"></a> `type/Number?` | [`NumberFieldFingerprint`](internal.md#numberfieldfingerprint) |
| <a id="type/text"></a> `type/Text?` | [`TextFieldFingerprint`](internal.md#textfieldfingerprint) |

***

## FilterColumnPickerProps

### Properties

| Property | Type |
| ------ | ------ |
| <a id="checkitemisselected"></a> `checkItemIsSelected` | (`item`: \| [`ColumnListItem`](internal.md#columnlistitem) \| [`SegmentListItem`](internal.md#segmentlistitem)) => `boolean` |
| <a id="classname"></a> `className?` | `string` |
| <a id="oncolumnselect"></a> `onColumnSelect` | (`column`: \{ `_opaque`: *typeof* `ColumnMetadata`; \}) => `void` |
| <a id="onexpressionselect"></a> `onExpressionSelect` | () => `void` |
| <a id="onsegmentselect"></a> `onSegmentSelect` | (`segment`: \{ `_opaque`: *typeof* `SegmentMetadata`; \}) => `void` |
| <a id="query-2"></a> `query` | \{ `_opaque`: *typeof* [`Query`](internal.md#query-6); \} |
| `query._opaque` | *typeof* [`Query`](internal.md#query-6) |
| <a id="stageindex"></a> `stageIndex` | `number` |
| <a id="withcolumngroupicon"></a> `withColumnGroupIcon?` | `boolean` |
| <a id="withcolumnitemicon"></a> `withColumnItemIcon?` | `boolean` |
| <a id="withcustomexpression"></a> `withCustomExpression?` | `boolean` |

***

## FontFile

### Properties

| Property | Type |
| ------ | ------ |
| <a id="fontformat"></a> `fontFormat` | [`FontFormat`](internal.md#fontformat-1) |
| <a id="fontweight"></a> `fontWeight` | `number` |
| <a id="src"></a> `src` | `string` |

***

## ForeignKey

### Properties

| Property | Type |
| ------ | ------ |
| <a id="destination-1"></a> `destination?` | [`Field`](internal.md#field-5) |
| <a id="destination_id-1"></a> `destination_id` | `number` |
| <a id="origin-2"></a> `origin?` | [`Field`](internal.md#field-5) |
| <a id="origin_id-1"></a> `origin_id` | `number` |
| <a id="relationship-1"></a> `relationship` | `"Mt1"` |

***

## FormattingSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="type/currency"></a> `type/Currency?` | [`CurrencyFormattingSettings`](internal.md#currencyformattingsettings) |
| <a id="type/number-1"></a> `type/Number?` | [`NumberFormattingSettings`](internal.md#numberformattingsettings) |
| <a id="type/temporal"></a> `type/Temporal?` | [`DateFormattingSettings`](internal.md#dateformattingsettings) |

***

## HACK\_ExplicitActionClickBehavior

This is a bit of a hack to allow us using click behavior code
for mapping _explicit_ action parameters. We don't actually use the click behavior though.
Remove this type and run the type-check to see the errors.

### Properties

| Property | Type |
| ------ | ------ |
| <a id="type-23"></a> `type` | `"action"` |

***

## HttpAction

### Properties

| Property | Type |
| ------ | ------ |
| <a id="error_handle"></a> `error_handle` | `null` \| `string` |
| <a id="response_handle"></a> `response_handle` | `null` \| `string` |
| <a id="template"></a> `template` | [`HttpActionTemplate`](internal.md#httpactiontemplate) |
| <a id="type-24"></a> `type` | `"http"` |

***

## HttpActionTemplate

### Properties

| Property | Type |
| ------ | ------ |
| <a id="body"></a> `body` | `string` |
| <a id="headers"></a> `headers` | `string` |
| <a id="method"></a> `method` | `string` |
| <a id="parameter_mappings"></a> `parameter_mappings` | `Record`\<`string`, [`ParameterTarget`](internal.md#parametertarget)\> |
| <a id="parameters-2"></a> `parameters` | `Record`\<`string`, [`Parameter`](internal.md#parameter)\> |
| <a id="url"></a> `url` | `string` |

***

## ImplicitQueryAction

### Properties

| Property | Type |
| ------ | ------ |
| <a id="kind"></a> `kind` | `"row/create"` \| `"row/update"` \| `"row/delete"` |
| <a id="type-25"></a> `type` | `"implicit"` |

***

## InheritStrategy

### Extends

- [`CacheStrategyBase`](internal.md#cachestrategybase)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="type-26"></a> `type` | `"inherit"` | [`CacheStrategyBase`](internal.md#cachestrategybase).[`type`](internal.md#type-6) |

***

## InsertActionClickBehavior

### Extends

- [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="actiontype-2"></a> `actionType` | `"insert"` | [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior).[`actionType`](internal.md#actiontype) | - |
| <a id="tableid"></a> `tableId` | `number` | - | - |
| <a id="type-27"></a> `type` | `"action"` | - | [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior).[`type`](internal.md#type-4) |

***

## Insight

### Properties

| Property | Type |
| ------ | ------ |
| <a id="best-fit"></a> `best-fit?` | [`InsightExpression`](internal.md#insightexpression) |
| <a id="col-1"></a> `col` | `string` |
| <a id="last-change"></a> `last-change` | `number` |
| <a id="last-value"></a> `last-value` | `number` |
| <a id="offset"></a> `offset` | `number` |
| <a id="previous-value"></a> `previous-value` | `number` |
| <a id="slope"></a> `slope` | `number` |
| <a id="unit-2"></a> `unit` | `"month"` \| `"week"` \| `"year"` \| `"day"` \| `"quarter"` \| `"minute"` \| `"hour"` |

***

## InstanceSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="admin-email"></a> `admin-email` | `string` |
| <a id="email-smtp-host"></a> `email-smtp-host` | `null` \| `string` |
| <a id="email-smtp-password"></a> `email-smtp-password` | `null` \| `string` |
| <a id="email-smtp-port"></a> `email-smtp-port` | `null` \| `number` |
| <a id="email-smtp-security"></a> `email-smtp-security` | `"none"` \| `"ssl"` \| `"tls"` \| `"starttls"` |
| <a id="email-smtp-username"></a> `email-smtp-username` | `null` \| `string` |
| <a id="enable-embedding"></a> `enable-embedding` | `boolean` |
| <a id="enable-embedding-interactive"></a> `enable-embedding-interactive` | `boolean` |
| <a id="enable-embedding-sdk"></a> `enable-embedding-sdk` | `boolean` |
| <a id="enable-embedding-static"></a> `enable-embedding-static` | `boolean` |
| <a id="enable-nested-queries"></a> `enable-nested-queries` | `boolean` |
| <a id="enable-public-sharing"></a> `enable-public-sharing` | `boolean` |
| <a id="enable-xrays"></a> `enable-xrays` | `boolean` |
| <a id="example-dashboard-id"></a> `example-dashboard-id` | `null` \| `number` |
| <a id="instance-creation"></a> `instance-creation` | `string` |
| <a id="query-analysis-enabled"></a> `query-analysis-enabled` | `boolean` |
| <a id="read-only-mode"></a> `read-only-mode` | `boolean` |
| <a id="search-typeahead-enabled"></a> `search-typeahead-enabled` | `boolean` |
| <a id="show-homepage-data"></a> `show-homepage-data` | `boolean` |
| <a id="show-homepage-pin-message"></a> `show-homepage-pin-message` | `boolean` |
| <a id="show-homepage-xrays"></a> `show-homepage-xrays` | `boolean` |
| <a id="site-name"></a> `site-name` | `string` |
| <a id="site-uuid"></a> `site-uuid` | `string` |
| <a id="subscription-allowed-domains"></a> `subscription-allowed-domains` | `null` \| `string` |
| <a id="uploads-settings"></a> `uploads-settings` | [`UploadsSettings`](internal.md#uploadssettings) |
| <a id="user-visibility"></a> `user-visibility` | `null` \| `string` |

***

## InteractiveEmbeddingOptions

### Properties

| Property | Type |
| ------ | ------ |
| <a id="action_buttons"></a> `action_buttons?` | `boolean` |
| <a id="additional_info"></a> `additional_info?` | `boolean` |
| <a id="breadcrumbs"></a> `breadcrumbs?` | `boolean` |
| <a id="font"></a> `font?` | `string` |
| <a id="header"></a> `header?` | `boolean` |
| <a id="logo"></a> `logo?` | `boolean` |
| <a id="new_button"></a> `new_button?` | `boolean` |
| <a id="search"></a> `search?` | `boolean` |
| <a id="side_nav"></a> `side_nav?` | `boolean` \| `"default"` |
| <a id="top_nav"></a> `top_nav?` | `boolean` |

***

## InteractiveQuestionDefaultViewProps

### Properties

| Property | Type |
| ------ | ------ |
| <a id="title-2"></a> `title?` | [`SdkQuestionTitleProps`](internal.md#sdkquestiontitleprops) |
| <a id="withcharttypeselector"></a> `withChartTypeSelector?` | `boolean` |
| <a id="withresetbutton"></a> `withResetButton?` | `boolean` |

***

## InternalMetabaseProviderProps

### Extends

- [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops)

### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="allowconsolelog"></a> `allowConsoleLog?` | `boolean` | Whether to allow logging to the DevTools console. Defaults to true. | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`allowConsoleLog`](MetabaseProvider.md#allowconsolelog) |
| <a id="authconfig"></a> `authConfig` | [`MetabaseAuthConfig`](internal.md#metabaseauthconfig) | - | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`authConfig`](MetabaseProvider.md#authconfig) |
| <a id="children-1"></a> `children` | `ReactNode` | - | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`children`](MetabaseProvider.md#children) |
| <a id="classname-1"></a> `className?` | `string` | - | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`className`](MetabaseProvider.md#classname) |
| <a id="errorcomponent"></a> `errorComponent?` | [`SdkErrorComponent`](internal.md#sdkerrorcomponent) | A custom error component to display when the SDK encounters an error. | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`errorComponent`](MetabaseProvider.md#errorcomponent) |
| <a id="eventhandlers"></a> `eventHandlers?` | [`SdkEventHandlersConfig`](internal.md#sdkeventhandlersconfig) | - | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`eventHandlers`](MetabaseProvider.md#eventhandlers) |
| <a id="loadercomponent"></a> `loaderComponent?` | () => `Element` | A custom loader component to display while the SDK is loading. | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`loaderComponent`](MetabaseProvider.md#loadercomponent) |
| <a id="locale-1"></a> `locale?` | `string` | Defines the display language. Accepts an ISO language code such as `en` or `de`. Defaults to `en`. Does not support country code suffixes (i.e. `en-US`) | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`locale`](MetabaseProvider.md#locale) |
| <a id="pluginsconfig"></a> `pluginsConfig?` | [`MetabasePluginsConfig`](internal.md#metabasepluginsconfig) | - | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`pluginsConfig`](MetabaseProvider.md#pluginsconfig) |
| <a id="store"></a> `store` | `Store`\<[`SdkStoreState`](internal.md#sdkstorestate), `Action`\> | - | - |
| <a id="theme-1"></a> `theme?` | [`MetabaseTheme`](internal.md#metabasetheme) | - | [`MetabaseProviderProps`](MetabaseProvider.md#metabaseproviderprops).[`theme`](MetabaseProvider.md#theme) |

***

## InviteInfo

### Properties

| Property | Type |
| ------ | ------ |
| <a id="email-1"></a> `email` | `string` |
| <a id="first_name-1"></a> `first_name` | `null` \| `string` |
| <a id="last_name-1"></a> `last_name` | `null` \| `string` |

***

## LinkCardSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="entity"></a> `entity?` | [`LinkEntity`](internal.md#linkentity) |
| <a id="url-1"></a> `url?` | `string` |

***

## LoadSdkQuestionParams

### Properties

| Property | Type |
| ------ | ------ |
| <a id="deserializedcard"></a> `deserializedCard?` | [`Card`](internal.md#cardq)\<[`DatasetQuery`](internal.md#datasetquery-3)\> |
| <a id="initialsqlparameters"></a> `initialSqlParameters?` | [`ParameterValues`](internal.md#parametervalues-3) |
| <a id="options-3"></a> `options?` | [`QueryParams`](internal.md#queryparams) |
| <a id="questionid"></a> `questionId?` | `null` \| `number` |

***

## Locale

### Properties

| Property | Type |
| ------ | ------ |
| <a id="code"></a> `code` | `string` |
| <a id="name-27"></a> `name` | `string` |

***

## MetabaseColors

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="background"></a> `background?` | `string` | Default background color. |
| <a id="background-disabled"></a> `background-disabled?` | `string` | Muted background color used for disabled elements, such as disabled buttons and inputs. |
| <a id="background-hover"></a> `background-hover?` | `string` | Slightly darker background color used for hover and accented elements. |
| <a id="background-secondary"></a> `background-secondary?` | `string` | Slightly muted background color. |
| <a id="border"></a> `border?` | `string` | Color used for borders |
| <a id="brand"></a> `brand?` | `string` | Primary brand color used for buttons and links |
| <a id="brand-hover"></a> `brand-hover?` | `string` | Lighter variation of the brand color. Used for hover and accented elements. |
| <a id="brand-hover-light"></a> `brand-hover-light?` | `string` | Lightest variation of the brand color. Used for hover and accented elements. |
| <a id="charts"></a> `charts?` | [`ChartColor`](internal.md#chartcolor)[] | Chart colors |
| <a id="filter"></a> `filter?` | `string` | Color used for filters context |
| <a id="negative"></a> `negative?` | `string` | Color used to indicate dangerous actions and negative values/trends |
| <a id="positive"></a> `positive?` | `string` | Color used to indicate successful actions and positive values/trends |
| <a id="shadow"></a> `shadow?` | `string` | Color used for popover shadows |
| <a id="summarize"></a> `summarize?` | `string` | Color used for aggregations and breakouts context |
| <a id="text-primary"></a> `text-primary?` | `string` | Text color on dark elements. Should be a lighter color for readability. |
| <a id="text-secondary"></a> `text-secondary?` | `string` | Lighter variation of dark text on light elements. |
| <a id="text-tertiary"></a> `text-tertiary?` | `string` | Text color on light elements. Should be a darker color for readability. |

***

## MetabaseQuestion

### Properties

| Property | Type |
| ------ | ------ |
| <a id="description-13"></a> `description` | `null` \| `string` |
| <a id="entityid"></a> `entityId` | `string` |
| <a id="id-22"></a> `id` | `number` |
| <a id="issavedquestion"></a> `isSavedQuestion` | `boolean` |
| <a id="name-28"></a> `name` | `string` |

***

## MetabaseTheme

Theme configuration for embedded Metabase components.

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="colors"></a> `colors?` | [`MetabaseColors`](internal.md#metabasecolors) | Color palette |
| <a id="components"></a> `components?` | [`DeepPartial`](internal.md#deeppartialt)\<[`MetabaseComponentTheme`](internal.md#metabasecomponenttheme)\> | Component theme options |
| <a id="fontfamily"></a> `fontFamily?` | `string` & \{\} \| [`MetabaseFontFamily`](internal.md#metabasefontfamily) | Font family that will be used for all text, it defaults to the instance's default font. |
| <a id="fontsize"></a> `fontSize?` | `string` | Base font size. Supported units are px, em and rem. Defaults to ~14px (0.875em) |
| <a id="lineheight"></a> `lineHeight?` | `string` \| `number` | Base line height |

***

## MetadataOpts

### Properties

| Property | Type |
| ------ | ------ |
| <a id="databases-2"></a> `databases?` | `Record`\<`string`, [`Database`](internal.md#database)\> |
| <a id="fields-5"></a> `fields?` | `Record`\<`string`, [`Field`](internal.md#field-1)\> |
| <a id="questions-2"></a> `questions?` | `Record`\<`string`, [`Question`](internal.md#question-3)\> |
| <a id="schemas-3"></a> `schemas?` | `Record`\<`string`, [`Schema`](internal.md#schema-1)\> |
| <a id="segments-3"></a> `segments?` | `Record`\<`string`, [`Segment`](internal.md#segment-1)\> |
| <a id="settings-9"></a> `settings?` | [`Settings`](internal.md#settings-15) |
| <a id="tables-7"></a> `tables?` | `Record`\<`string`, [`Table`](internal.md#table-4)\> |

***

## NativeDatasetQuery

### Properties

| Property | Type |
| ------ | ------ |
| <a id="database-4"></a> `database` | `null` \| `number` |
| <a id="native"></a> `native` | [`NativeQuery`](internal.md#nativequery) |
| <a id="parameters-3"></a> `parameters?` | [`UiParameter`](internal.md#uiparameter)[] |
| <a id="type-28"></a> `type` | `"native"` |

***

## NativeQuery

### Properties

| Property | Type |
| ------ | ------ |
| <a id="collection-4"></a> `collection?` | `string` |
| <a id="query-3"></a> `query` | `string` |
| <a id="template-tags"></a> `template-tags?` | [`TemplateTags`](internal.md#templatetags) |

***

## NativeQuerySnippet

### Properties

| Property | Type |
| ------ | ------ |
| <a id="archived-5"></a> `archived` | `boolean` |
| <a id="collection_id-4"></a> `collection_id` | `null` \| `number` |
| <a id="content"></a> `content` | `string` |
| <a id="created_at-6"></a> `created_at` | `string` |
| <a id="creator-1"></a> `creator` | [`UserInfo`](internal.md#userinfo-1) |
| <a id="creator_id-3"></a> `creator_id` | `number` |
| <a id="description-14"></a> `description` | `null` \| `string` |
| <a id="entity_id-3"></a> `entity_id` | [`NanoID`](internal.md#nanoid) |
| <a id="id-23"></a> `id` | `number` |
| <a id="name-29"></a> `name` | `string` |
| <a id="updated_at-6"></a> `updated_at` | `string` |

***

## NormalizedCollection

### Extends

- `Omit`\<[`Collection`](internal.md#collection-1), `"items"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="archived-6"></a> `archived` | `boolean` | `Omit.archived` |
| <a id="authority_level-2"></a> `authority_level?` | [`CollectionAuthorityLevel`](internal.md#collectionauthoritylevel) | `Omit.authority_level` |
| <a id="below-2"></a> `below?` | [`CollectionContentModel`](internal.md#collectioncontentmodel)[] | `Omit.below` |
| <a id="can_delete-4"></a> `can_delete` | `boolean` | `Omit.can_delete` |
| <a id="can_restore-4"></a> `can_restore` | `boolean` | `Omit.can_restore` |
| <a id="can_write-4"></a> `can_write` | `boolean` | `Omit.can_write` |
| <a id="children-2"></a> `children?` | [`Collection`](internal.md#collection-1)[] | `Omit.children` |
| <a id="description-15"></a> `description` | `null` \| `string` | `Omit.description` |
| <a id="effective_ancestors-1"></a> `effective_ancestors?` | [`CollectionEssentials`](internal.md#collectionessentials)[] | `Omit.effective_ancestors` |
| <a id="effective_location-2"></a> `effective_location?` | `string` | `Omit.effective_location` |
| <a id="entity_id-4"></a> `entity_id?` | `string` | `Omit.entity_id` |
| <a id="here-2"></a> `here?` | [`CollectionContentModel`](internal.md#collectioncontentmodel)[] | `Omit.here` |
| <a id="id-24"></a> `id` | [`CollectionId`](internal.md#collectionid) | `Omit.id` |
| <a id="is_personal-1"></a> `is_personal?` | `boolean` | `Omit.is_personal` |
| <a id="is_sample-4"></a> `is_sample?` | `boolean` | `Omit.is_sample` |
| <a id="items-1"></a> `items?` | `number`[] | - |
| <a id="location-2"></a> `location` | `null` \| `string` | `Omit.location` |
| <a id="name-30"></a> `name` | `string` | `Omit.name` |
| <a id="originalname-1"></a> `originalName?` | `string` | `Omit.originalName` |
| <a id="parent_id-2"></a> `parent_id?` | `null` \| [`CollectionId`](internal.md#collectionid) | `Omit.parent_id` |
| <a id="path-1"></a> `path?` | [`CollectionId`](internal.md#collectionid)[] | `Omit.path` |
| <a id="personal_owner_id-2"></a> `personal_owner_id?` | `number` | `Omit.personal_owner_id` |
| <a id="slug-2"></a> `slug?` | `string` | `Omit.slug` |
| <a id="type-29"></a> `type?` | `null` \| `"trash"` \| `"instance-analytics"` | `Omit.type` |

***

## NormalizedDatabase

### Extends

- `Omit`\<[`Database`](internal.md#database-3), `"tables"` \| `"schemas"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="auto_run_queries-3"></a> `auto_run_queries` | `null` \| `boolean` | `Omit.auto_run_queries` |
| <a id="cache_ttl-5"></a> `cache_ttl` | `null` \| `number` | `Omit.cache_ttl` |
| <a id="can_upload-2"></a> `can_upload` | `boolean` | `Omit.can_upload` |
| <a id="can-manage-2"></a> `can-manage?` | `boolean` | `Omit.can-manage` |
| <a id="caveats-4"></a> `caveats?` | `string` | `Omit.caveats` |
| <a id="created_at-7"></a> `created_at` | `string` | `Omit.created_at` |
| <a id="creator_id-4"></a> `creator_id?` | `number` | `Omit.creator_id` |
| <a id="details-3"></a> `details?` | `Record`\<`string`, `unknown`\> | `Omit.details` |
| <a id="engine-4"></a> `engine` | `undefined` \| `string` | `Omit.engine` |
| <a id="features-2"></a> `features?` | [`DatabaseFeature`](internal.md#databasefeature)[] | `Omit.features` |
| <a id="id-25"></a> `id` | `number` | `Omit.id` |
| <a id="initial_sync_status-3"></a> `initial_sync_status` | [`LongTaskStatus`](internal.md#longtaskstatus) | `Omit.initial_sync_status` |
| <a id="is_attached_dwh-2"></a> `is_attached_dwh?` | `boolean` | `Omit.is_attached_dwh` |
| <a id="is_audit-2"></a> `is_audit?` | `boolean` | `Omit.is_audit` |
| <a id="is_full_sync-3"></a> `is_full_sync` | `boolean` | `Omit.is_full_sync` |
| <a id="is_on_demand-3"></a> `is_on_demand` | `boolean` | `Omit.is_on_demand` |
| <a id="is_sample-5"></a> `is_sample` | `boolean` | `Omit.is_sample` |
| <a id="is_saved_questions-2"></a> `is_saved_questions` | `boolean` | `Omit.is_saved_questions` |
| <a id="name-31"></a> `name` | `string` | `Omit.name` |
| <a id="native_permissions-2"></a> `native_permissions` | `"write"` \| `"none"` | `Omit.native_permissions` |
| <a id="points_of_interest-4"></a> `points_of_interest?` | `string` | `Omit.points_of_interest` |
| <a id="refingerprint-3"></a> `refingerprint` | `null` \| `boolean` | `Omit.refingerprint` |
| <a id="schedules-3"></a> `schedules` | [`DatabaseSchedules`](internal.md#databaseschedules) | `Omit.schedules` |
| <a id="schemas-4"></a> `schemas?` | `string`[] | - |
| <a id="settings-10"></a> `settings?` | `null` \| [`DatabaseSettings`](internal.md#databasesettings) | `Omit.settings` |
| <a id="tables-8"></a> `tables?` | [`TableId`](internal.md#tableid-3)[] | - |
| <a id="timezone-2"></a> `timezone?` | `string` | `Omit.timezone` |
| <a id="updated_at-7"></a> `updated_at` | `string` | `Omit.updated_at` |
| <a id="uploads_enabled-2"></a> `uploads_enabled` | `boolean` | `Omit.uploads_enabled` |
| <a id="uploads_schema_name-2"></a> `uploads_schema_name` | `null` \| `string` | `Omit.uploads_schema_name` |
| <a id="uploads_table_prefix-2"></a> `uploads_table_prefix` | `null` \| `string` | `Omit.uploads_table_prefix` |

***

## NormalizedField

### Extends

- `Omit`\<[`Field`](internal.md#field-5), `"target"` \| `"table"` \| `"name_field"` \| `"dimensions"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="active-2"></a> `active` | `boolean` | `Omit.active` |
| <a id="base_type-3"></a> `base_type` | `string` | `Omit.base_type` |
| <a id="caveats-5"></a> `caveats?` | `null` \| `string` | `Omit.caveats` |
| <a id="coercion_strategy-3"></a> `coercion_strategy` | `null` \| `string` | `Omit.coercion_strategy` |
| <a id="created_at-8"></a> `created_at` | `string` | `Omit.created_at` |
| <a id="default_dimension_option-1"></a> `default_dimension_option?` | [`FieldDimensionOption`](internal.md#fielddimensionoption) | `Omit.default_dimension_option` |
| <a id="description-16"></a> `description` | `null` \| `string` | `Omit.description` |
| <a id="dimension_options-2"></a> `dimension_options?` | [`FieldDimensionOption`](internal.md#fielddimensionoption)[] | `Omit.dimension_options` |
| <a id="dimensions-8"></a> `dimensions?` | [`NormalizedFieldDimension`](internal.md#normalizedfielddimension) | - |
| <a id="display_name-4"></a> `display_name` | `string` | `Omit.display_name` |
| <a id="effective_type-3"></a> `effective_type?` | `string` | `Omit.effective_type` |
| <a id="field_ref-2"></a> `field_ref?` | [`FieldReference`](internal.md#fieldreference) | `Omit.field_ref` |
| <a id="fingerprint-3"></a> `fingerprint` | `null` \| [`FieldFingerprint`](internal.md#fieldfingerprint) | `Omit.fingerprint` |
| <a id="fk_target_field_id-3"></a> `fk_target_field_id` | `null` \| `number` | `Omit.fk_target_field_id` |
| <a id="has_field_values-2"></a> `has_field_values` | [`FieldValuesType`](internal.md#fieldvaluestype) | `Omit.has_field_values` |
| <a id="has_more_values-2"></a> `has_more_values?` | `boolean` | `Omit.has_more_values` |
| <a id="id-26"></a> `id` | `number` \| [`FieldReference`](internal.md#fieldreference) | `Omit.id` |
| <a id="json_unfolding-2"></a> `json_unfolding` | `null` \| `boolean` | `Omit.json_unfolding` |
| <a id="last_analyzed-1"></a> `last_analyzed` | `string` | `Omit.last_analyzed` |
| <a id="max_value-1"></a> `max_value?` | `number` | `Omit.max_value` |
| <a id="min_value-1"></a> `min_value?` | `number` | `Omit.min_value` |
| <a id="name-32"></a> `name` | `string` | `Omit.name` |
| <a id="name_field-2"></a> `name_field?` | `number` | - |
| <a id="nfc_path-2"></a> `nfc_path` | `null` \| `string`[] | `Omit.nfc_path` |
| <a id="parent_id-3"></a> `parent_id?` | `number` | `Omit.parent_id` |
| <a id="points_of_interest-5"></a> `points_of_interest?` | `string` | `Omit.points_of_interest` |
| <a id="position-2"></a> `position` | `number` | `Omit.position` |
| <a id="preview_display-1"></a> `preview_display` | `boolean` | `Omit.preview_display` |
| <a id="remappings-1"></a> `remappings?` | [`FieldValue`](internal.md#fieldvalue)[] | `Omit.remappings` |
| <a id="semantic_type-3"></a> `semantic_type` | `null` \| `string` | `Omit.semantic_type` |
| <a id="settings-11"></a> `settings?` | [`FieldFormattingSettings`](internal.md#fieldformattingsettings) | `Omit.settings` |
| <a id="table-6"></a> `table?` | [`TableId`](internal.md#tableid-3) | - |
| <a id="table_id-4"></a> `table_id` | [`TableId`](internal.md#tableid-3) | `Omit.table_id` |
| <a id="target-3"></a> `target?` | `number` | - |
| <a id="uniqueid"></a> `uniqueId` | `string` | - |
| <a id="updated_at-8"></a> `updated_at` | `string` | `Omit.updated_at` |
| <a id="values-2"></a> `values?` | [`FieldValue`](internal.md#fieldvalue)[] | `Omit.values` |
| <a id="visibility_type-4"></a> `visibility_type` | [`FieldVisibilityType`](internal.md#fieldvisibilitytype) | `Omit.visibility_type` |

***

## NormalizedFieldDimension

### Extends

- `Omit`\<[`FieldDimension`](internal.md#fielddimension-1), `"human_readable_field"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="human_readable_field"></a> `human_readable_field?` | `number` | - |
| <a id="human_readable_field_id"></a> `human_readable_field_id?` | `number` | `Omit.human_readable_field_id` |
| <a id="name-33"></a> `name` | `string` | `Omit.name` |
| <a id="type-30"></a> `type` | [`FieldDimensionType`](internal.md#fielddimensiontype) | `Omit.type` |

***

## NormalizedForeignKey

### Extends

- `Omit`\<[`ForeignKey`](internal.md#foreignkey-1), `"origin"` \| `"destination"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="destination-2"></a> `destination?` | `number` | - |
| <a id="destination_id-2"></a> `destination_id` | `number` | `Omit.destination_id` |
| <a id="origin-3"></a> `origin?` | `number` | - |
| <a id="origin_id-2"></a> `origin_id` | `number` | `Omit.origin_id` |
| <a id="relationship-2"></a> `relationship` | `"Mt1"` | `Omit.relationship` |

***

## NormalizedSchema

### Extends

- `Omit`\<[`Schema`](internal.md#schema-4), `"database"` \| `"tables"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="database-5"></a> `database?` | `number` | - |
| <a id="id-27"></a> `id` | `string` | `Omit.id` |
| <a id="name-34"></a> `name` | `string` | `Omit.name` |
| <a id="tables-9"></a> `tables?` | [`TableId`](internal.md#tableid-3)[] | - |

***

## NormalizedSegment

### Extends

- `Omit`\<[`Segment`](internal.md#segment-2), `"table"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="archived-7"></a> `archived` | `boolean` | `Omit.archived` |
| <a id="definition-1"></a> `definition` | [`StructuredQuery`](internal.md#structuredquery-1) | `Omit.definition` |
| <a id="definition_description-1"></a> `definition_description` | `string` | `Omit.definition_description` |
| <a id="description-17"></a> `description` | `string` | `Omit.description` |
| <a id="id-28"></a> `id` | `number` | `Omit.id` |
| <a id="name-35"></a> `name` | `string` | `Omit.name` |
| <a id="revision_message-1"></a> `revision_message?` | `string` | `Omit.revision_message` |
| <a id="table-7"></a> `table?` | [`TableId`](internal.md#tableid-3) | - |
| <a id="table_id-5"></a> `table_id` | [`TableId`](internal.md#tableid-3) | `Omit.table_id` |

***

## NormalizedTable

### Extends

- `Omit`\<[`Table`](internal.md#table-12), `"db"` \| `"fields"` \| `"fks"` \| `"segments"` \| `"metrics"` \| `"schema"`\>

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="active-3"></a> `active` | `boolean` | `Omit.active` |
| <a id="caveats-6"></a> `caveats?` | `string` | `Omit.caveats` |
| <a id="created_at-9"></a> `created_at` | `string` | `Omit.created_at` |
| <a id="db-1"></a> `db?` | `number` | - |
| <a id="db_id-1"></a> `db_id` | `number` | `Omit.db_id` |
| <a id="description-18"></a> `description` | `null` \| `string` | `Omit.description` |
| <a id="dimension_options-3"></a> `dimension_options?` | `Record`\<`string`, [`FieldDimensionOption`](internal.md#fielddimensionoption)\> | `Omit.dimension_options` |
| <a id="display_name-5"></a> `display_name` | `string` | `Omit.display_name` |
| <a id="field_order-1"></a> `field_order` | [`TableFieldOrder`](internal.md#tablefieldorder) | `Omit.field_order` |
| <a id="fields-6"></a> `fields?` | `number`[] | - |
| <a id="fks-2"></a> `fks?` | [`NormalizedForeignKey`](internal.md#normalizedforeignkey)[] | - |
| <a id="id-29"></a> `id` | [`TableId`](internal.md#tableid-3) | `Omit.id` |
| <a id="initial_sync_status-4"></a> `initial_sync_status` | [`LongTaskStatus`](internal.md#longtaskstatus) | `Omit.initial_sync_status` |
| <a id="is_upload-1"></a> `is_upload` | `boolean` | `Omit.is_upload` |
| <a id="metrics-1"></a> `metrics?` | `number`[] | - |
| <a id="name-36"></a> `name` | `string` | `Omit.name` |
| <a id="original_fields-1"></a> `original_fields?` | [`Field`](internal.md#field-5)[] | - |
| <a id="points_of_interest-6"></a> `points_of_interest?` | `string` | `Omit.points_of_interest` |
| <a id="schema-3"></a> `schema?` | `string` | - |
| <a id="schema_name-1"></a> `schema_name?` | `string` | - |
| <a id="segments-4"></a> `segments?` | `number`[] | - |
| <a id="type-31"></a> `type?` | [`CardType`](internal.md#cardtype) | `Omit.type` |
| <a id="updated_at-9"></a> `updated_at` | `string` | `Omit.updated_at` |
| <a id="visibility_type-5"></a> `visibility_type` | [`TableVisibilityType`](internal.md#tablevisibilitytype) | `Omit.visibility_type` |

***

## NumberFormattingSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="number_separators-1"></a> `number_separators?` | `string` |

***

## NumBinsBinningOptions

### Properties

| Property | Type |
| ------ | ------ |
| <a id="num-bins"></a> `num-bins` | `number` |
| <a id="strategy-2"></a> `strategy` | `"num-bins"` |

***

## OpenAiModel

### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-30"></a> `id` | `string` |
| <a id="owned_by"></a> `owned_by` | `string` |

***

## Parameter

### Extends

- [`ParameterValuesConfig`](internal.md#parametervaluesconfig)

### Extended by

- [`WritebackParameter`](internal.md#writebackparameter)
- [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget)

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="default-2"></a> `default?` | `any` | - |
| <a id="display-name-2"></a> `display-name?` | `string` | - |
| <a id="filteringparameters-1"></a> `filteringParameters?` | `string`[] | - |
| <a id="id-31"></a> `id` | `string` | - |
| <a id="ismultiselect-1"></a> `isMultiSelect?` | `boolean` | - |
| <a id="name-37"></a> `name` | `string` | - |
| <a id="options-4"></a> `options?` | [`ParameterOptions`](internal.md#parameteroptions) | - |
| <a id="required-3"></a> `required?` | `boolean` | - |
| <a id="sectionid-1"></a> `sectionId?` | `string` | - |
| <a id="slug-3"></a> `slug` | `string` | - |
| <a id="target-4"></a> `target?` | [`ParameterTarget`](internal.md#parametertarget) | - |
| <a id="temporal_units-1"></a> `temporal_units?` | [`TemporalUnit`](internal.md#temporalunit)[] | - |
| <a id="type-32"></a> `type` | `string` | - |
| <a id="value-5"></a> `value?` | `any` | - |
| <a id="values_query_type-1"></a> `values_query_type?` | [`ValuesQueryType`](internal.md#valuesquerytype) | [`ParameterValuesConfig`](internal.md#parametervaluesconfig).[`values_query_type`](internal.md#values_query_type-2) |
| <a id="values_source_config-1"></a> `values_source_config?` | [`ValuesSourceConfig`](internal.md#valuessourceconfig) | [`ParameterValuesConfig`](internal.md#parametervaluesconfig).[`values_source_config`](internal.md#values_source_config-2) |
| <a id="values_source_type-1"></a> `values_source_type?` | [`ValuesSourceType`](internal.md#valuessourcetype) | [`ParameterValuesConfig`](internal.md#parametervaluesconfig).[`values_source_type`](internal.md#values_source_type-2) |

***

## ParameterOptions

### Properties

| Property | Type |
| ------ | ------ |
| <a id="case-sensitive"></a> `case-sensitive` | `boolean` |

***

## ParametersState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="parametervaluescache"></a> `parameterValuesCache` | [`ParameterValuesCache`](internal.md#parametervaluescache-1) |

***

## ParameterValues

### Properties

| Property | Type |
| ------ | ------ |
| <a id="has_more_values-3"></a> `has_more_values` | `boolean` |
| <a id="values-3"></a> `values` | [`ParameterValue`](internal.md#parametervalue)[] |

***

## ParameterValuesConfig

### Extended by

- [`Parameter`](internal.md#parameter)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="values_query_type-2"></a> `values_query_type?` | [`ValuesQueryType`](internal.md#valuesquerytype) |
| <a id="values_source_config-2"></a> `values_source_config?` | [`ValuesSourceConfig`](internal.md#valuessourceconfig) |
| <a id="values_source_type-2"></a> `values_source_type?` | [`ValuesSourceType`](internal.md#valuessourcetype) |

***

## ParameterWithTemplateTagTarget

### Extends

- [`Parameter`](internal.md#parameter)

### Extended by

- [`ValuePopulatedParameter`](internal.md#valuepopulatedparameter)

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="default-3"></a> `default?` | `any` | [`Parameter`](internal.md#parameter).[`default`](internal.md#default-2) |
| <a id="display-name-3"></a> `display-name?` | `string` | [`Parameter`](internal.md#parameter).[`display-name`](internal.md#display-name-2) |
| <a id="filteringparameters-2"></a> `filteringParameters?` | `string`[] | [`Parameter`](internal.md#parameter).[`filteringParameters`](internal.md#filteringparameters-1) |
| <a id="hasvariabletemplatetagtarget-1"></a> `hasVariableTemplateTagTarget?` | `boolean` | - |
| <a id="id-32"></a> `id` | `string` | [`Parameter`](internal.md#parameter).[`id`](internal.md#id-31) |
| <a id="ismultiselect-2"></a> `isMultiSelect?` | `boolean` | [`Parameter`](internal.md#parameter).[`isMultiSelect`](internal.md#ismultiselect-1) |
| <a id="name-38"></a> `name` | `string` | [`Parameter`](internal.md#parameter).[`name`](internal.md#name-37) |
| <a id="options-5"></a> `options?` | [`ParameterOptions`](internal.md#parameteroptions) | [`Parameter`](internal.md#parameter).[`options`](internal.md#options-4) |
| <a id="required-4"></a> `required?` | `boolean` | [`Parameter`](internal.md#parameter).[`required`](internal.md#required-3) |
| <a id="sectionid-2"></a> `sectionId?` | `string` | [`Parameter`](internal.md#parameter).[`sectionId`](internal.md#sectionid-1) |
| <a id="slug-4"></a> `slug` | `string` | [`Parameter`](internal.md#parameter).[`slug`](internal.md#slug-3) |
| <a id="target-5"></a> `target?` | [`ParameterTarget`](internal.md#parametertarget) | [`Parameter`](internal.md#parameter).[`target`](internal.md#target-4) |
| <a id="temporal_units-2"></a> `temporal_units?` | [`TemporalUnit`](internal.md#temporalunit)[] | [`Parameter`](internal.md#parameter).[`temporal_units`](internal.md#temporal_units-1) |
| <a id="type-33"></a> `type` | `string` | [`Parameter`](internal.md#parameter).[`type`](internal.md#type-32) |
| <a id="value-6"></a> `value?` | `any` | [`Parameter`](internal.md#parameter).[`value`](internal.md#value-5) |
| <a id="values_query_type-3"></a> `values_query_type?` | [`ValuesQueryType`](internal.md#valuesquerytype) | [`Parameter`](internal.md#parameter).[`values_query_type`](internal.md#values_query_type-1) |
| <a id="values_source_config-3"></a> `values_source_config?` | [`ValuesSourceConfig`](internal.md#valuessourceconfig) | [`Parameter`](internal.md#parameter).[`values_source_config`](internal.md#values_source_config-1) |
| <a id="values_source_type-3"></a> `values_source_type?` | [`ValuesSourceType`](internal.md#valuessourcetype) | [`Parameter`](internal.md#parameter).[`values_source_type`](internal.md#values_source_type-1) |

***

## PieRow

### Properties

| Property | Type |
| ------ | ------ |
| <a id="color"></a> `color` | `string` |
| <a id="defaultcolor"></a> `defaultColor` | `boolean` |
| <a id="enabled"></a> `enabled` | `boolean` |
| <a id="hidden-1"></a> `hidden` | `boolean` |
| <a id="isother"></a> `isOther` | `boolean` |
| <a id="key"></a> `key` | `string` |
| <a id="name-39"></a> `name` | `string` |
| <a id="originalname-2"></a> `originalName` | `string` |

***

## PublicSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="airgap-enabled"></a> `airgap-enabled` | `boolean` |
| <a id="allowed-iframe-hosts"></a> `allowed-iframe-hosts` | `string` |
| <a id="anon-tracking-enabled"></a> `anon-tracking-enabled` | `boolean` |
| <a id="application-favicon-url"></a> `application-favicon-url` | `string` |
| <a id="application-font"></a> `application-font` | `string` |
| <a id="application-font-files"></a> `application-font-files` | `null` \| [`FontFile`](internal.md#fontfile)[] |
| <a id="application-name"></a> `application-name` | `string` |
| <a id="available-fonts"></a> `available-fonts` | `string`[] |
| <a id="available-locales"></a> `available-locales` | `null` \| [`LocaleData`](internal.md#localedata)[] |
| <a id="bug-reporting-enabled"></a> `bug-reporting-enabled` | `boolean` |
| <a id="check-for-updates"></a> `check-for-updates` | `boolean` |
| <a id="cloud-gateway-ips"></a> `cloud-gateway-ips` | `null` \| `string`[] |
| <a id="custom-formatting"></a> `custom-formatting` | [`FormattingSettings`](internal.md#formattingsettings) |
| <a id="custom-homepage"></a> `custom-homepage` | `boolean` |
| <a id="custom-homepage-dashboard"></a> `custom-homepage-dashboard` | `null` \| `number` |
| <a id="ee-ai-features-enabled"></a> `ee-ai-features-enabled?` | `boolean` |
| <a id="email-configured?"></a> `email-configured?` | `boolean` |
| <a id="embedding-app-origin"></a> `embedding-app-origin` | `null` \| `string` |
| <a id="embedding-app-origins-interactive"></a> `embedding-app-origins-interactive` | `null` \| `string` |
| <a id="embedding-app-origins-sdk"></a> `embedding-app-origins-sdk` | `null` \| `string` |
| <a id="enable-enhancements?"></a> `enable-enhancements?` | `boolean` |
| <a id="enable-password-login"></a> `enable-password-login` | `boolean` |
| <a id="enable-pivoted-exports"></a> `enable-pivoted-exports` | `boolean` |
| <a id="engines"></a> `engines` | `Record`\<`string`, [`Engine`](internal.md#engine-3)\> |
| <a id="google-auth-client-id"></a> `google-auth-client-id` | `null` \| `string` |
| <a id="google-auth-enabled"></a> `google-auth-enabled` | `boolean` |
| <a id="gsheets"></a> `gsheets` | \{ `error`: `string`; `folder_url`: `null` \| `string`; `status`: `"error"` \| `"complete"` \| `"loading"` \| `"not-connected"`; \} |
| `gsheets.error?` | `string` |
| `gsheets.folder_url` | `null` \| `string` |
| `gsheets.status` | `"error"` \| `"complete"` \| `"loading"` \| `"not-connected"` |
| <a id="has-user-setup"></a> `has-user-setup` | `boolean` |
| <a id="help-link"></a> `help-link` | [`HelpLinkSetting`](internal.md#helplinksetting) |
| <a id="help-link-custom-destination"></a> `help-link-custom-destination` | `string` |
| <a id="hide-embed-branding?"></a> `hide-embed-branding?` | `boolean` |
| <a id="humanization-strategy"></a> `humanization-strategy` | `"none"` \| `"simple"` |
| <a id="is-hosted?"></a> `is-hosted?` | `boolean` |
| <a id="ldap-configured?"></a> `ldap-configured?` | `boolean` |
| <a id="ldap-enabled"></a> `ldap-enabled` | `boolean` |
| <a id="ldap-group-membership-filter"></a> `ldap-group-membership-filter` | `string` |
| <a id="ldap-port"></a> `ldap-port` | `number` |
| <a id="loading-message"></a> `loading-message` | [`LoadingMessage`](internal.md#loadingmessage) |
| <a id="map-tile-server-url"></a> `map-tile-server-url` | `string` |
| <a id="native-query-autocomplete-match-style"></a> `native-query-autocomplete-match-style` | [`AutocompleteMatchStyle`](internal.md#autocompletematchstyle) |
| <a id="other-sso-enabled?-1"></a> `other-sso-enabled?` | `null` \| `boolean` |
| <a id="password-complexity"></a> `password-complexity` | [`PasswordComplexity`](internal.md#passwordcomplexity) |
| <a id="persisted-model-refresh-cron-schedule"></a> `persisted-model-refresh-cron-schedule` | `string` |
| <a id="persisted-models-enabled"></a> `persisted-models-enabled` | `boolean` |
| <a id="report-timezone-long"></a> `report-timezone-long` | `string` |
| <a id="report-timezone-short"></a> `report-timezone-short` | `string` |
| <a id="session-cookies"></a> `session-cookies` | `null` \| `boolean` |
| <a id="setup-token"></a> `setup-token` | `null` \| `string` |
| <a id="show-google-sheets-integration"></a> `show-google-sheets-integration` | `boolean` |
| <a id="show-metabase-links"></a> `show-metabase-links` | `boolean` |
| <a id="show-metabot"></a> `show-metabot` | `boolean` |
| <a id="site-locale"></a> `site-locale` | `string` |
| <a id="site-url"></a> `site-url` | `string` |
| <a id="snowplow-enabled"></a> `snowplow-enabled` | `boolean` |
| <a id="snowplow-url"></a> `snowplow-url` | `string` |
| <a id="start-of-week"></a> `start-of-week` | [`DayOfWeekId`](internal.md#dayofweekid) |
| <a id="token-features"></a> `token-features` | [`TokenFeatures`](internal.md#tokenfeatures) |
| <a id="update-channel"></a> `update-channel` | [`UpdateChannel`](internal.md#updatechannel) |
| <a id="version"></a> `version` | [`Version`](internal.md#version-1) |
| <a id="version-info-last-checked"></a> `version-info-last-checked` | `null` \| `string` |

***

## QueryAction

### Properties

| Property | Type |
| ------ | ------ |
| <a id="dataset_query-1"></a> `dataset_query` | [`NativeDatasetQuery`](internal.md#nativedatasetquery) |
| <a id="type-34"></a> `type` | `"query"` |

***

## QueryBuilderDashboardState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="dashboardid-2"></a> `dashboardId` | `null` \| [`DashboardId`](internal.md#dashboardid-4) |
| <a id="isediting"></a> `isEditing` | `boolean` |

***

## QueryBuilderLoadingControls

### Properties

| Property | Type |
| ------ | ------ |
| <a id="documenttitle"></a> `documentTitle` | `string` |
| <a id="showloadcompletefavicon"></a> `showLoadCompleteFavicon` | `boolean` |
| <a id="timeoutid"></a> `timeoutId` | `string` |

***

## QueryBuilderState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="cancelquerydeferred"></a> `cancelQueryDeferred` | `null` \| [`Deferred`](internal.md#deferredt)\<`void`\> |
| <a id="card"></a> `card` | \| `null` \| [`Card`](internal.md#cardq)\<[`DatasetQuery`](internal.md#datasetquery-3)\> |
| <a id="currentstate"></a> `currentState` | \| `null` \| \{ `card`: [`Card`](internal.md#cardq); `cardId`: `number`; `serializedCard`: `string`; \} |
| <a id="lastruncard"></a> `lastRunCard` | \| `null` \| [`Card`](internal.md#cardq)\<[`DatasetQuery`](internal.md#datasetquery-3)\> |
| <a id="loadingcontrols-1"></a> `loadingControls` | [`QueryBuilderLoadingControls`](internal.md#querybuilderloadingcontrols) |
| <a id="metadatadiff"></a> `metadataDiff` | `Record`\<`string`, `Partial`\<[`Field`](internal.md#field-5)\>\> |
| <a id="originalcard"></a> `originalCard` | \| `null` \| [`Card`](internal.md#cardq)\<[`DatasetQuery`](internal.md#datasetquery-3)\> |
| <a id="parametervalues-2"></a> `parameterValues` | `Record`\<`string`, [`ParameterValueOrArray`](internal.md#parametervalueorarray)\> |
| <a id="parentdashboard"></a> `parentDashboard` | [`QueryBuilderDashboardState`](internal.md#querybuilderdashboardstate) |
| <a id="queryresults"></a> `queryResults` | `null` \| [`Dataset`](internal.md#dataset)[] |
| <a id="querystarttime"></a> `queryStartTime` | `null` \| `number` |
| <a id="querystatus"></a> `queryStatus` | [`QueryBuilderQueryStatus`](internal.md#querybuilderquerystatus) |
| <a id="selectedtimelineeventids"></a> `selectedTimelineEventIds` | `number`[] |
| <a id="tableforeignkeyreferences"></a> `tableForeignKeyReferences` | \| `null` \| `Record`\<`number`, [`ForeignKeyReference`](internal.md#foreignkeyreference)\> |
| <a id="uicontrols"></a> `uiControls` | [`QueryBuilderUIControls`](internal.md#querybuilderuicontrols) |
| <a id="zoomedrowobjectid"></a> `zoomedRowObjectId` | `null` \| `string` \| `number` |

***

## QueryBuilderUIControls

### Properties

| Property | Type |
| ------ | ------ |
| <a id="datareferencestack"></a> `dataReferenceStack` | `null` |
| <a id="dataseteditortab"></a> `datasetEditorTab` | [`DatasetEditorTab`](internal.md#dataseteditortab-1) |
| <a id="initialchartsetting"></a> `initialChartSetting` | [`InitialChartSettingState`](internal.md#initialchartsettingstate) |
| <a id="ismodifiedfromnotebook"></a> `isModifiedFromNotebook` | `boolean` |
| <a id="isnativeeditoropen"></a> `isNativeEditorOpen` | `boolean` |
| <a id="isquerycomplete"></a> `isQueryComplete` | `boolean` |
| <a id="isrunning"></a> `isRunning` | `boolean` |
| <a id="isshowingchartsettingssidebar"></a> `isShowingChartSettingsSidebar` | `boolean` |
| <a id="isshowingcharttypesidebar"></a> `isShowingChartTypeSidebar` | `boolean` |
| <a id="isshowingdatareference"></a> `isShowingDataReference` | `boolean` |
| <a id="isshowingnewbmodal"></a> `isShowingNewbModal` | `boolean` |
| <a id="isshowingnotebooknativepreview"></a> `isShowingNotebookNativePreview` | `boolean` |
| <a id="isshowingquestiondetailssidebar"></a> `isShowingQuestionDetailsSidebar` | `boolean` |
| <a id="isshowingquestioninfosidebar"></a> `isShowingQuestionInfoSidebar` | `boolean` |
| <a id="isshowingrawtable"></a> `isShowingRawTable` | `boolean` |
| <a id="isshowingsnippetsidebar"></a> `isShowingSnippetSidebar` | `boolean` |
| <a id="isshowingsummarysidebar"></a> `isShowingSummarySidebar` | `boolean` |
| <a id="isshowingtemplatetagseditor"></a> `isShowingTemplateTagsEditor` | `boolean` |
| <a id="isshowingtimelinesidebar"></a> `isShowingTimelineSidebar` | `boolean` |
| <a id="modal"></a> `modal` | `null` \| [`QueryModalType`](internal.md#querymodaltype) |
| <a id="modalcontext"></a> `modalContext` | `null` \| `number` |
| <a id="notebooknativepreviewsidebarwidth"></a> `notebookNativePreviewSidebarWidth` | `null` \| `number` |
| <a id="previousquerybuildermode"></a> `previousQueryBuilderMode` | `boolean` |
| <a id="querybuildermode"></a> `queryBuilderMode` | `false` \| [`QueryBuilderMode`](internal.md#querybuildermode-1) |
| <a id="showsidebartitle"></a> `showSidebarTitle` | `boolean` |
| <a id="snippetcollectionid"></a> `snippetCollectionId` | `null` \| `number` |

***

## QuestionCustomDestinationClickBehavior

### Properties

| Property | Type |
| ------ | ------ |
| <a id="linktype-2"></a> `linkType` | `"question"` |
| <a id="parametermapping-2"></a> `parameterMapping?` | [`ClickBehaviorParameterMapping`](internal.md#clickbehaviorparametermapping) |
| <a id="targetid-1"></a> `targetId?` | `number` |
| <a id="type-35"></a> `type` | `"link"` |

***

## ReferenceOptions

### Properties

| Property | Type |
| ------ | ------ |
| <a id="base-type"></a> `base-type?` | `string` |
| <a id="binning"></a> `binning?` | [`BinningOptions`](internal.md#binningoptions) |
| <a id="join-alias"></a> `join-alias?` | `string` |
| <a id="temporal-unit"></a> `temporal-unit?` | [`DatetimeUnit`](internal.md#datetimeunit) |

***

## RequestState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="_isrequeststate"></a> `_isRequestState` | `true` |
| <a id="error-2"></a> `error` | `unknown` |
| <a id="fetched"></a> `fetched` | `boolean` |
| <a id="loaded"></a> `loaded` | `boolean` |
| <a id="loading"></a> `loading` | `boolean` |

***

## ResultsMetadata

### Properties

| Property | Type |
| ------ | ------ |
| <a id="columns"></a> `columns` | [`DatasetColumn`](internal.md#datasetcolumn)[] |

***

## ScheduleSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="schedule_day"></a> `schedule_day?` | `null` \| [`ScheduleDayType`](internal.md#scheduledaytype) |
| <a id="schedule_frame"></a> `schedule_frame?` | `null` \| [`ScheduleFrameType`](internal.md#scheduleframetype) |
| <a id="schedule_hour"></a> `schedule_hour?` | `null` \| `number` |
| <a id="schedule_minute"></a> `schedule_minute?` | `null` \| `number` |
| <a id="schedule_type"></a> `schedule_type?` | `null` \| [`ScheduleType`](internal.md#scheduletype) |

***

## ScheduleStrategy

### Extends

- [`CacheStrategyBase`](internal.md#cachestrategybase)

### Properties

| Property | Type | Overrides |
| ------ | ------ | ------ |
| <a id="refresh_automatically-1"></a> `refresh_automatically` | `boolean` | - |
| <a id="schedule"></a> `schedule` | `string` | - |
| <a id="type-36"></a> `type` | `"schedule"` | [`CacheStrategyBase`](internal.md#cachestrategybase).[`type`](internal.md#type-6) |

***

## Schema

### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-33"></a> `id` | `string` |
| <a id="name-40"></a> `name` | `string` |

***

## SdkStoreState

### Extends

- [`State`](internal.md#state)

### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="admin"></a> `admin` | [`AdminState`](internal.md#adminstate) | [`State`](internal.md#state).[`admin`](internal.md#admin-1) |
| <a id="app-1"></a> `app` | [`AppState`](internal.md#appstate) | [`State`](internal.md#state).[`app`](internal.md#app-2) |
| <a id="auth"></a> `auth` | [`AuthState`](internal.md#authstate) | [`State`](internal.md#state).[`auth`](internal.md#auth-1) |
| <a id="currentuser"></a> `currentUser` | `null` \| [`User`](internal.md#user-1) | [`State`](internal.md#state).[`currentUser`](internal.md#currentuser-1) |
| <a id="dashboard-2"></a> `dashboard` | [`DashboardState`](internal.md#dashboardstate) | [`State`](internal.md#state).[`dashboard`](internal.md#dashboard-3) |
| <a id="downloads"></a> `downloads` | [`DownloadsState`](internal.md#downloadsstate) | [`State`](internal.md#state).[`downloads`](internal.md#downloads-1) |
| <a id="embed"></a> `embed` | [`EmbedState`](internal.md#embedstate) | [`State`](internal.md#state).[`embed`](internal.md#embed-1) |
| <a id="entities"></a> `entities` | [`EntitiesState`](internal.md#entitiesstate) | [`State`](internal.md#state).[`entities`](internal.md#entities-1) |
| <a id="modal-1"></a> `modal` | [`ModalName`](internal.md#modalname) | [`State`](internal.md#state).[`modal`](internal.md#modal-2) |
| <a id="parameters-4"></a> `parameters` | [`ParametersState`](internal.md#parametersstate) | [`State`](internal.md#state).[`parameters`](internal.md#parameters-5) |
| <a id="qb"></a> `qb` | [`QueryBuilderState`](internal.md#querybuilderstate) | [`State`](internal.md#state).[`qb`](internal.md#qb-1) |
| <a id="requests"></a> `requests` | [`RequestsState`](internal.md#requestsstate) | [`State`](internal.md#state).[`requests`](internal.md#requests-1) |
| <a id="routing"></a> `routing` | `RouterState` | [`State`](internal.md#state).[`routing`](internal.md#routing-1) |
| <a id="sdk"></a> `sdk` | [`SdkState`](internal.md#sdkstate) | - |
| <a id="settings-12"></a> `settings` | [`SettingsState`](internal.md#settingsstate) | [`State`](internal.md#state).[`settings`](internal.md#settings-13) |
| <a id="setup"></a> `setup` | [`SetupState`](internal.md#setupstate) | [`State`](internal.md#state).[`setup`](internal.md#setup-1) |
| <a id="undo"></a> `undo` | [`UndoState`](internal.md#undostate) | [`State`](internal.md#state).[`undo`](internal.md#undo-1) |
| <a id="upload"></a> `upload` | [`FileUploadState`](internal.md#fileuploadstate) | [`State`](internal.md#state).[`upload`](internal.md#upload-1) |

***

## SdkUsageProblem

### Properties

| Property | Type |
| ------ | ------ |
| <a id="documentationurl"></a> `documentationUrl` | `string` |
| <a id="message"></a> `message` | `string` |
| <a id="severity"></a> `severity` | `"error"` \| `"warning"` |
| <a id="type-37"></a> `type` | \| `"API_KEYS_WITHOUT_LICENSE"` \| `"API_KEYS_WITH_LICENSE"` \| `"SSO_WITHOUT_LICENSE"` \| `"CONFLICTING_AUTH_METHODS"` \| `"JWT_PROVIDER_URI_DEPRECATED"` \| `"NO_AUTH_METHOD_PROVIDED"` \| `"EMBEDDING_SDK_NOT_ENABLED"` |

***

## Segment

### Properties

| Property | Type |
| ------ | ------ |
| <a id="archived-8"></a> `archived` | `boolean` |
| <a id="definition-2"></a> `definition` | [`StructuredQuery`](internal.md#structuredquery-1) |
| <a id="definition_description-2"></a> `definition_description` | `string` |
| <a id="description-19"></a> `description` | `string` |
| <a id="id-34"></a> `id` | `number` |
| <a id="name-41"></a> `name` | `string` |
| <a id="revision_message-2"></a> `revision_message?` | `string` |
| <a id="table-8"></a> `table?` | [`Table`](internal.md#table-12) |
| <a id="table_id-6"></a> `table_id` | [`TableId`](internal.md#tableid-3) |

***

## SettingDefinition\<Key\>

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Key` *extends* [`SettingKey`](internal.md#settingkey) | [`SettingKey`](internal.md#settingkey) |

### Properties

| Property | Type |
| ------ | ------ |
| <a id="default-4"></a> `default?` | [`SettingValue`](internal.md#settingvaluekey)\<`Key`\> |
| <a id="description-20"></a> `description?` | `ReactNode` |
| <a id="display_name-6"></a> `display_name?` | `string` |
| <a id="env_name"></a> `env_name?` | `string` |
| <a id="is_env_setting"></a> `is_env_setting?` | `boolean` |
| <a id="key-1"></a> `key` | `Key` |
| <a id="type-38"></a> `type?` | [`InputSettingType`](internal.md#inputsettingtype) |
| <a id="value-7"></a> `value?` | [`SettingValue`](internal.md#settingvaluekey)\<`Key`\> |

***

## SettingsManagerSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="bcc-enabled?"></a> `bcc-enabled?` | `boolean` |
| <a id="ee-openai-api-key"></a> `ee-openai-api-key?` | `string` |
| <a id="openai-api-key"></a> `openai-api-key` | `null` \| `string` |
| <a id="openai-available-models"></a> `openai-available-models?` | [`OpenAiModel`](internal.md#openaimodel)[] |
| <a id="openai-model"></a> `openai-model` | `null` \| `string` |
| <a id="openai-organization"></a> `openai-organization` | `null` \| `string` |
| <a id="session-cookie-samesite"></a> `session-cookie-samesite` | [`SessionCookieSameSite`](internal.md#sessioncookiesamesite) |
| <a id="slack-app-token"></a> `slack-app-token` | `null` \| `string` |
| <a id="slack-bug-report-channel"></a> `slack-bug-report-channel` | `null` \| `string` |
| <a id="slack-token"></a> `slack-token` | `null` \| `string` |
| <a id="slack-token-valid?"></a> `slack-token-valid?` | `boolean` |

***

## SettingsState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="loading-1"></a> `loading` | `boolean` |
| <a id="values-4"></a> `values` | [`Settings`](internal.md#settings-15) |

***

## SetupState

### Properties

| Property | Type |
| ------ | ------ |
| <a id="database-6"></a> `database?` | [`DatabaseData`](internal.md#databasedata) |
| <a id="databaseengine"></a> `databaseEngine?` | `string` |
| <a id="invite"></a> `invite?` | [`InviteInfo`](internal.md#inviteinfo) |
| <a id="islocaleloaded"></a> `isLocaleLoaded` | `boolean` |
| <a id="istrackingallowed"></a> `isTrackingAllowed` | `boolean` |
| <a id="licensetoken"></a> `licenseToken?` | `null` \| `string` |
| <a id="locale-3"></a> `locale?` | [`Locale`](internal.md#locale-2) |
| <a id="step"></a> `step` | [`SetupStep`](internal.md#setupstep) |
| <a id="usagereason"></a> `usageReason?` | [`UsageReason`](internal.md#usagereason-1) |
| <a id="user"></a> `user?` | [`UserInfo`](internal.md#userinfo) |

***

## SmartScalarComparisonAnotherColumn

### Extends

- [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="column-2"></a> `column` | `string` | - | - |
| <a id="id-35"></a> `id` | `string` | - | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`id`](internal.md#id-5) |
| <a id="label"></a> `label` | `string` | - | - |
| <a id="type-39"></a> `type` | `"anotherColumn"` | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`type`](internal.md#type-5) | - |

***

## SmartScalarComparisonPeriodsAgo

### Extends

- [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="id-36"></a> `id` | `string` | - | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`id`](internal.md#id-5) |
| <a id="type-40"></a> `type` | `"periodsAgo"` | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`type`](internal.md#type-5) | - |
| <a id="value-8"></a> `value` | `number` | - | - |

***

## SmartScalarComparisonPreviousPeriod

### Extends

- [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="id-37"></a> `id` | `string` | - | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`id`](internal.md#id-5) |
| <a id="type-41"></a> `type` | `"previousPeriod"` | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`type`](internal.md#type-5) | - |

***

## SmartScalarComparisonPreviousValue

### Extends

- [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="id-38"></a> `id` | `string` | - | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`id`](internal.md#id-5) |
| <a id="type-42"></a> `type` | `"previousValue"` | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`type`](internal.md#type-5) | - |

***

## SmartScalarComparisonStaticNumber

### Extends

- [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="id-39"></a> `id` | `string` | - | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`id`](internal.md#id-5) |
| <a id="label-1"></a> `label` | `string` | - | - |
| <a id="type-43"></a> `type` | `"staticNumber"` | [`BaseSmartScalarComparison`](internal.md#basesmartscalarcomparison).[`type`](internal.md#type-5) | - |
| <a id="value-9"></a> `value` | `number` | - | - |

***

## State

### Extended by

- [`SdkStoreState`](internal.md#sdkstorestate)

### Properties

| Property | Type |
| ------ | ------ |
| <a id="admin-1"></a> `admin` | [`AdminState`](internal.md#adminstate) |
| <a id="app-2"></a> `app` | [`AppState`](internal.md#appstate) |
| <a id="auth-1"></a> `auth` | [`AuthState`](internal.md#authstate) |
| <a id="currentuser-1"></a> `currentUser` | `null` \| [`User`](internal.md#user-1) |
| <a id="dashboard-3"></a> `dashboard` | [`DashboardState`](internal.md#dashboardstate) |
| <a id="downloads-1"></a> `downloads` | [`DownloadsState`](internal.md#downloadsstate) |
| <a id="embed-1"></a> `embed` | [`EmbedState`](internal.md#embedstate) |
| <a id="entities-1"></a> `entities` | [`EntitiesState`](internal.md#entitiesstate) |
| <a id="modal-2"></a> `modal` | [`ModalName`](internal.md#modalname) |
| <a id="parameters-5"></a> `parameters` | [`ParametersState`](internal.md#parametersstate) |
| <a id="qb-1"></a> `qb` | [`QueryBuilderState`](internal.md#querybuilderstate) |
| <a id="requests-1"></a> `requests` | [`RequestsState`](internal.md#requestsstate) |
| <a id="routing-1"></a> `routing` | `RouterState` |
| <a id="settings-13"></a> `settings` | [`SettingsState`](internal.md#settingsstate) |
| <a id="setup-1"></a> `setup` | [`SetupState`](internal.md#setupstate) |
| <a id="undo-1"></a> `undo` | [`UndoState`](internal.md#undostate) |
| <a id="upload-1"></a> `upload` | [`FileUploadState`](internal.md#fileuploadstate) |

***

## StructuredDatasetQuery

### Properties

| Property | Type |
| ------ | ------ |
| <a id="database-7"></a> `database` | `null` \| `number` |
| <a id="parameters-6"></a> `parameters?` | [`UiParameter`](internal.md#uiparameter)[] |
| <a id="query-4"></a> `query` | [`StructuredQuery`](internal.md#structuredquery-1) |
| <a id="type-44"></a> `type` | `"query"` |

***

## TemplateTag

### Properties

| Property | Type |
| ------ | ------ |
| <a id="card-id"></a> `card-id?` | `number` |
| <a id="default-5"></a> `default?` | `null` \| `string` |
| <a id="dimension-3"></a> `dimension?` | [`LocalFieldReference`](internal.md#localfieldreference) |
| <a id="display-name-4"></a> `display-name` | `string` |
| <a id="id-40"></a> `id` | `string` |
| <a id="name-42"></a> `name` | `string` |
| <a id="options-6"></a> `options?` | [`ParameterOptions`](internal.md#parameteroptions) |
| <a id="required-5"></a> `required?` | `boolean` |
| <a id="snippet-id"></a> `snippet-id?` | `number` |
| <a id="snippet-name"></a> `snippet-name?` | `string` |
| <a id="type-45"></a> `type` | [`TemplateTagType`](internal.md#templatetagtype) |
| <a id="widget-type"></a> `widget-type?` | `string` |

***

## TokenStatus

### Properties

| Property | Type |
| ------ | ------ |
| <a id="error-details"></a> `error-details?` | `string` |
| <a id="features-3"></a> `features?` | ( \| `"advanced-config"` \| `"advanced-permissions"` \| `"audit-app"` \| `"cache-granular-controls"` \| `"collection-cleanup"` \| `"config-text-file"` \| `"content-management"` \| `"content-verification"` \| `"dashboard-subscription-filters"` \| `"database-auth-providers"` \| `"disable-password-login"` \| `"email-allow-list"` \| `"email-restrict-recipients"` \| `"embedding-sdk"` \| `"embedding"` \| `"hosting"` \| `"metabase-store-managed"` \| `"metabot-v3"` \| `"no-upsell"` \| `"official-collections"` \| `"query-reference-validation"` \| `"question-error-logs"` \| `"sandboxes"` \| `"scim"` \| `"serialization"` \| `"session-timeout-config"` \| `"snippet-collections"` \| `"sso-google"` \| `"sso-jwt"` \| `"sso-ldap"` \| `"sso-saml"` \| `"sso"` \| `"upload-management"` \| `"whitelabel"`)[] |
| <a id="status-3"></a> `status` | `string` |
| <a id="trial"></a> `trial?` | `boolean` |
| <a id="valid"></a> `valid` | `boolean` |
| <a id="valid-thru"></a> `valid-thru?` | `string` |

***

## Undo

### Properties

| Property | Type |
| ------ | ------ |
| <a id="_domid"></a> `_domId?` | `string` \| `number` |
| <a id="action"></a> `action?` | `null` \| () => `void` |
| <a id="actionlabel"></a> `actionLabel?` | `string` |
| <a id="actions-1"></a> `actions?` | () => `void`[] |
| <a id="candismiss"></a> `canDismiss?` | `boolean` |
| <a id="count-1"></a> `count?` | `number` |
| <a id="dismissiconcolor"></a> `dismissIconColor?` | `string` |
| <a id="extrainfo"></a> `extraInfo?` | \{ `dashcardIds`: `number`[]; `tabId`: `number`; \} & `Record`\<`string`, `unknown`\> |
| <a id="icon-5"></a> `icon?` | \| `null` \| `"string"` \| `"number"` \| `"function"` \| `"area"` \| `"embed"` \| `"link"` \| `"eye"` \| `"search"` \| `"sort"` \| `"filter"` \| `"refresh"` \| `"label"` \| `"progress"` \| `"section"` \| `"table"` \| `"document"` \| `"close"` \| `"location"` \| `"click"` \| `"copy"` \| `"pause"` \| `"play"` \| `"int"` \| `"return"` \| `"fields"` \| `"key"` \| `"empty"` \| `"check"` \| `"line"` \| `"unknown"` \| `"list"` \| `"lines"` \| `"warning"` \| `"info"` \| `"tab"` \| `"database"` \| `"field"` \| `"segment"` \| `"metric"` \| `"snippet"` \| `"dashboard"` \| `"pulse"` \| `"collection"` \| `"question"` \| `"variable"` \| `"share"` \| `"sum"` \| `"breakout"` \| `"index"` \| `"external"` \| `"model"` \| `"history"` \| `"move"` \| `"person"` \| `"extract"` \| `"split"` \| `"revert"` \| `"grid"` \| `"alert"` \| `"group"` \| `"add"` \| `"ellipsis"` \| `"clone"` \| `"bar"` \| `"add_column"` \| `"add_data"` \| `"add_row"` \| `"add_to_dash"` \| `"ai"` \| `"alert_filled"` \| `"alert_confirm"` \| `"archive"` \| `"attachment"` \| `"arrow_up"` \| `"arrow_down"` \| `"arrow_left"` \| `"arrow_left_to_line"` \| `"arrow_right"` \| `"arrow_split"` \| `"audit"` \| `"badge"` \| `"bell"` \| `"birthday"` \| `"bookmark"` \| `"bookmark_filled"` \| `"bolt"` \| `"bolt_filled"` \| `"bubble"` \| `"burger"` \| `"calendar"` \| `"chevrondown"` \| `"chevronleft"` \| `"chevronright"` \| `"chevronup"` \| `"clipboard"` \| `"clock"` \| `"cloud"` \| `"cloud_filled"` \| `"compare"` \| `"combine"` \| `"connections"` \| `"contract"` \| `"curved"` \| `"dash"` \| `"curve"` \| `"download"` \| `"dyno"` \| `"edit_document"` \| `"enter_or_return"` \| `"expand"` \| `"expand_arrow"` \| `"eye_crossed_out"` \| `"eye_outline"` \| `"bug"` \| `"format_code"` \| `"formula"` \| `"funnel"` \| `"funnel_outline"` \| `"folder"` \| `"folder_filled"` \| `"gauge"` \| `"gear"` \| `"gem"` \| `"globe"` \| `"grabber"` \| `"google"` \| `"google_drive"` \| `"google_sheet"` \| `"home"` \| `"horizontal_bar"` \| `"hourglass"` \| `"info_filled"` \| `"info_outline"` \| `"insight"` \| `"io"` \| `"join_full_outer"` \| `"join_inner"` \| `"join_left_outer"` \| `"join_right_outer"` \| `"ldap"` \| `"learn"` \| `"lightbulb"` \| `"lineandbar"` \| `"line_style_dashed"` \| `"line_style_dotted"` \| `"line_style_solid"` \| `"lock"` \| `"lock_filled"` \| `"mail"` \| `"mail_filled"` \| `"model_with_badge"` \| `"moon"` \| `"move_card"` \| `"new_folder"` \| `"notebook"` \| `"palette"` \| `"pencil"` \| `"pencil_lines"` \| `"permissions_limited"` \| `"pie"` \| `"pin"` \| `"pinmap"` \| `"pivot_table"` \| `"play_outlined"` \| `"popover"` \| `"popular"` \| `"recents"` \| `"sankey"` \| `"sql"` \| `"subscription"` \| `"straight"` \| `"stepped"` \| `"sort_arrows"` \| `"sync"` \| `"reference"` \| `"refresh_downstream"` \| `"rocket"` \| `"ruler"` \| `"shield"` \| `"sidebar_closed"` \| `"sidebar_open"` \| `"slack"` \| `"slack_colorized"` \| `"smartscalar"` \| `"sparkles"` \| `"star_filled"` \| `"star"` \| `"store"` \| `"sun"` \| `"t-shirt"` \| `"table2"` \| `"time_history"` \| `"trash"` \| `"trash_filled"` \| `"triangle_left"` \| `"triangle_right"` \| `"unarchive"` \| `"unpin"` \| `"unsubscribe"` \| `"upload"` \| `"verified"` \| `"official_collection"` \| `"verified_filled"` \| `"view_archive"` \| `"warning_round_filled"` \| `"waterfall"` \| `"webhook"` \| `"10k"` \| `"1m"` \| `"zoom_in"` \| `"zoom_out"` \| `"scalar"` \| `"cake"` \| `"table_spaced"` \| `"beaker"` \| `"eye_filled"` |
| <a id="id-41"></a> `id` | `string` \| `number` |
| <a id="initialtimeout"></a> `initialTimeout?` | `number` |
| <a id="message-1"></a> `message?` | `string` \| (`undo`: [`Undo`](internal.md#undo-2)) => `string` |
| <a id="pausedat"></a> `pausedAt?` | `null` \| `number` |
| <a id="showprogress"></a> `showProgress?` | `boolean` |
| <a id="startedat"></a> `startedAt?` | `number` |
| <a id="subject"></a> `subject?` | `string` |
| <a id="timeout"></a> `timeout?` | `number` |
| <a id="timeoutid-1"></a> `timeoutId` | `null` \| `number` |
| <a id="toastcolor"></a> `toastColor?` | `string` |
| <a id="type-46"></a> `type?` | `string` |
| <a id="verb"></a> `verb?` | `string` |

***

## UnsavedCard\<Q\>

### Extended by

- [`Card`](internal.md#cardq)

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Q` *extends* [`DatasetQuery`](internal.md#datasetquery-3) | [`DatasetQuery`](internal.md#datasetquery-3) |

### Properties

| Property | Type |
| ------ | ------ |
| <a id="dashboardid-3"></a> `dashboardId?` | [`DashboardId`](internal.md#dashboardid-4) |
| <a id="dashcardid-1"></a> `dashcardId?` | `number` |
| <a id="dataset_query-2"></a> `dataset_query` | `Q` |
| <a id="display-3"></a> `display` | [`VisualizationDisplay`](internal.md#visualizationdisplay) |
| <a id="original_card_id-1"></a> `original_card_id?` | `number` |
| <a id="parameters-7"></a> `parameters?` | [`Parameter`](internal.md#parameter)[] |
| <a id="visualization_settings-1"></a> `visualization_settings` | [`VisualizationSettings`](internal.md#visualizationsettings) |

***

## UpdateActionClickBehavior

### Extends

- [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="actiontype-3"></a> `actionType` | `"update"` | [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior).[`actionType`](internal.md#actiontype) | - |
| <a id="objectdetaildashcardid-1"></a> `objectDetailDashCardId` | `number` | - | - |
| <a id="type-47"></a> `type` | `"action"` | - | [`BaseActionClickBehavior`](internal.md#baseactionclickbehavior).[`type`](internal.md#type-4) |

***

## UploadsSettings

### Properties

| Property | Type |
| ------ | ------ |
| <a id="db_id-2"></a> `db_id` | `null` \| `number` |
| <a id="schema_name-2"></a> `schema_name` | `null` \| `string` |
| <a id="table_prefix"></a> `table_prefix` | `null` \| `string` |

***

## User

### Extends

- [`BaseUser`](internal.md#baseuser)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="common_name-1"></a> `common_name` | `string` | - | [`BaseUser`](internal.md#baseuser).[`common_name`](internal.md#common_name) |
| <a id="custom_homepage"></a> `custom_homepage` | \| `null` \| \{ `dashboard_id`: [`DashboardId`](internal.md#dashboardid-4); \} | - | - |
| <a id="date_joined-1"></a> `date_joined` | `string` | - | [`BaseUser`](internal.md#baseuser).[`date_joined`](internal.md#date_joined) |
| <a id="email-2"></a> `email` | `string` | - | [`BaseUser`](internal.md#baseuser).[`email`](internal.md#email) |
| <a id="first_login-1"></a> `first_login` | `string` | - | [`BaseUser`](internal.md#baseuser).[`first_login`](internal.md#first_login) |
| <a id="first_name-2"></a> `first_name` | `null` \| `string` | - | [`BaseUser`](internal.md#baseuser).[`first_name`](internal.md#first_name) |
| <a id="google_auth-1"></a> `google_auth` | `boolean` | [`BaseUser`](internal.md#baseuser).[`google_auth`](internal.md#google_auth) | - |
| <a id="has_invited_second_user"></a> `has_invited_second_user` | `boolean` | - | - |
| <a id="has_question_and_dashboard"></a> `has_question_and_dashboard` | `boolean` | - | - |
| <a id="id-42"></a> `id` | `number` | - | [`BaseUser`](internal.md#baseuser).[`id`](internal.md#id-6) |
| <a id="is_active-1"></a> `is_active` | `boolean` | - | [`BaseUser`](internal.md#baseuser).[`is_active`](internal.md#is_active) |
| <a id="is_installer"></a> `is_installer` | `boolean` | - | - |
| <a id="is_qbnewb-1"></a> `is_qbnewb` | `boolean` | - | [`BaseUser`](internal.md#baseuser).[`is_qbnewb`](internal.md#is_qbnewb) |
| <a id="is_superuser-1"></a> `is_superuser` | `boolean` | - | [`BaseUser`](internal.md#baseuser).[`is_superuser`](internal.md#is_superuser) |
| <a id="last_login-1"></a> `last_login` | `string` | - | [`BaseUser`](internal.md#baseuser).[`last_login`](internal.md#last_login) |
| <a id="last_name-2"></a> `last_name` | `null` \| `string` | - | [`BaseUser`](internal.md#baseuser).[`last_name`](internal.md#last_name) |
| <a id="locale-4"></a> `locale` | `null` \| `string` | - | [`BaseUser`](internal.md#baseuser).[`locale`](internal.md#locale) |
| <a id="login_attributes"></a> `login_attributes` | `null` \| `Record`\<`string`, `string`\> | - | - |
| <a id="personal_collection_id"></a> `personal_collection_id` | [`CollectionId`](internal.md#collectionid) | - | - |
| <a id="sso_source"></a> `sso_source` | `null` \| `"saml"` | - | - |
| <a id="user_group_memberships"></a> `user_group_memberships?` | \{ `id`: `number`; `is_group_manager`: `boolean`; \}[] | - | - |

***

## UserInfo

### Properties

| Property | Type |
| ------ | ------ |
| <a id="email-3"></a> `email` | `string` |
| <a id="first_name-3"></a> `first_name` | `null` \| `string` |
| <a id="last_name-3"></a> `last_name` | `null` \| `string` |
| <a id="password"></a> `password` | `string` |
| <a id="password_confirm"></a> `password_confirm` | `string` |
| <a id="site_name"></a> `site_name` | `string` |

***

## ValuePopulatedParameter

### Extends

- [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget)

### Extended by

- [`FieldFilterUiParameter`](internal.md#fieldfilteruiparameter)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="default-6"></a> `default?` | `any` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`default`](internal.md#default-3) |
| <a id="display-name-5"></a> `display-name?` | `string` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`display-name`](internal.md#display-name-3) |
| <a id="filteringparameters-3"></a> `filteringParameters?` | `string`[] | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`filteringParameters`](internal.md#filteringparameters-2) |
| <a id="hasvariabletemplatetagtarget-2"></a> `hasVariableTemplateTagTarget?` | `boolean` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`hasVariableTemplateTagTarget`](internal.md#hasvariabletemplatetagtarget-1) |
| <a id="id-43"></a> `id` | `string` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`id`](internal.md#id-32) |
| <a id="ismultiselect-3"></a> `isMultiSelect?` | `boolean` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`isMultiSelect`](internal.md#ismultiselect-2) |
| <a id="name-43"></a> `name` | `string` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`name`](internal.md#name-38) |
| <a id="options-7"></a> `options?` | [`ParameterOptions`](internal.md#parameteroptions) | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`options`](internal.md#options-5) |
| <a id="required-6"></a> `required?` | `boolean` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`required`](internal.md#required-4) |
| <a id="sectionid-3"></a> `sectionId?` | `string` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`sectionId`](internal.md#sectionid-2) |
| <a id="slug-5"></a> `slug` | `string` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`slug`](internal.md#slug-4) |
| <a id="target-6"></a> `target?` | [`ParameterTarget`](internal.md#parametertarget) | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`target`](internal.md#target-5) |
| <a id="temporal_units-3"></a> `temporal_units?` | [`TemporalUnit`](internal.md#temporalunit)[] | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`temporal_units`](internal.md#temporal_units-2) |
| <a id="type-48"></a> `type` | `string` | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`type`](internal.md#type-33) |
| <a id="value-10"></a> `value?` | `any` | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`value`](internal.md#value-6) | - |
| <a id="values_query_type-4"></a> `values_query_type?` | [`ValuesQueryType`](internal.md#valuesquerytype) | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`values_query_type`](internal.md#values_query_type-3) |
| <a id="values_source_config-4"></a> `values_source_config?` | [`ValuesSourceConfig`](internal.md#valuessourceconfig) | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`values_source_config`](internal.md#values_source_config-3) |
| <a id="values_source_type-4"></a> `values_source_type?` | [`ValuesSourceType`](internal.md#valuessourcetype) | - | [`ParameterWithTemplateTagTarget`](internal.md#parameterwithtemplatetagtarget).[`values_source_type`](internal.md#values_source_type-3) |

***

## ValuesSourceConfig

### Properties

| Property | Type |
| ------ | ------ |
| <a id="card_id"></a> `card_id?` | `number` |
| <a id="value_field"></a> `value_field?` | `unknown`[] |
| <a id="values-5"></a> `values?` | `string`[] \| [`ParameterValue`](internal.md#parametervalue)[] |

***

## Version

### Properties

| Property | Type |
| ------ | ------ |
| <a id="tag"></a> `tag?` | `string` |

***

## VersionInfo

### Properties

| Property | Type |
| ------ | ------ |
| <a id="beta"></a> `beta?` | [`VersionInfoRecord`](internal.md#versioninforecord) |
| <a id="latest"></a> `latest?` | [`VersionInfoRecord`](internal.md#versioninforecord) |
| <a id="nightly"></a> `nightly?` | [`VersionInfoRecord`](internal.md#versioninforecord) |
| <a id="older"></a> `older?` | [`VersionInfoRecord`](internal.md#versioninforecord)[] |

***

## VersionInfoRecord

### Properties

| Property | Type |
| ------ | ------ |
| <a id="announcement_url"></a> `announcement_url?` | `string` |
| <a id="highlights"></a> `highlights?` | `string`[] |
| <a id="patch"></a> `patch?` | `boolean` |
| <a id="released"></a> `released?` | `string` |
| <a id="version-2"></a> `version` | `string` |

***

## WritebackActionBase

### Properties

| Property | Type |
| ------ | ------ |
| <a id="archived-9"></a> `archived` | `boolean` |
| <a id="created_at-10"></a> `created_at` | `string` |
| <a id="creator-2"></a> `creator` | [`UserInfo`](internal.md#userinfo-1) |
| <a id="creator_id-5"></a> `creator_id` | `number` |
| <a id="database_enabled_actions"></a> `database_enabled_actions?` | `boolean` |
| <a id="database_id-3"></a> `database_id?` | `number` |
| <a id="description-21"></a> `description` | `null` \| `string` |
| <a id="entity_id-5"></a> `entity_id` | [`NanoID`](internal.md#nanoid) |
| <a id="id-44"></a> `id` | `number` |
| <a id="model_id"></a> `model_id` | `number` |
| <a id="name-44"></a> `name` | `string` |
| <a id="parameters-8"></a> `parameters?` | [`WritebackParameter`](internal.md#writebackparameter)[] |
| <a id="public_uuid-2"></a> `public_uuid` | `null` \| `string` |
| <a id="updated_at-10"></a> `updated_at` | `string` |
| <a id="visualization_settings-2"></a> `visualization_settings?` | [`ActionFormSettings`](internal.md#actionformsettings) |

***

## WritebackParameter

### Extends

- [`Parameter`](internal.md#parameter)

### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="default-7"></a> `default?` | `any` | - | [`Parameter`](internal.md#parameter).[`default`](internal.md#default-2) |
| <a id="display-name-6"></a> `display-name?` | `string` | - | [`Parameter`](internal.md#parameter).[`display-name`](internal.md#display-name-2) |
| <a id="filteringparameters-4"></a> `filteringParameters?` | `string`[] | - | [`Parameter`](internal.md#parameter).[`filteringParameters`](internal.md#filteringparameters-1) |
| <a id="id-45"></a> `id` | `string` | - | [`Parameter`](internal.md#parameter).[`id`](internal.md#id-31) |
| <a id="ismultiselect-4"></a> `isMultiSelect?` | `boolean` | - | [`Parameter`](internal.md#parameter).[`isMultiSelect`](internal.md#ismultiselect-1) |
| <a id="name-45"></a> `name` | `string` | - | [`Parameter`](internal.md#parameter).[`name`](internal.md#name-37) |
| <a id="options-8"></a> `options?` | [`ParameterOptions`](internal.md#parameteroptions) | - | [`Parameter`](internal.md#parameter).[`options`](internal.md#options-4) |
| <a id="required-7"></a> `required?` | `boolean` | - | [`Parameter`](internal.md#parameter).[`required`](internal.md#required-3) |
| <a id="sectionid-4"></a> `sectionId?` | `string` | - | [`Parameter`](internal.md#parameter).[`sectionId`](internal.md#sectionid-1) |
| <a id="slug-6"></a> `slug` | `string` | - | [`Parameter`](internal.md#parameter).[`slug`](internal.md#slug-3) |
| <a id="target-7"></a> `target` | [`ParameterTarget`](internal.md#parametertarget) | [`Parameter`](internal.md#parameter).[`target`](internal.md#target-4) | - |
| <a id="temporal_units-4"></a> `temporal_units?` | [`TemporalUnit`](internal.md#temporalunit)[] | - | [`Parameter`](internal.md#parameter).[`temporal_units`](internal.md#temporal_units-1) |
| <a id="type-49"></a> `type` | `string` | - | [`Parameter`](internal.md#parameter).[`type`](internal.md#type-32) |
| <a id="value-11"></a> `value?` | `any` | - | [`Parameter`](internal.md#parameter).[`value`](internal.md#value-5) |
| <a id="values_query_type-5"></a> `values_query_type?` | [`ValuesQueryType`](internal.md#valuesquerytype) | - | [`Parameter`](internal.md#parameter).[`values_query_type`](internal.md#values_query_type-1) |
| <a id="values_source_config-5"></a> `values_source_config?` | [`ValuesSourceConfig`](internal.md#valuessourceconfig) | - | [`Parameter`](internal.md#parameter).[`values_source_config`](internal.md#values_source_config-1) |
| <a id="values_source_type-5"></a> `values_source_type?` | [`ValuesSourceType`](internal.md#valuessourcetype) | - | [`Parameter`](internal.md#parameter).[`values_source_type`](internal.md#values_source_type-1) |

***

## ActionClickBehavior

```ts
type ActionClickBehavior = 
  | ImplicitActionClickBehavior
  | HACK_ExplicitActionClickBehavior;
```

***

## ActionDashboardCard

```ts
type ActionDashboardCard = Omit<BaseDashboardCard, "parameter_mappings"> & {
  action: WritebackAction;
  action_id: WritebackActionId;
  card: Card;
  card_id: CardId | null;
  parameter_mappings:   | ActionParametersMapping[]
     | null;
  visualization_settings: DashCardVisualizationSettings & {
     actionDisplayType: ActionDisplayType;
     button.label: string;
     click_behavior: ClickBehavior;
     virtual_card: VirtualCard;
    };
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `action`? | [`WritebackAction`](internal.md#writebackaction) |
| `action_id` | [`WritebackActionId`](internal.md#writebackactionid) |
| `card` | [`Card`](internal.md#cardq) |
| `card_id` | [`CardId`](internal.md#cardid-1) \| `null` |
| `parameter_mappings`? | \| [`ActionParametersMapping`](internal.md#actionparametersmapping)[] \| `null` |
| `visualization_settings` | [`DashCardVisualizationSettings`](internal.md#dashcardvisualizationsettings) & \{ `actionDisplayType`: [`ActionDisplayType`](internal.md#actiondisplaytype); `button.label`: `string`; `click_behavior`: [`ClickBehavior`](internal.md#clickbehavior); `virtual_card`: [`VirtualCard`](internal.md#virtualcard); \} |

***

## ActionDisplayType

```ts
type ActionDisplayType = "form" | "button";
```

***

## ActionMenuClickBehavior

```ts
type ActionMenuClickBehavior = {
  type: "actionMenu";
};
```

Makes click handler use default drills.
This is virtual, i.e. if a card has no clickBehavior,
it'd behave as if it's an "actionMenu".

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="type-50"></a> `type` | `"actionMenu"` |

***

## ActionParametersMapping

```ts
type ActionParametersMapping = Pick<DashboardParameterMapping, "parameter_id" | "target">;
```

***

## AdminPath

```ts
type AdminPath = {
  key: AdminPathKey;
  name: string;
  path: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="key-2"></a> `key` | [`AdminPathKey`](internal.md#adminpathkey) |
| <a id="name-46"></a> `name` | `string` |
| <a id="path-2"></a> `path` | `string` |

***

## AdminPathKey

```ts
type AdminPathKey = 
  | "data-model"
  | "settings"
  | "people"
  | "databases"
  | "permissions"
  | "troubleshooting"
  | "audit"
  | "tools"
  | "performance"
  | "performance-models"
  | "performance-dashboards-and-questions"
  | "performance-databases";
```

***

## AggregateFieldReference

```ts
type AggregateFieldReference = 
  | ["aggregation", number, ReferenceOptions | null]
  | ["aggregation", number];
```

***

## Aggregation

```ts
type Aggregation = 
  | CommonAggregation
  | MetricAgg
  | InlineExpressionAgg;
```

An aggregation MBQL clause

***

## AggregationClause

```ts
type AggregationClause = Aggregation[];
```

***

## AggregationType

```ts
type AggregationType = 
  | "count"
  | "sum"
  | "cum-sum"
  | "cum-count"
  | "distinct"
  | "min"
  | "max"
  | "avg"
  | "median"
  | "stddev";
```

***

## AlwaysDefaultClickAction

```ts
type AlwaysDefaultClickAction = {
  defaultAlways: true;
  name: string;
 } & AlwaysDefaultClickActionSubAction;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `defaultAlways` | `true` |
| `name` | `string` |

***

## AlwaysDefaultClickActionSubAction

```ts
type AlwaysDefaultClickActionSubAction = 
  | QuestionChangeClickActionBase
  | ReduxClickActionBase
  | UrlClickActionBase;
```

***

## AndFilter

```ts
type AndFilter = ["and", ...Filter[]];
```

***

## AutocompleteMatchStyle

```ts
type AutocompleteMatchStyle = "off" | "prefix" | "substring";
```

***

## AvgAgg

```ts
type AvgAgg = ["avg", ConcreteFieldReference];
```

***

## BaseDashboardCard

```ts
type BaseDashboardCard = DashboardCardLayoutAttrs & {
  card: Card | VirtualCard;
  card_id: CardId | null;
  collection_authority_level: CollectionAuthorityLevel;
  created_at: string;
  dashboard_id: DashboardId;
  dashboard_tab_id: DashboardTabId | null;
  entity_id: BaseEntityId;
  id: DashCardId;
  justAdded: boolean;
  updated_at: string;
  visualization_settings: DashCardVisualizationSettings;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`Card`](internal.md#cardq) \| [`VirtualCard`](internal.md#virtualcard) |
| `card_id` | [`CardId`](internal.md#cardid-1) \| `null` |
| `collection_authority_level`? | [`CollectionAuthorityLevel`](internal.md#collectionauthoritylevel) |
| `created_at` | `string` |
| `dashboard_id` | [`DashboardId`](internal.md#dashboardid-4) |
| `dashboard_tab_id` | [`DashboardTabId`](internal.md#dashboardtabid) \| `null` |
| `entity_id` | [`BaseEntityId`](internal.md#baseentityid) |
| `id` | [`DashCardId`](internal.md#dashcardid-3) |
| `justAdded`? | `boolean` |
| `updated_at` | `string` |
| `visualization_settings`? | [`DashCardVisualizationSettings`](internal.md#dashcardvisualizationsettings) |

***

## BaseDrillThruInfo\<Type\>

```ts
type BaseDrillThruInfo<Type> = {
  type: Type;
};
```

### Type Parameters

| Type Parameter |
| ------ |
| `Type` *extends* [`DrillThruType`](internal.md#drillthrutype) |

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="type-51"></a> `type` | `Type` |

***

## BaseEntityId

```ts
type BaseEntityId = NanoID;
```

***

## BaseMetabaseAuthConfig

```ts
type BaseMetabaseAuthConfig = {
  fetchRequestToken: MetabaseFetchRequestTokenFn;
  metabaseInstanceUrl: string;
};
```

### Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="fetchrequesttoken"></a> `fetchRequestToken`? | [`MetabaseFetchRequestTokenFn`](internal.md#metabasefetchrequesttokenfn) | Specifies a function to fetch the refresh token. The refresh token should be in the format of { id: string, exp: number } |
| <a id="metabaseinstanceurl"></a> `metabaseInstanceUrl` | `string` | - |

***

## BetweenFilter

```ts
type BetweenFilter = ["between", ConcreteFieldReference, OrderableValue, OrderableValue];
```

***

## BinnedField

```ts
type BinnedField = ["field", FieldId | string, Omit<ReferenceOptions, "temporal-unit"> & {
  binning: BinningOptions;
 }];
```

***

## BinningMetadata

```ts
type BinningMetadata = {
  bin_width: number;
  binning_strategy: "default" | "bin-width" | "num-bins";
  num_bins: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="bin_width"></a> `bin_width`? | `number` |
| <a id="binning_strategy"></a> `binning_strategy`? | `"default"` \| `"bin-width"` \| `"num-bins"` |
| <a id="num_bins"></a> `num_bins`? | `number` |

***

## BinningOptions

```ts
type BinningOptions = 
  | DefaultBinningOptions
  | NumBinsBinningOptions
  | BinWidthBinningOptions;
```

***

## BlankQueryOptions

```ts
type BlankQueryOptions = {
  db: string;
  segment: string;
  table: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="db-2"></a> `db`? | `string` |
| <a id="segment-3"></a> `segment`? | `string` |
| <a id="table-9"></a> `table`? | `string` |

***

## BooleanLiteral

```ts
type BooleanLiteral = boolean;
```

***

## Brand\<T, B\>

```ts
type Brand<T, B> = T & {
  [___brand]: B;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `[___brand]` | `B` |

### Type Parameters

| Type Parameter |
| ------ |
| `T` |
| `B` |

***

## Breakout

```ts
type Breakout = ConcreteFieldReference;
```

***

## BreakoutClause

```ts
type BreakoutClause = Breakout[];
```

***

## BreakoutDropdownProps

```ts
type BreakoutDropdownProps = Omit<PopoverProps, "children" | "onClose" | "opened">;
```

***

## ButtonProps

```ts
type ButtonProps = MantineButtonProps & ExtraButtonProps & HTMLAttributes<HTMLButtonElement>;
```

***

## CacheStrategy

```ts
type CacheStrategy = 
  | DoNotCacheStrategy
  | AdaptiveStrategy
  | DurationStrategy
  | InheritStrategy
  | ScheduleStrategy;
```

Cache invalidation strategy

***

## CacheStrategyType

```ts
type CacheStrategyType = "nocache" | "ttl" | "duration" | "schedule" | "inherit";
```

***

## CallExpression

```ts
type CallExpression = 
  | [ExpressionOperator, ...ExpressionOperand[]]
  | [ExpressionOperator, ...ExpressionOperand[], CallOptions];
```

***

## CallOptions

```ts
type CallOptions = {};
```

### Index Signature

```ts
[key: string]: unknown
```

***

## CardDisplayType

```ts
type CardDisplayType = typeof cardDisplayTypes[number];
```

***

## CardId

```ts
type CardId = number;
```

***

## CardType

```ts
type CardType = "model" | "question" | "metric";
```

***

## CaseOperator

```ts
type CaseOperator = "case";
```

***

## CaseOptions

```ts
type CaseOptions = {
  default: Expression;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="default-8"></a> `default`? | [`Expression`](internal.md#expression) |

***

## CaseOrIfExpression

```ts
type CaseOrIfExpression = 
  | [CaseOrIfOperator, [Expression, Expression][]]
  | [CaseOrIfOperator, [Expression, Expression][], CaseOptions];
```

***

## CaseOrIfOperator

```ts
type CaseOrIfOperator = 
  | CaseOperator
  | IfOperator;
```

***

## ChartColor

```ts
type ChartColor = 
  | string
  | {
  base: string;
  shade: string;
  tint: string;
};
```

### Type declaration

`string`

\{
  `base`: `string`;
  `shade`: `string`;
  `tint`: `string`;
 \}

| Name | Type | Description |
| ------ | ------ | ------ |
| `base` | `string` | - |
| `shade`? | `string` | Darker variation of the base color |
| `tint`? | `string` | Lighter variation of the base color |

***

## ChecklistItemValue

```ts
type ChecklistItemValue = 
  | "database"
  | "invite"
  | "x-ray"
  | "notebook"
  | "sql"
  | "dashboard"
  | "subscription"
  | "alert";
```

***

## ClickAction

```ts
type ClickAction = 
  | RegularClickAction
  | DefaultClickAction
  | AlwaysDefaultClickAction
  | CustomClickAction
  | CustomClickActionWithCustomView;
```

***

## ClickActionBase

```ts
type ClickActionBase = {
  buttonType: ClickActionButtonType;
  extra: () => Record<string, unknown>;
  icon: IconName;
  iconText: string;
  name: string;
  section: ClickActionSection;
  sectionDirection: ClickActionSectionDirection;
  sectionTitle: string;
  subTitle: React.ReactNode;
  title: React.ReactNode;
  tooltip: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="buttontype"></a> `buttonType` | [`ClickActionButtonType`](internal.md#clickactionbuttontype) |
| <a id="extra"></a> `extra`? | () => `Record`\<`string`, `unknown`\> |
| <a id="icon-6"></a> `icon`? | [`IconName`](internal.md#iconname) |
| <a id="icontext"></a> `iconText`? | `string` |
| <a id="name-47"></a> `name` | `string` |
| <a id="section"></a> `section` | [`ClickActionSection`](internal.md#clickactionsection) |
| <a id="sectiondirection"></a> `sectionDirection`? | [`ClickActionSectionDirection`](internal.md#clickactionsectiondirection) |
| <a id="sectiontitle"></a> `sectionTitle`? | `string` |
| <a id="subtitle"></a> `subTitle`? | `React.ReactNode` |
| <a id="title-3"></a> `title`? | `React.ReactNode` |
| <a id="tooltip"></a> `tooltip`? | `string` |

***

## ClickActionButtonType

```ts
type ClickActionButtonType = "formatting" | "horizontal" | "info" | "sort" | "token" | "token-filter";
```

***

## ClickActionModeGetter()

```ts
type ClickActionModeGetter = (data: {
  question: Question;
 }) => QueryClickActionsMode | Mode;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | \{ `question`: [`Question`](internal.md#question-3); \} |
| `data.question` | [`Question`](internal.md#question-3) |

### Returns

[`QueryClickActionsMode`](internal.md#queryclickactionsmode) \| `Mode`

***

## ClickActionPopoverProps

```ts
type ClickActionPopoverProps = {
  onChangeCardAndRun: OnChangeCardAndRun;
  onClick: (action: RegularClickAction) => void;
  onClose: () => void;
  onResize: (...args: unknown[]) => void;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  series: Series | null;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="onchangecardandrun"></a> `onChangeCardAndRun` | [`OnChangeCardAndRun`](internal.md#onchangecardandrun-1) |
| <a id="onclick"></a> `onClick` | (`action`: [`RegularClickAction`](internal.md#regularclickaction)) => `void` |
| <a id="onclose"></a> `onClose` | () => `void` |
| <a id="onresize"></a> `onResize` | (...`args`: `unknown`[]) => `void` |
| <a id="onupdatevisualizationsettings"></a> `onUpdateVisualizationSettings` | (`settings`: [`VisualizationSettings`](internal.md#visualizationsettings)) => `void` |
| <a id="series"></a> `series` | [`Series`](internal.md#series-1) \| `null` |

***

## ClickActionProps

```ts
type ClickActionProps = {
  clicked: ClickObject;
  extraData: Record<string, any>;
  question: Question;
  settings: VisualizationSettings;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="clicked"></a> `clicked`? | [`ClickObject`](internal.md#clickobject) |
| <a id="extradata-1"></a> `extraData`? | `Record`\<`string`, `any`\> |
| <a id="question-5"></a> `question` | [`Question`](internal.md#question-3) |
| <a id="settings-14"></a> `settings`? | [`VisualizationSettings`](internal.md#visualizationsettings) |

***

## ClickActionSection

```ts
type ClickActionSection = 
  | "auto"
  | "auto-popover"
  | "breakout"
  | "breakout-popover"
  | "combine"
  | "combine-popover"
  | "details"
  | "extract"
  | "extract-popover"
  | "filter"
  | "info"
  | "records"
  | "new-column"
  | "sort"
  | "standalone_filter"
  | "sum"
  | "summarize"
  | "zoom"
  | "custom";
```

***

## ClickActionSectionDirection

```ts
type ClickActionSectionDirection = "row" | "column";
```

***

## ClickBehavior

```ts
type ClickBehavior = 
  | ActionMenuClickBehavior
  | CrossFilterClickBehavior
  | CustomDestinationClickBehavior
  | ActionClickBehavior;
```

***

## ClickBehaviorParameterMapping

```ts
type ClickBehaviorParameterMapping = Record<
  | ParameterId
  | StringifiedDimension, {
  id:   | ParameterId
     | StringifiedDimension;
  source: ClickBehaviorSource;
  target: ClickBehaviorTarget;
}>;
```

***

## ClickBehaviorSidebarProps

```ts
type ClickBehaviorSidebarProps = {
  dashcardId: DashCardId;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="dashcardid-2"></a> `dashcardId` | [`DashCardId`](internal.md#dashcardid-3) |

***

## ClickBehaviorTarget

```ts
type ClickBehaviorTarget = 
  | ClickBehaviorDimensionTarget
  | ClickBehaviorParameterTarget
  | ClickBehaviorVariableTarget;
```

***

## CollectionAuthorityLevel

```ts
type CollectionAuthorityLevel = "official" | null;
```

***

## CollectionBrowserListColumns

```ts
type CollectionBrowserListColumns = "type" | "name" | "lastEditedBy" | "lastEditedAt";
```

***

## CollectionContentModel

```ts
type CollectionContentModel = "card" | "dataset";
```

***

## CollectionEssentials

```ts
type CollectionEssentials = Pick<Collection, "id" | "name" | "authority_level" | "type"> & Partial<Pick<Collection, "effective_ancestors">>;
```

***

## CollectionId

```ts
type CollectionId = 
  | RegularCollectionId
  | "root"
  | "personal"
  | "users"
  | "trash";
```

***

## CollectionPermission

```ts
type CollectionPermission = "write" | "read" | "none";
```

***

## CollectionPermissions

```ts
type CollectionPermissions = {};
```

### Index Signature

```ts
[key: string | number]: Partial<Record<CollectionId, CollectionPermission>>
```

***

## CollectionType

```ts
type CollectionType = "instance-analytics" | "trash" | null;
```

***

## ColorCssVariableOrString

```ts
type ColorCssVariableOrString = `var(--mb-color-${ColorName})` | string;
```

***

## ColorName

```ts
type ColorName = keyof ColorPalette;
```

***

## ColorPalette

```ts
type ColorPalette = Partial<Record<keyof typeof colors, string>>;
```

***

## ColumnDisplayInfo

```ts
type ColumnDisplayInfo = {
  breakoutPositions: number[];
  description: string;
  displayName: string;
  effectiveType: string;
  filterPositions: number[];
  fingerprint: FingerprintDisplayInfo;
  isAggregation: boolean;
  isBreakout: boolean;
  isCalculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  longDisplayName: string;
  name: string;
  orderByPosition: number;
  selected: boolean;
  semanticType: string | null;
  table: TableInlineDisplayInfo;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="breakoutpositions"></a> `breakoutPositions`? | `number`[] |
| <a id="description-22"></a> `description`? | `string` |
| <a id="displayname-3"></a> `displayName` | `string` |
| <a id="effectivetype"></a> `effectiveType` | `string` |
| <a id="filterpositions"></a> `filterPositions`? | `number`[] |
| <a id="fingerprint-4"></a> `fingerprint`? | [`FingerprintDisplayInfo`](internal.md#fingerprintdisplayinfo) |
| <a id="isaggregation"></a> `isAggregation` | `boolean` |
| <a id="isbreakout"></a> `isBreakout` | `boolean` |
| <a id="iscalculated"></a> `isCalculated` | `boolean` |
| <a id="isfromjoin"></a> `isFromJoin` | `boolean` |
| <a id="isimplicitlyjoinable"></a> `isImplicitlyJoinable` | `boolean` |
| <a id="longdisplayname"></a> `longDisplayName` | `string` |
| <a id="name-48"></a> `name` | `string` |
| <a id="orderbyposition"></a> `orderByPosition`? | `number` |
| <a id="selected"></a> `selected`? | `boolean` |
| <a id="semantictype"></a> `semanticType` | `string` \| `null` |
| <a id="table-10"></a> `table`? | [`TableInlineDisplayInfo`](internal.md#tableinlinedisplayinfo) |

***

## ColumnExtractDrillThruInfo

```ts
type ColumnExtractDrillThruInfo = BaseDrillThruInfo<"drill-thru/column-extract"> & {
  displayName: string;
  extractions: ColumnExtractionInfo[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `displayName` | `string` |
| `extractions` | [`ColumnExtractionInfo`](internal.md#columnextractioninfo)[] |

***

## ColumnExtractionInfo

```ts
type ColumnExtractionInfo = {
  displayName: string;
  tag: ColumnExtractionTag;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="displayname-4"></a> `displayName` | `string` |
| <a id="tag-1"></a> `tag` | [`ColumnExtractionTag`](internal.md#columnextractiontag) |

***

## ColumnExtractionTag

```ts
type ColumnExtractionTag = 
  | "hour-of-day"
  | "day-of-month"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year"
  | "year"
  | "domain"
  | "host"
  | "subdomain";
```

***

## ColumnFilterDrillThruInfo

```ts
type ColumnFilterDrillThruInfo = BaseDrillThruInfo<"drill-thru/column-filter">;
```

***

## ColumnFormattingOperator

```ts
type ColumnFormattingOperator = 
  | ConditionalFormattingCommonOperator
  | ConditionalFormattingComparisonOperator
  | ConditionalFormattingStringOperator
  | ConditionalFormattingBooleanOperator;
```

***

## ColumnFormattingSetting

```ts
type ColumnFormattingSetting = 
  | ColumnSingleFormattingSetting
  | ColumnRangeFormattingSetting;
```

***

## ColumnListItem

```ts
type ColumnListItem = ColumnDisplayInfo & {
  column: ColumnMetadata;
  query: Query;
  stageIndex: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `column` | [`ColumnMetadata`](internal.md#columnmetadata) |
| `query` | [`Query`](internal.md#query-5) |
| `stageIndex` | `number` |

***

## ColumnMetadata

```ts
type ColumnMetadata = unknown & {
  _opaque: typeof ColumnMetadata;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `_opaque` | *typeof* `ColumnMetadata` |

***

## ColumnNameCollapsedRowsSetting

```ts
type ColumnNameCollapsedRowsSetting = {
  rows: string[];
  value: string[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="rows-1"></a> `rows` | `string`[] |
| <a id="value-12"></a> `value` | `string`[] |

***

## ColumnNameColumnSplitSetting

```ts
type ColumnNameColumnSplitSetting = {
  columns: string[];
  rows: string[];
  values: string[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="columns-1"></a> `columns` | `string`[] |
| <a id="rows-2"></a> `rows` | `string`[] |
| <a id="values-6"></a> `values` | `string`[] |

***

## ColumnRangeFormattingSetting

```ts
type ColumnRangeFormattingSetting = {
  colors: string[];
  columns: string[];
  max_type: "custom" | "all" | null;
  max_value: number;
  min_type: "custom" | "all" | null;
  min_value: number;
  type: "range";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="colors-1"></a> `colors` | `string`[] |
| <a id="columns-2"></a> `columns` | `string`[] |
| <a id="max_type"></a> `max_type` | `"custom"` \| `"all"` \| `null` |
| <a id="max_value-2"></a> `max_value`? | `number` |
| <a id="min_type"></a> `min_type` | `"custom"` \| `"all"` \| `null` |
| <a id="min_value-2"></a> `min_value`? | `number` |
| <a id="type-52"></a> `type` | `"range"` |

***

## ColumnSingleFormattingSetting

```ts
type ColumnSingleFormattingSetting = {
  color: string;
  columns: string[];
  highlight_row: boolean;
  operator: ColumnFormattingOperator;
  type: "single";
  value: string | number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="color-1"></a> `color` | `string` |
| <a id="columns-3"></a> `columns` | `string`[] |
| <a id="highlight_row"></a> `highlight_row` | `boolean` |
| <a id="operator"></a> `operator` | [`ColumnFormattingOperator`](internal.md#columnformattingoperator) |
| <a id="type-53"></a> `type` | `"single"` |
| <a id="value-13"></a> `value` | `string` \| `number` |

***

## CombineColumnsDrillThruInfo

```ts
type CombineColumnsDrillThruInfo = BaseDrillThruInfo<"drill-thru/combine-columns">;
```

***

## CommonAggregation

```ts
type CommonAggregation = 
  | CountAgg
  | CountFieldAgg
  | AvgAgg
  | MedianAgg
  | CumSumAgg
  | DistinctAgg
  | StdDevAgg
  | SumAgg
  | MinAgg
  | MaxAgg
  | OffsetAgg;
```

***

## ComparisonFilter

```ts
type ComparisonFilter = ["<" | "<=" | ">=" | ">", ConcreteFieldReference, OrderableValue];
```

***

## CompoundFilter

```ts
type CompoundFilter = AndFilter | OrFilter;
```

***

## ConcreteFieldReference

```ts
type ConcreteFieldReference = 
  | LocalFieldReference
  | FieldLiteral
  | ForeignFieldReference
  | JoinedFieldReference
  | ExpressionReference
  | DatetimeField
  | BinnedField;
```

***

## ConcreteTableId

```ts
type ConcreteTableId = number;
```

***

## ConditionalFormattingBooleanOperator

```ts
type ConditionalFormattingBooleanOperator = "is-true" | "is-false";
```

***

## ConditionalFormattingCommonOperator

```ts
type ConditionalFormattingCommonOperator = "is-null" | "not-null";
```

***

## ConditionalFormattingComparisonOperator

```ts
type ConditionalFormattingComparisonOperator = "=" | "!=" | "<" | ">" | "<=" | ">=";
```

***

## ConditionalFormattingStringOperator

```ts
type ConditionalFormattingStringOperator = 
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with";
```

***

## ConnectedDashboardProps

```ts
type ConnectedDashboardProps = {
  className: string;
  dashboardId: DashboardId;
  downloadsEnabled: boolean;
  isLoading: boolean;
  onNavigateToNewCardFromDashboard: (opts: NavigateToNewCardFromDashboardOpts) => void;
  parameterQueryParams: Query;
  plugins: MetabasePluginsConfig;
 } & DashboardFullscreenControls & DashboardRefreshPeriodControls & DashboardLoaderWrapperProps & PublicOrEmbeddedDashboardEventHandlersProps;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `className`? | `string` |
| `dashboardId` | [`DashboardId`](internal.md#dashboardid-4) |
| `downloadsEnabled`? | `boolean` |
| `isLoading` | `boolean` |
| `onNavigateToNewCardFromDashboard` | (`opts`: [`NavigateToNewCardFromDashboardOpts`](internal.md#navigatetonewcardfromdashboardopts)) => `void` |
| `parameterQueryParams` | `Query` |
| `plugins`? | [`MetabasePluginsConfig`](internal.md#metabasepluginsconfig) |

***

## CountAgg

```ts
type CountAgg = ["count"];
```

***

## CountFieldAgg

```ts
type CountFieldAgg = ["count", ConcreteFieldReference];
```

***

## CreatorInfo

```ts
type CreatorInfo = Pick<UserInfo, "first_name" | "last_name" | "email" | "id" | "common_name">;
```

***

## CumSumAgg

```ts
type CumSumAgg = ["cum-sum", ConcreteFieldReference];
```

***

## CustomClickAction

```ts
type CustomClickAction = ClickActionBase & CustomClickActionBase & {
  onClick: (parameters: CustomClickActionContext) => void;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `onClick`? | (`parameters`: [`CustomClickActionContext`](internal.md#customclickactioncontext)) => `void` |

***

## CustomClickActionBase

```ts
type CustomClickActionBase = {
  name: ClickActionBase["name"];
  section: ClickActionBase["section"];
  type: "custom";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="name-49"></a> `name` | [`ClickActionBase`](internal.md#clickactionbase)\[`"name"`\] |
| <a id="section-1"></a> `section` | [`ClickActionBase`](internal.md#clickactionbase)\[`"section"`\] |
| <a id="type-54"></a> `type` | `"custom"` |

***

## CustomClickActionContext

```ts
type CustomClickActionContext = {
  closePopover: () => void;
  dispatch: Dispatch;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="closepopover"></a> `closePopover` | () => `void` |
| <a id="dispatch"></a> `dispatch` | [`Dispatch`](internal.md#dispatcht) |

***

## CustomClickActionWithCustomView

```ts
type CustomClickActionWithCustomView = CustomClickActionBase & {
  view: (parameters: CustomClickActionContext) => React.JSX.Element;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `view` | (`parameters`: [`CustomClickActionContext`](internal.md#customclickactioncontext)) => `React.JSX.Element` |

***

## CustomDashboardCardMenuItem()

```ts
type CustomDashboardCardMenuItem = ({
  question,
}: {
  question: MetabaseQuestion;
 }) => DashCardMenuItem;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `{ question, }` | \{ `question`: [`MetabaseQuestion`](internal.md#metabasequestion); \} |
| `{ question, }.question`? | [`MetabaseQuestion`](internal.md#metabasequestion) |

### Returns

[`DashCardMenuItem`](internal.md#dashcardmenuitem)

***

## CustomDestinationClickBehavior

```ts
type CustomDestinationClickBehavior = 
  | EntityCustomDestinationClickBehavior
  | ArbitraryCustomDestinationClickBehavior;
```

***

## DashboardBackButtonProps

```ts
type DashboardBackButtonProps = {
  noLink: boolean;
  onClick: () => void;
} & ActionIconProps & HTMLAttributes<HTMLButtonElement>;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `noLink`? | `boolean` |
| `onClick`? | () => `void` |

***

## DashboardCard

```ts
type DashboardCard = 
  | ActionDashboardCard
  | QuestionDashboardCard
  | VirtualDashboardCard;
```

***

## DashboardCardCustomMenuItem

```ts
type DashboardCardCustomMenuItem = {
  customItems: (
     | DashCardMenuItem
     | CustomDashboardCardMenuItem)[];
  withDownloads: boolean;
  withEditLink: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="customitems"></a> `customItems`? | ( \| [`DashCardMenuItem`](internal.md#dashcardmenuitem) \| [`CustomDashboardCardMenuItem`](internal.md#customdashboardcardmenuitem))[] |
| <a id="withdownloads"></a> `withDownloads`? | `boolean` |
| <a id="witheditlink"></a> `withEditLink`? | `boolean` |

***

## DashboardCardLayoutAttrs

```ts
type DashboardCardLayoutAttrs = {
  col: number;
  row: number;
  size_x: number;
  size_y: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="col-2"></a> `col` | `number` |
| <a id="row"></a> `row` | `number` |
| <a id="size_x"></a> `size_x` | `number` |
| <a id="size_y"></a> `size_y` | `number` |

***

## DashboardCardMenuCustomElement()

```ts
type DashboardCardMenuCustomElement = ({
  question,
}: {
  question: MetabaseQuestion;
 }) => ReactNode;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `{ question, }` | \{ `question`: [`MetabaseQuestion`](internal.md#metabasequestion); \} |
| `{ question, }.question` | [`MetabaseQuestion`](internal.md#metabasequestion) |

### Returns

`ReactNode`

***

## DashboardCardsLoadingState

```ts
type DashboardCardsLoadingState = {
  endTime: number | null;
  loadingIds: DashCardId[];
  loadingStatus: DashboardLoadingStatus;
  startTime: number | null;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="endtime"></a> `endTime` | `number` \| `null` |
| <a id="loadingids"></a> `loadingIds` | [`DashCardId`](internal.md#dashcardid-3)[] |
| <a id="loadingstatus"></a> `loadingStatus` | [`DashboardLoadingStatus`](internal.md#dashboardloadingstatus) |
| <a id="starttime"></a> `startTime` | `number` \| `null` |

***

## DashboardFullscreenControls

```ts
type DashboardFullscreenControls = {
  isFullscreen: boolean;
  onFullscreenChange: (newIsFullscreen: boolean, browserFullscreen?: boolean) => void;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="isfullscreen"></a> `isFullscreen` | `boolean` |
| <a id="onfullscreenchange"></a> `onFullscreenChange` | (`newIsFullscreen`: `boolean`, `browserFullscreen`?: `boolean`) => `void` |

***

## DashboardId

```ts
type DashboardId = number | string;
```

***

## DashboardLoaderWrapperProps

```ts
type DashboardLoaderWrapperProps = {
  noLoaderWrapper: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="noloaderwrapper"></a> `noLoaderWrapper`? | `boolean` |

***

## DashboardLoadingControls

```ts
type DashboardLoadingControls = {
  documentTitle: string;
  isLoading: boolean;
  showLoadCompleteFavicon: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="documenttitle-1"></a> `documentTitle`? | `string` |
| <a id="isloading"></a> `isLoading` | `boolean` |
| <a id="showloadcompletefavicon-1"></a> `showLoadCompleteFavicon`? | `boolean` |

***

## DashboardLoadingStatus

```ts
type DashboardLoadingStatus = "idle" | "running" | "complete";
```

***

## DashboardParameterMapping

```ts
type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="card_id-1"></a> `card_id` | [`CardId`](internal.md#cardid-1) |
| <a id="parameter_id"></a> `parameter_id` | [`ParameterId`](internal.md#parameterid-1) |
| <a id="target-8"></a> `target` | [`ParameterTarget`](internal.md#parametertarget) |

***

## DashboardRefreshPeriodControls

```ts
type DashboardRefreshPeriodControls = {
  onRefreshPeriodChange: (newPeriod: RefreshPeriod) => void;
  refreshPeriod: RefreshPeriod;
  setRefreshElapsedHook: (hook: DashboardRefreshPeriodControls["onRefreshPeriodChange"]) => void;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="onrefreshperiodchange"></a> `onRefreshPeriodChange` | (`newPeriod`: [`RefreshPeriod`](internal.md#refreshperiod-1)) => `void` |
| <a id="refreshperiod"></a> `refreshPeriod` | [`RefreshPeriod`](internal.md#refreshperiod-1) |
| <a id="setrefreshelapsedhook"></a> `setRefreshElapsedHook` | (`hook`: [`DashboardRefreshPeriodControls`](internal.md#dashboardrefreshperiodcontrols)\[`"onRefreshPeriodChange"`\]) => `void` |

***

## DashboardSidebarName

```ts
type DashboardSidebarName = 
  | "addQuestion"
  | "action"
  | "clickBehavior"
  | "editParameter"
  | "settings"
  | "sharing"
  | "info";
```

***

## DashboardSidebarState

```ts
type DashboardSidebarState = 
  | BaseSidebarState
  | ClickBehaviorSidebarState
  | EditParameterSidebarState;
```

***

## DashboardTab

```ts
type DashboardTab = {
  created_at: string;
  dashboard_id: DashboardId;
  entity_id: BaseEntityId;
  id: DashboardTabId;
  name: string;
  position: number;
  updated_at: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="created_at-11"></a> `created_at`? | `string` |
| <a id="dashboard_id-1"></a> `dashboard_id` | [`DashboardId`](internal.md#dashboardid-4) |
| <a id="entity_id-6"></a> `entity_id`? | [`BaseEntityId`](internal.md#baseentityid) |
| <a id="id-46"></a> `id` | [`DashboardTabId`](internal.md#dashboardtabid) |
| <a id="name-50"></a> `name` | `string` |
| <a id="position-3"></a> `position`? | `number` |
| <a id="updated_at-11"></a> `updated_at`? | `string` |

***

## DashboardTabId

```ts
type DashboardTabId = number;
```

***

## DashboardWidth

```ts
type DashboardWidth = "full" | "fixed";
```

***

## DashCardDataMap

```ts
type DashCardDataMap = Record<DashCardId, Record<CardId, Dataset | null | undefined>>;
```

***

## DashCardId

```ts
type DashCardId = number;
```

***

## DashCardMenuItem

```ts
type DashCardMenuItem = {
  disabled: boolean;
  iconName: IconName;
  label: string;
  onClick: () => void;
 } & MenuItemProps;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `disabled`? | `boolean` |
| `iconName` | [`IconName`](internal.md#iconname) |
| `label` | `string` |
| `onClick` | () => `void` |

***

## DashCardVisualizationSettings

```ts
type DashCardVisualizationSettings = {
[key: string]: unknown;   iframe: string;
  virtual_card: VirtualCard;
};
```

### Type declaration

### Index Signature

```ts
[key: string]: unknown
```

| Name | Type |
| ------ | ------ |
| <a id="iframe"></a> `iframe`? | `string` |
| <a id="virtual_card"></a> `virtual_card`? | [`VirtualCard`](internal.md#virtualcard) |

***

## DatabaseFeature

```ts
type DatabaseFeature = 
  | "actions"
  | "basic-aggregations"
  | "binning"
  | "case-sensitivity-string-filter-options"
  | "convert-timezone"
  | "datetime-diff"
  | "dynamic-schema"
  | "expression-aggregations"
  | "expressions"
  | "native-parameters"
  | "nested-queries"
  | "standard-deviation-aggregations"
  | "percentile-aggregations"
  | "persist-models"
  | "persist-models-enabled"
  | "regex"
  | "schemas"
  | "set-timezone"
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join"
  | "nested-field-columns"
  | "advanced-math-expressions"
  | "connection-impersonation"
  | "connection-impersonation-requires-role"
  | "native-requires-specified-collection"
  | "window-functions/offset";
```

***

## DatabaseId

```ts
type DatabaseId = number;
```

***

## DatabasePermissions

```ts
type DatabasePermissions = {
  create-queries: NativePermissions;
  data-model: DataModelPermissions;
  details: DetailsPermissions;
  download: DownloadAccessPermission;
  view-data: SchemasPermissions;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="create-queries"></a> `create-queries`? | [`NativePermissions`](internal.md#nativepermissions) |
| <a id="data-model"></a> `data-model`? | [`DataModelPermissions`](internal.md#datamodelpermissions) |
| <a id="details-4"></a> `details`? | [`DetailsPermissions`](internal.md#detailspermissions) |
| <a id="download-1"></a> `download`? | [`DownloadAccessPermission`](internal.md#downloadaccesspermission) |
| <a id="view-data"></a> `view-data` | [`SchemasPermissions`](internal.md#schemaspermissions) |

***

## DatabaseSettings

```ts
type DatabaseSettings = {
[key: string]: any;   database-enable-actions: boolean;
};
```

### Type declaration

### Index Signature

```ts
[key: string]: any
```

| Name | Type |
| ------ | ------ |
| <a id="database-enable-actions"></a> `database-enable-actions`? | `boolean` |

***

## DataModelPermissions

```ts
type DataModelPermissions = {
  schemas: SchemasPermissions;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="schemas-5"></a> `schemas` | [`SchemasPermissions`](internal.md#schemaspermissions) |

***

## DatasetEditorTab

```ts
type DatasetEditorTab = "query" | "metadata";
```

***

## DatasetQuery

```ts
type DatasetQuery = 
  | StructuredDatasetQuery
  | NativeDatasetQuery;
```

***

## DateInputType

```ts
type DateInputType = "date" | "time" | "datetime";
```

***

## DateRange

```ts
type DateRange = [string, string];
```

***

## DateTimeAbsoluteUnit

```ts
type DateTimeAbsoluteUnit = typeof dateTimeAbsoluteUnits[number];
```

***

## DatetimeField

```ts
type DatetimeField = ["field", FieldId | string, Omit<ReferenceOptions, "binning"> & {
  temporal-unit: DatetimeUnit;
 }];
```

***

## DateTimeFieldFingerprint

```ts
type DateTimeFieldFingerprint = {
  earliest: string;
  latest: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="earliest"></a> `earliest` | `string` |
| <a id="latest-1"></a> `latest` | `string` |

***

## DateTimeFingerprintDisplayInfo

```ts
type DateTimeFingerprintDisplayInfo = {
  earliest: string;
  latest: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="earliest-1"></a> `earliest` | `string` |
| <a id="latest-2"></a> `latest` | `string` |

***

## DatetimeLiteral

```ts
type DatetimeLiteral = string;
```

***

## DateTimeRelativeUnit

```ts
type DateTimeRelativeUnit = typeof dateTimeRelativeUnits[number];
```

***

## DatetimeUnit

```ts
type DatetimeUnit = 
  | "default"
  | DateTimeAbsoluteUnit
  | DateTimeRelativeUnit;
```

***

## DayOfWeekId

```ts
type DayOfWeekId = 
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";
```

***

## DeepPartial\<T\>

```ts
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
```

Makes every property in the object optional.

### Type Parameters

| Type Parameter |
| ------ |
| `T` |

***

## DefaultClickAction

```ts
type DefaultClickAction = ClickActionBase & {
  default: true;
 } & AlwaysDefaultClickActionSubAction;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `default` | `true` |

***

## DetailsPermission

```ts
type DetailsPermission = NO | YES;
```

***

## DetailsPermissions

```ts
type DetailsPermissions = {};
```

### Index Signature

```ts
[key: number]: DetailsPermission
```

***

## DimensionFilter()

```ts
type DimensionFilter = (dimension: Dimension) => boolean;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `dimension` | [`Dimension`](internal.md#dimension) |

### Returns

`boolean`

***

## DimensionOption

```ts
type DimensionOption = {
  mbql: any;
  name: string;
};
```

A dimension option returned by the query_metadata API

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="mbql"></a> `mbql` | `any` |
| <a id="name-51"></a> `name`? | `string` |

***

## DimensionReference

```ts
type DimensionReference = 
  | DimensionReferenceWithOptions
  | TemplateTagReference;
```

***

## DimensionReferenceWithOptions

```ts
type DimensionReferenceWithOptions = 
  | FieldReference
  | ExpressionReference
  | AggregateFieldReference;
```

***

## DimensionTargetOptions

```ts
type DimensionTargetOptions = {
  stage-number: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="stage-number"></a> `stage-number`? | `number` |

***

## Dispatch()\<T\>

```ts
type Dispatch<T> = (action: T) => unknown | Promise<unknown>;
```

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `any` |

### Parameters

| Parameter | Type |
| ------ | ------ |
| `action` | `T` |

### Returns

`unknown` \| `Promise`\<`unknown`\>

***

## Dispatcher()

```ts
type Dispatcher = (dispatch: Dispatch, getState: GetState) => void;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `dispatch` | [`Dispatch`](internal.md#dispatcht) |
| `getState` | [`GetState`](internal.md#getstate) |

### Returns

`void`

***

## DisplayTheme

```ts
type DisplayTheme = "light" | "night" | "transparent";
```

***

## DistinctAgg

```ts
type DistinctAgg = ["distinct", ConcreteFieldReference];
```

***

## DistributionDrillThruInfo

```ts
type DistributionDrillThruInfo = BaseDrillThruInfo<"drill-thru/distribution">;
```

***

## DownloadAccessPermission

```ts
type DownloadAccessPermission = {
  native: DownloadSchemasPermission;
  schemas: DownloadSchemasPermission;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="native-1"></a> `native`? | [`DownloadSchemasPermission`](internal.md#downloadschemaspermission) |
| <a id="schemas-6"></a> `schemas` | [`DownloadSchemasPermission`](internal.md#downloadschemaspermission) |

***

## DownloadPermission

```ts
type DownloadPermission = 
  | FULL
  | LIMITED
  | NONE;
```

***

## DownloadSchemasPermission

```ts
type DownloadSchemasPermission = DownloadPermission | {};
```

***

## DownloadsState

```ts
type DownloadsState = Download[];
```

***

## DownloadTablePermission

```ts
type DownloadTablePermission = DownloadPermission | {};
```

***

## DrillThruDisplayInfo

```ts
type DrillThruDisplayInfo = 
  | ColumnExtractDrillThruInfo
  | CombineColumnsDrillThruInfo
  | QuickFilterDrillThruInfo
  | PKDrillThruInfo
  | ZoomDrillThruInfo
  | FKDetailsDrillThruInfo
  | PivotDrillThruInfo
  | FKFilterDrillThruInfo
  | DistributionDrillThruInfo
  | SortDrillThruInfo
  | SummarizeColumnDrillThruInfo
  | SummarizeColumnByTimeDrillThruInfo
  | ColumnFilterDrillThruInfo
  | UnderlyingRecordsDrillThruInfo
  | ZoomTimeseriesDrillThruInfo;
```

***

## DrillThruType

```ts
type DrillThruType = 
  | "drill-thru/automatic-insights"
  | "drill-thru/column-extract"
  | "drill-thru/column-filter"
  | "drill-thru/combine-columns"
  | "drill-thru/distribution"
  | "drill-thru/fk-details"
  | "drill-thru/fk-filter"
  | "drill-thru/pivot"
  | "drill-thru/pk"
  | "drill-thru/quick-filter"
  | "drill-thru/sort"
  | "drill-thru/summarize-column-by-time"
  | "drill-thru/summarize-column"
  | "drill-thru/underlying-records"
  | "drill-thru/zoom"
  | "drill-thru/zoom-in.binning"
  | "drill-thru/zoom-in.geographic"
  | "drill-thru/zoom-in.timeseries";
```

***

## EditorButtonProps

```ts
type EditorButtonProps = {
  isOpen: boolean;
} & ActionIconProps & HTMLAttributes<HTMLButtonElement>;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `isOpen`? | `boolean` |

***

## EditorProps

```ts
type EditorProps = {
  onApply: () => void;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="onapply"></a> `onApply`? | () => `void` |

***

## EditParameterSidebarProps

```ts
type EditParameterSidebarProps = {
  dashcardId: DashCardId;
  parameterId: ParameterId;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="dashcardid-4"></a> `dashcardId`? | [`DashCardId`](internal.md#dashcardid-3) |
| <a id="parameterid"></a> `parameterId` | [`ParameterId`](internal.md#parameterid-1) |

***

## EmbedBackground

```ts
type EmbedBackground = boolean;
```

***

## EmbeddingHomepageDismissReason

```ts
type EmbeddingHomepageDismissReason = 
  | "dismissed-done"
  | "dismissed-run-into-issues"
  | "dismissed-not-interested-now";
```

***

## EmbeddingHomepageStatus

```ts
type EmbeddingHomepageStatus = 
  | EmbeddingHomepageDismissReason
  | "visible"
  | "hidden";
```

***

## EmbeddingParameters

```ts
type EmbeddingParameters = Record<string, EmbeddingParameterVisibility>;
```

***

## EmbeddingParameterVisibility

```ts
type EmbeddingParameterVisibility = "disabled" | "enabled" | "locked";
```

***

## EmbeddingSessionTokenState

```ts
type EmbeddingSessionTokenState = {
  error: SerializedError | null;
  loading: boolean;
  token:   | MetabaseEmbeddingSessionToken
     | null;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="error-3"></a> `error` | `SerializedError` \| `null` |
| <a id="loading-2"></a> `loading` | `boolean` |
| <a id="token"></a> `token` | \| [`MetabaseEmbeddingSessionToken`](internal.md#metabaseembeddingsessiontoken) \| `null` |

***

## EmbedFont

```ts
type EmbedFont = string | null;
```

***

## EmbedHideParameters

```ts
type EmbedHideParameters = string | null;
```

***

## EmbedTitle

```ts
type EmbedTitle = boolean;
```

***

## EmbedVisualizationSettings

```ts
type EmbedVisualizationSettings = {
  iframe: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="iframe-1"></a> `iframe`? | `string` |

***

## EmptyFilter

```ts
type EmptyFilter = ["is-empty", ConcreteFieldReference];
```

***

## EngineFieldType

```ts
type EngineFieldType = 
  | "string"
  | "password"
  | "text"
  | "integer"
  | "boolean"
  | "select"
  | "textFile"
  | "info"
  | "section";
```

***

## EntityCustomDestinationClickBehavior

```ts
type EntityCustomDestinationClickBehavior = 
  | DashboardCustomDestinationClickBehavior
  | QuestionCustomDestinationClickBehavior;
```

***

## EntityKey

```ts
type EntityKey = string;
```

***

## EntityTypeFilterKeys

```ts
type EntityTypeFilterKeys = "table" | "question" | "model" | "metric";
```

***

## EqualityFilter

```ts
type EqualityFilter = ["=" | "!=", ConcreteFieldReference, Value];
```

***

## Expression

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

***

## ExpressionClause

```ts
type ExpressionClause = {};
```

### Index Signature

```ts
[key: string]: Expression
```

***

## ExpressionName

```ts
type ExpressionName = string;
```

***

## ExpressionOperand

```ts
type ExpressionOperand = 
  | Expression
  | CallOptions;
```

***

## ExpressionOperator

```ts
type ExpressionOperator = string;
```

***

## ExpressionReference

```ts
type ExpressionReference = ["expression", ExpressionName, (ReferenceOptions | null)?];
```

***

## ExtraButtonProps

```ts
type ExtraButtonProps = {
  animate: boolean;
  highlightOnHover: boolean;
  type: "button" | "submit";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="animate"></a> `animate`? | `boolean` |
| <a id="highlightonhover"></a> `highlightOnHover`? | `boolean` |
| <a id="type-55"></a> `type`? | `"button"` \| `"submit"` |

***

## FieldDimension

```ts
type FieldDimension = {
  human_readable_field: Field;
  human_readable_field_id: FieldId;
  name: string;
  type: FieldDimensionType;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="human_readable_field-1"></a> `human_readable_field`? | [`Field`](internal.md#field-5) |
| <a id="human_readable_field_id-1"></a> `human_readable_field_id`? | [`FieldId`](internal.md#fieldid) |
| <a id="name-52"></a> `name` | `string` |
| <a id="type-56"></a> `type` | [`FieldDimensionType`](internal.md#fielddimensiontype) |

***

## FieldDimensionOption

```ts
type FieldDimensionOption = {
  mbql: unknown[] | null;
  name: string;
  type: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="mbql-1"></a> `mbql` | `unknown`[] \| `null` |
| <a id="name-53"></a> `name` | `string` |
| <a id="type-57"></a> `type` | `string` |

***

## FieldDimensionType

```ts
type FieldDimensionType = "internal" | "external";
```

***

## FieldFilter

```ts
type FieldFilter = 
  | EqualityFilter
  | ComparisonFilter
  | BetweenFilter
  | StringFilter
  | NullFilter
  | NotNullFilter
  | EmptyFilter
  | NotEmptyFilter
  | InsideFilter
  | TimeIntervalFilter;
```

***

## FieldId

```ts
type FieldId = number;
```

***

## FieldLiteral

```ts
type FieldLiteral = ["field", string, ReferenceOptions & {
  base-type: string;
 }];
```

***

## FieldRefCollapsedRowsSetting

```ts
type FieldRefCollapsedRowsSetting = {
  rows: (FieldReference | null)[];
  value: string[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="rows-3"></a> `rows` | ([`FieldReference`](internal.md#fieldreference) \| `null`)[] |
| <a id="value-14"></a> `value` | `string`[] |

***

## FieldRefColumnSplitSetting

```ts
type FieldRefColumnSplitSetting = {
  columns: (FieldReference | null)[];
  rows: (FieldReference | null)[];
  values: (FieldReference | null)[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="columns-4"></a> `columns` | ([`FieldReference`](internal.md#fieldreference) \| `null`)[] |
| <a id="rows-4"></a> `rows` | ([`FieldReference`](internal.md#fieldreference) \| `null`)[] |
| <a id="values-7"></a> `values` | ([`FieldReference`](internal.md#fieldreference) \| `null`)[] |

***

## FieldReference

```ts
type FieldReference = 
  | ConcreteFieldReference
  | AggregateFieldReference;
```

***

## FieldsClause

```ts
type FieldsClause = ConcreteFieldReference[];
```

***

## FieldSettingsMap

```ts
type FieldSettingsMap = Record<ParameterId, FieldSettings>;
```

***

## FieldsPermissions

```ts
type FieldsPermissions = 
  | UNRESTRICTED
  | LEGACY_NO_SELF_SERVICE
  | SANDBOXED
  | BLOCKED;
```

***

## FieldType

```ts
type FieldType = "string" | "number" | "date";
```

***

## FieldValue

```ts
type FieldValue = 
  | NotRemappedFieldValue
  | RemappedFieldValue;
```

***

## FieldValueOptions

```ts
type FieldValueOptions = (string | number)[];
```

***

## FieldValuesType

```ts
type FieldValuesType = "list" | "search" | "none";
```

***

## FieldVisibilityType

```ts
type FieldVisibilityType = "details-only" | "hidden" | "normal" | "retired" | "sensitive";
```

***

## FileUpload

```ts
type FileUpload = {
  collectionId: CollectionId;
  error: string;
  id: number;
  message: string;
  modelId: string;
  name: string;
  status: "complete" | "in-progress" | "error";
  tableId: TableId;
  uploadMode: UploadMode;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="collectionid-1"></a> `collectionId`? | [`CollectionId`](internal.md#collectionid) |
| <a id="error-4"></a> `error`? | `string` |
| <a id="id-47"></a> `id` | `number` |
| <a id="message-2"></a> `message`? | `string` |
| <a id="modelid"></a> `modelId`? | `string` |
| <a id="name-54"></a> `name` | `string` |
| <a id="status-4"></a> `status` | `"complete"` \| `"in-progress"` \| `"error"` |
| <a id="tableid-1"></a> `tableId`? | [`TableId`](internal.md#tableid-3) |
| <a id="uploadmode"></a> `uploadMode`? | `UploadMode` |

***

## FileUploadState

```ts
type FileUploadState = Record<string, FileUpload>;
```

***

## Filter

```ts
type Filter = 
  | FieldFilter
  | CompoundFilter
  | NotFilter
  | SegmentFilter;
```

***

## FilterClause

```ts
type FilterClause = Filter;
```

***

## FilterProps

```ts
type FilterProps = Pick<FilterColumnPickerProps, "withColumnItemIcon">;
```

***

## FilterProps

```ts
type FilterProps = Pick<FilterColumnPickerProps, "withColumnItemIcon">;
```

***

## FingerprintDisplayInfo

```ts
type FingerprintDisplayInfo = {
  global: FingerprintGlobalDisplayInfo;
  type: FingerprintTypeDisplayInfo;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="global-1"></a> `global`? | [`FingerprintGlobalDisplayInfo`](internal.md#fingerprintglobaldisplayinfo) |
| <a id="type-58"></a> `type`? | [`FingerprintTypeDisplayInfo`](internal.md#fingerprinttypedisplayinfo) |

***

## FingerprintGlobalDisplayInfo

```ts
type FingerprintGlobalDisplayInfo = {
  distinctCount: number;
  nil%: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="distinctcount"></a> `distinctCount`? | `number` |
| <a id="nil%-1"></a> `nil%`? | `number` |

***

## FingerprintTypeDisplayInfo

```ts
type FingerprintTypeDisplayInfo = {
  type/DateTime: DateTimeFingerprintDisplayInfo;
  type/Number: NumberFingerprintDisplayInfo;
  type/Text: TextFingerprintDisplayInfo;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="type/datetime-1"></a> `type/DateTime`? | [`DateTimeFingerprintDisplayInfo`](internal.md#datetimefingerprintdisplayinfo) |
| <a id="type/number-2"></a> `type/Number`? | [`NumberFingerprintDisplayInfo`](internal.md#numberfingerprintdisplayinfo) |
| <a id="type/text-1"></a> `type/Text`? | [`TextFingerprintDisplayInfo`](internal.md#textfingerprintdisplayinfo) |

***

## FKDetailsDrillThruInfo

```ts
type FKDetailsDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/fk-details">;
```

***

## FKFilterDrillThruInfo

```ts
type FKFilterDrillThruInfo = BaseDrillThruInfo<"drill-thru/fk-filter"> & {
  columnName: string;
  tableName: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `columnName` | `string` |
| `tableName` | `string` |

***

## FlexibleSizeProps

```ts
type FlexibleSizeProps = PropsWithChildren<{
  className: string;
  height: CSSProperties["height"];
  style: CSSProperties;
  width: CSSProperties["width"];
}>;
```

***

## FontFormat

```ts
type FontFormat = "woff" | "woff2" | "truetype";
```

***

## ForeignFieldReference

```ts
type ForeignFieldReference = ["field", FieldId | string, ReferenceOptions & {
  source-field: FieldId | string;
 }];
```

***

## ForeignKeyReference

```ts
type ForeignKeyReference = {
  status: number;
  value: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="status-5"></a> `status` | `number` |
| <a id="value-15"></a> `value` | `number` |

***

## GetState()

```ts
type GetState = () => State;
```

### Returns

[`State`](internal.md#state)

***

## GroupPermissions

```ts
type GroupPermissions = {};
```

### Index Signature

```ts
[key: number]: DatabasePermissions
```

***

## GroupsPermissions

```ts
type GroupsPermissions = {};
```

### Index Signature

```ts
[key: string | number]: GroupPermissions
```

***

## HelpLinkSetting

```ts
type HelpLinkSetting = "metabase" | "hidden" | "custom";
```

***

## HumanReadableFieldValue

```ts
type HumanReadableFieldValue = string;
```

***

## HumanReadableParameterValue

```ts
type HumanReadableParameterValue = string;
```

***

## IconName

```ts
type IconName = keyof typeof Icons;
```

***

## IconProps

```ts
type IconProps = SVGAttributes<SVGSVGElement> & BoxProps & {
  className: string;
  name: IconName;
  onClick: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
  size: string | number;
  tooltip: ReactNode;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `className`? | `string` |
| `name` | [`IconName`](internal.md#iconname) |
| `onClick`? | (`event`: `MouseEvent`\<`HTMLImageElement` \| `SVGElement`\>) => `void` |
| `size`? | `string` \| `number` |
| `tooltip`? | `ReactNode` |

***

## IfOperator

```ts
type IfOperator = "if";
```

***

## ImplicitActionClickBehavior

```ts
type ImplicitActionClickBehavior = 
  | InsertActionClickBehavior
  | UpdateActionClickBehavior
  | DeleteActionClickBehavior;
```

***

## IndexedEntity

```ts
type IndexedEntity = {
  id: number;
  model: "indexed-entity";
  model_id: CardId;
  model_name: string;
  name: string;
  pk_ref: FieldReference;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="id-48"></a> `id` | `number` |
| <a id="model-2"></a> `model` | `"indexed-entity"` |
| <a id="model_id-1"></a> `model_id` | [`CardId`](internal.md#cardid-1) |
| <a id="model_name"></a> `model_name` | `string` |
| <a id="name-55"></a> `name` | `string` |
| <a id="pk_ref"></a> `pk_ref` | [`FieldReference`](internal.md#fieldreference) |

***

## InitialChartSettingState

```ts
type InitialChartSettingState = {
  section: string | null;
  widget: Widget | null;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="section-2"></a> `section`? | `string` \| `null` |
| <a id="widget"></a> `widget`? | [`Widget`](internal.md#widget-1) \| `null` |

***

## InitialSyncStatus

```ts
type InitialSyncStatus = LongTaskStatus;
```

***

## InlineExpressionAgg

```ts
type InlineExpressionAgg = ["aggregation-options", CommonAggregation, {
  display-name: string;
  name: string;
 }];
```

***

## InputSettingType

```ts
type InputSettingType = 
  | DateInputType
  | "string"
  | "text"
  | "number"
  | "select"
  | "radio"
  | "boolean";
```

***

## InsideFilter

```ts
type InsideFilter = ["inside", ConcreteFieldReference, ConcreteFieldReference, NumericLiteral, NumericLiteral, NumericLiteral, NumericLiteral];
```

***

## InsightExpression

```ts
type InsightExpression = 
  | [InsightExpressionOperator, InsightExpressionOperand, InsightExpressionOperand]
  | [InsightExpressionOperator, InsightExpressionOperand];
```

***

## InsightExpressionOperand

```ts
type InsightExpressionOperand = "x" | number | InsightExpression;
```

***

## InsightExpressionOperator

```ts
type InsightExpressionOperator = "+" | "-" | "*" | "/" | "log" | "pow" | "exp";
```

***

## InteractiveQuestionConfig

```ts
type InteractiveQuestionConfig = {
  componentPlugins: MetabasePluginsConfig;
  entityTypeFilter: EntityTypeFilterKeys[];
  initialSqlParameters: ParameterValues;
  isSaveEnabled: boolean;
  onBeforeSave: (question: MetabaseQuestion | undefined, context: {
     isNewQuestion: boolean;
    }) => Promise<void>;
  onNavigateBack: () => void;
  onSave: (question: MetabaseQuestion | undefined, context: {
     isNewQuestion: boolean;
    }) => void;
  withDownloads: boolean;
} & Pick<SaveQuestionProps<SDKCollectionReference>, "targetCollection">;
```

### Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `componentPlugins`? | [`MetabasePluginsConfig`](internal.md#metabasepluginsconfig) | - |
| `entityTypeFilter`? | [`EntityTypeFilterKeys`](internal.md#entitytypefilterkeys)[] | - |
| `initialSqlParameters`? | [`ParameterValues`](internal.md#parametervalues-3) | Initial values for the SQL parameters |
| `isSaveEnabled`? | `boolean` | Is the save question button visible? |
| `onBeforeSave`? | (`question`: [`MetabaseQuestion`](internal.md#metabasequestion) \| `undefined`, `context`: \{ `isNewQuestion`: `boolean`; \}) => `Promise`\<`void`\> | - |
| `onNavigateBack`? | () => `void` | - |
| `onSave`? | (`question`: [`MetabaseQuestion`](internal.md#metabasequestion) \| `undefined`, `context`: \{ `isNewQuestion`: `boolean`; \}) => `void` | - |
| `withDownloads`? | `boolean` | - |

***

## InteractiveQuestionId

```ts
type InteractiveQuestionId = CardId | "new" | string & {};
```

***

## InteractiveQuestionProviderProps

```ts
type InteractiveQuestionProviderProps = PropsWithChildren<InteractiveQuestionConfig & Omit<LoadSdkQuestionParams, "questionId"> & {
  questionId: InteractiveQuestionId;
}>;
```

***

## Join

```ts
type Join = {
  alias: JoinAlias;
  condition: JoinCondition;
  fields: JoinFields;
  ident: string;
  source-query: StructuredQuery;
  source-table: TableId;
  strategy: JoinStrategy;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="alias"></a> `alias`? | [`JoinAlias`](internal.md#joinalias-2) |
| <a id="condition"></a> `condition` | [`JoinCondition`](internal.md#joincondition) |
| <a id="fields-7"></a> `fields`? | [`JoinFields`](internal.md#joinfields) |
| <a id="ident"></a> `ident`? | `string` |
| <a id="source-query"></a> `source-query`? | [`StructuredQuery`](internal.md#structuredquery-1) |
| <a id="source-table"></a> `source-table`? | [`TableId`](internal.md#tableid-3) |
| <a id="strategy-3"></a> `strategy`? | [`JoinStrategy`](internal.md#joinstrategy) |

***

## JoinAlias

```ts
type JoinAlias = string;
```

***

## JoinClause

```ts
type JoinClause = Join[];
```

***

## JoinCondition

```ts
type JoinCondition = ["=", FieldReference, FieldReference];
```

***

## JoinedFieldReference

```ts
type JoinedFieldReference = ["field", FieldId | string, ReferenceOptions & {
  join-alias: string;
 }];
```

***

## JoinFields

```ts
type JoinFields = 
  | "all"
  | "none"
  | JoinedFieldReference[];
```

***

## JoinStrategy

```ts
type JoinStrategy = "left-join" | "right-join" | "inner-join" | "full-join";
```

***

## JsonQuery

```ts
type JsonQuery = DatasetQuery & {
  cache-strategy: CacheStrategy & {
     avg-execution-ms: number;
     invalidated-at: string;
    };
  parameters: unknown[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `cache-strategy`? | [`CacheStrategy`](internal.md#cachestrategy) & \{ `avg-execution-ms`: `number`; `invalidated-at`: `string`; \} |
| `parameters`? | `unknown`[] |

***

## LastEditInfo

```ts
type LastEditInfo = {
  email: string;
  first_name: string;
  id: UserId;
  last_name: string;
  timestamp: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="email-4"></a> `email` | `string` |
| <a id="first_name-4"></a> `first_name` | `string` |
| <a id="id-49"></a> `id` | [`UserId`](internal.md#userid) |
| <a id="last_name-4"></a> `last_name` | `string` |
| <a id="timestamp"></a> `timestamp` | `string` |

***

## LegacyDrill()

```ts
type LegacyDrill = (options: ClickActionProps) => ClickAction[];
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`ClickActionProps`](internal.md#clickactionprops) |

### Returns

[`ClickAction`](internal.md#clickaction)[]

***

## LimitClause

```ts
type LimitClause = number;
```

***

## LineSize

```ts
type LineSize = "S" | "M" | "L";
```

***

## LinkEntity

```ts
type LinkEntity = 
  | RestrictedLinkEntity
  | UnrestrictedLinkEntity;
```

***

## LoadingMessage

```ts
type LoadingMessage = "doing-science" | "running-query" | "loading-results";
```

***

## LocaleData

```ts
type LocaleData = [string, string];
```

***

## LocalFieldReference

```ts
type LocalFieldReference = ["field", FieldId, ReferenceOptions | null];
```

***

## LoginStatus

```ts
type LoginStatus = 
  | LoginStatusUninitialized
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;
```

***

## LoginStatusError

```ts
type LoginStatusError = {
  error: Error;
  status: "error";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="error-5"></a> `error` | `Error` |
| <a id="status-6"></a> `status` | `"error"` |

***

## LoginStatusLoading

```ts
type LoginStatusLoading = {
  status: "loading";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="status-7"></a> `status` | `"loading"` |

***

## LoginStatusSuccess

```ts
type LoginStatusSuccess = {
  status: "success";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="status-8"></a> `status` | `"success"` |

***

## LoginStatusUninitialized

```ts
type LoginStatusUninitialized = {
  status: "uninitialized";
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="status-9"></a> `status` | `"uninitialized"` |

***

## LongTaskStatus

```ts
type LongTaskStatus = "incomplete" | "complete" | "aborted";
```

***

## MaxAgg

```ts
type MaxAgg = ["max", ConcreteFieldReference];
```

***

## MedianAgg

```ts
type MedianAgg = ["median", ConcreteFieldReference];
```

***

## MetabaseAuthConfig

```ts
type MetabaseAuthConfig = 
  | MetabaseAuthConfigWithProvider
  | MetabaseAuthConfigWithApiKey;
```

***

## MetabaseAuthConfigWithApiKey

```ts
type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
  authProviderUri: never;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `apiKey` | `string` |
| `authProviderUri`? | `never` |

***

## MetabaseAuthConfigWithProvider

```ts
type MetabaseAuthConfigWithProvider = BaseMetabaseAuthConfig & {
  apiKey: never;
  authProviderUri: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `apiKey`? | `never` |
| `authProviderUri` | `string` |

***

## MetabaseClickActionPluginsConfig()

```ts
type MetabaseClickActionPluginsConfig = (clickActions: ClickAction[], clickedDataPoint: MetabaseDataPointObject) => ClickAction[];
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `clickActions` | [`ClickAction`](internal.md#clickaction)[] |
| `clickedDataPoint` | [`MetabaseDataPointObject`](internal.md#metabasedatapointobject) |

### Returns

[`ClickAction`](internal.md#clickaction)[]

***

## MetabaseComponentTheme

```ts
type MetabaseComponentTheme = {
  cartesian: {
     goalLine: {
        label: {
           fontSize: string;
          };
       };
     label: {
        fontSize: string;
       };
     padding: string;
    };
  collectionBrowser: {
     breadcrumbs: {
        expandButton: {
           backgroundColor: ColorCssVariableOrString;
           hoverBackgroundColor: ColorCssVariableOrString;
           hoverTextColor: ColorCssVariableOrString;
           textColor: ColorCssVariableOrString;
          };
       };
     emptyContent: {
        icon: {
           height: CSSProperties["width"];
           width: CSSProperties["width"];
          };
        subtitle: {
           fontSize: CSSProperties["fontSize"];
          };
        title: {
           fontSize: CSSProperties["fontSize"];
          };
       };
    };
  dashboard: {
     backgroundColor: string;
     card: {
        backgroundColor: string;
        border: string;
       };
     gridBorderColor: string;
    };
  number: {
     value: {
        fontSize: CSSProperties["fontSize"];
        lineHeight: string;
       };
    };
  pivotTable: {
     cell: {
        fontSize: string;
       };
     rowToggle: {
        backgroundColor: string;
        textColor: string;
       };
    };
  popover: {
     zIndex: number;
    };
  question: {
     backgroundColor: string;
     toolbar: {
        backgroundColor: string;
       };
    };
  table: {
     cell: {
        backgroundColor: string;
        fontSize: string;
        textColor: string;
       };
     idColumn: {
        backgroundColor: string;
        textColor: string;
       };
    };
  tooltip: {
     backgroundColor: string;
     focusedBackgroundColor: string;
     secondaryTextColor: string;
     textColor: string;
    };
};
```

Theme options for customizing specific Metabase
components and visualizations.

Every non-optional properties here must have a default value defined
in DEFAULT_METABASE_COMPONENT_THEME at [default-component-theme.ts]

### Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="cartesian"></a> `cartesian` | \{ `goalLine`: \{ `label`: \{ `fontSize`: `string`; \}; \}; `label`: \{ `fontSize`: `string`; \}; `padding`: `string`; \} | Cartesian charts |
| `cartesian.goalLine` | \{ `label`: \{ `fontSize`: `string`; \}; \} | - |
| `cartesian.goalLine.label` | \{ `fontSize`: `string`; \} | - |
| `cartesian.goalLine.label.fontSize` | `string` | Font size of goal line labels |
| `cartesian.label` | \{ `fontSize`: `string`; \} | - |
| `cartesian.label.fontSize` | `string` | Labels used in cartesian charts, such as axis ticks and series. |
| `cartesian.padding`? | `string` | Padding around the chart. |
| <a id="collectionbrowser"></a> `collectionBrowser` | \{ `breadcrumbs`: \{ `expandButton`: \{ `backgroundColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `hoverBackgroundColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `hoverTextColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `textColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); \}; \}; `emptyContent`: \{ `icon`: \{ `height`: `CSSProperties`\[`"width"`\]; `width`: `CSSProperties`\[`"width"`\]; \}; `subtitle`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; `title`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; \}; \} | - |
| `collectionBrowser.breadcrumbs` | \{ `expandButton`: \{ `backgroundColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `hoverBackgroundColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `hoverTextColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `textColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); \}; \} | - |
| `collectionBrowser.breadcrumbs.expandButton` | \{ `backgroundColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `hoverBackgroundColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `hoverTextColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); `textColor`: [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring); \} | - |
| `collectionBrowser.breadcrumbs.expandButton.backgroundColor` | [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring) | - |
| `collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor` | [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring) | - |
| `collectionBrowser.breadcrumbs.expandButton.hoverTextColor` | [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring) | - |
| `collectionBrowser.breadcrumbs.expandButton.textColor` | [`ColorCssVariableOrString`](internal.md#colorcssvariableorstring) | - |
| `collectionBrowser.emptyContent` | \{ `icon`: \{ `height`: `CSSProperties`\[`"width"`\]; `width`: `CSSProperties`\[`"width"`\]; \}; `subtitle`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; `title`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; \} | - |
| `collectionBrowser.emptyContent.icon` | \{ `height`: `CSSProperties`\[`"width"`\]; `width`: `CSSProperties`\[`"width"`\]; \} | - |
| `collectionBrowser.emptyContent.icon.height` | `CSSProperties`\[`"width"`\] | - |
| `collectionBrowser.emptyContent.icon.width` | `CSSProperties`\[`"width"`\] | - |
| `collectionBrowser.emptyContent.subtitle` | \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \} | - |
| `collectionBrowser.emptyContent.subtitle.fontSize` | `CSSProperties`\[`"fontSize"`\] | - |
| `collectionBrowser.emptyContent.title` | \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \} | - |
| `collectionBrowser.emptyContent.title.fontSize` | `CSSProperties`\[`"fontSize"`\] | - |
| <a id="dashboard-4"></a> `dashboard` | \{ `backgroundColor`: `string`; `card`: \{ `backgroundColor`: `string`; `border`: `string`; \}; `gridBorderColor`: `string`; \} | - |
| `dashboard.backgroundColor` | `string` | - |
| `dashboard.card` | \{ `backgroundColor`: `string`; `border`: `string`; \} | - |
| `dashboard.card.backgroundColor` | `string` | - |
| `dashboard.card.border`? | `string` | Add custom borders to dashboard cards when set. Value is the same as the border property in CSS, such as "1px solid #ff0000". This will replace the card's drop shadow. |
| `dashboard.gridBorderColor`? | `string` | Border color of the dashboard grid, shown only when editing dashboards. Defaults to `colors.border` |
| <a id="number"></a> `number`? | \{ `value`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; `lineHeight`: `string`; \}; \} | Number chart |
| `number.value`? | \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; `lineHeight`: `string`; \} | Value displayed on number charts. This also applies to the primary value in trend charts. |
| `number.value.fontSize`? | `CSSProperties`\[`"fontSize"`\] | - |
| `number.value.lineHeight`? | `string` | - |
| <a id="pivottable"></a> `pivotTable` | \{ `cell`: \{ `fontSize`: `string`; \}; `rowToggle`: \{ `backgroundColor`: `string`; `textColor`: `string`; \}; \} | Pivot table * |
| `pivotTable.cell` | \{ `fontSize`: `string`; \} | - |
| `pivotTable.cell.fontSize` | `string` | Font size of cell values, defaults to ~12px |
| `pivotTable.rowToggle` | \{ `backgroundColor`: `string`; `textColor`: `string`; \} | Button to toggle pivot table rows |
| `pivotTable.rowToggle.backgroundColor` | `string` | - |
| `pivotTable.rowToggle.textColor` | `string` | - |
| <a id="popover"></a> `popover` | \{ `zIndex`: `number`; \} | Popover |
| `popover.zIndex`? | `number` | z-index of overlays. Useful for embedding components in a modal. Defaults to 200. |
| <a id="question-6"></a> `question` | \{ `backgroundColor`: `string`; `toolbar`: \{ `backgroundColor`: `string`; \}; \} | - |
| `question.backgroundColor` | `string` | Background color for all questions |
| `question.toolbar`? | \{ `backgroundColor`: `string`; \} | Toolbar of the default interactive question layout |
| `question.toolbar.backgroundColor`? | `string` | - |
| <a id="table-11"></a> `table` | \{ `cell`: \{ `backgroundColor`: `string`; `fontSize`: `string`; `textColor`: `string`; \}; `idColumn`: \{ `backgroundColor`: `string`; `textColor`: `string`; \}; \} | Data tables * |
| `table.cell` | \{ `backgroundColor`: `string`; `fontSize`: `string`; `textColor`: `string`; \} | - |
| `table.cell.backgroundColor`? | `string` | Default background color of cells, defaults to `background` |
| `table.cell.fontSize` | `string` | Font size of cell values, defaults to ~12.5px |
| `table.cell.textColor` | `string` | Text color of cells, defaults to `text-primary`. |
| `table.idColumn`? | \{ `backgroundColor`: `string`; `textColor`: `string`; \} | - |
| `table.idColumn.backgroundColor`? | `string` | Background color of ID column, defaults to `lighten(brand)` |
| `table.idColumn.textColor` | `string` | Text color of ID column, defaults to `brand`. |
| <a id="tooltip-1"></a> `tooltip`? | \{ `backgroundColor`: `string`; `focusedBackgroundColor`: `string`; `secondaryTextColor`: `string`; `textColor`: `string`; \} | Tooltip |
| `tooltip.backgroundColor`? | `string` | Tooltip background color. |
| `tooltip.focusedBackgroundColor`? | `string` | Tooltip background color for focused rows. |
| `tooltip.secondaryTextColor`? | `string` | Secondary text color shown in the tooltip, e.g. for tooltip headers and percentage changes. |
| `tooltip.textColor`? | `string` | Tooltip text color. |

***

## MetabaseDashboardPluginsConfig

```ts
type MetabaseDashboardPluginsConfig = {
  dashboardCardMenu:   | DashboardCardMenuCustomElement
     | DashboardCardCustomMenuItem;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="dashboardcardmenu"></a> `dashboardCardMenu`? | \| [`DashboardCardMenuCustomElement`](internal.md#dashboardcardmenucustomelement) \| [`DashboardCardCustomMenuItem`](internal.md#dashboardcardcustommenuitem) |

***

## MetabaseDataPointObject

```ts
type MetabaseDataPointObject = Pick<ClickObject, "value" | "column" | "data" | "event">;
```

***

## MetabaseEmbeddingSessionToken

```ts
type MetabaseEmbeddingSessionToken = {
  exp: number;
  id: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="exp"></a> `exp` | `number` |
| <a id="id-50"></a> `id` | `string` |

***

## MetabaseFetchRequestTokenFn()

```ts
type MetabaseFetchRequestTokenFn = (url: string) => Promise<
  | MetabaseEmbeddingSessionToken
| null>;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |

### Returns

`Promise`\<
  \| [`MetabaseEmbeddingSessionToken`](internal.md#metabaseembeddingsessiontoken)
  \| `null`\>

***

## MetabaseFontFamily

```ts
type MetabaseFontFamily = 
  | "Roboto"
  | "Merriweather"
  | "Open Sans"
  | "Lato"
  | "Noto Sans"
  | "Roboto Slab"
  | "Source Sans Pro"
  | "Raleway"
  | "Slabo 27px"
  | "PT Sans"
  | "Poppins"
  | "PT Serif"
  | "Roboto Mono"
  | "Roboto Condensed"
  | "Playfair Display"
  | "Oswald"
  | "Ubuntu"
  | "Montserrat"
  | "Lora"
  | "Custom";
```

***

## MetabasePluginsConfig

```ts
type MetabasePluginsConfig = {
  dashboard: MetabaseDashboardPluginsConfig;
  mapQuestionClickActions: MetabaseClickActionPluginsConfig;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="dashboard-5"></a> `dashboard`? | [`MetabaseDashboardPluginsConfig`](internal.md#metabasedashboardpluginsconfig) |
| <a id="mapquestionclickactions"></a> `mapQuestionClickActions`? | [`MetabaseClickActionPluginsConfig`](internal.md#metabaseclickactionpluginsconfig) |

***

## MetricAgg

```ts
type MetricAgg = ["metric", CardId];
```

***

## MinAgg

```ts
type MinAgg = ["min", ConcreteFieldReference];
```

***

## ModalName

```ts
type ModalName = null | "collection" | "dashboard" | "action";
```

***

## ModerationReview

```ts
type ModerationReview = {
  created_at: string;
  moderator_id: number;
  most_recent: boolean;
  status: ModerationReviewStatus;
  user: BaseUser;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="created_at-12"></a> `created_at` | `string` |
| <a id="moderator_id"></a> `moderator_id` | `number` |
| <a id="most_recent"></a> `most_recent`? | `boolean` |
| <a id="status-10"></a> `status` | [`ModerationReviewStatus`](internal.md#moderationreviewstatus) |
| <a id="user-2"></a> `user` | [`BaseUser`](internal.md#baseuser) |

***

## ModerationReviewStatus

```ts
type ModerationReviewStatus = "verified" | null;
```

***

## NanoID

```ts
type NanoID = Brand<string, "NanoID">;
```

***

## NativeParameterDimensionTarget

```ts
type NativeParameterDimensionTarget = 
  | ["dimension", VariableTarget]
  | ["dimension", VariableTarget, DimensionTargetOptions];
```

***

## NativePermissions

```ts
type NativePermissions = NativePermissionValues | {};
```

***

## NativePermissionValues

```ts
type NativePermissionValues = 
  | QUERY_BUILDER_AND_NATIVE
  | QUERY_BUILDER
  | NO
  | undefined;
```

***

## NavigateToNewCardFromDashboardOpts

```ts
type NavigateToNewCardFromDashboardOpts = {
  dashcard: DashboardCard;
  nextCard: Card;
  objectId: number | string;
  previousCard: Card;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="dashcard"></a> `dashcard` | [`DashboardCard`](internal.md#dashboardcard) |
| <a id="nextcard"></a> `nextCard` | [`Card`](internal.md#cardq) |
| <a id="objectid"></a> `objectId`? | `number` \| `string` |
| <a id="previouscard"></a> `previousCard` | [`Card`](internal.md#cardq) |

***

## NestedQueryTableId

```ts
type NestedQueryTableId = string;
```

***

## NormalizedCard

```ts
type NormalizedCard = Card;
```

***

## NotEmptyFilter

```ts
type NotEmptyFilter = ["not-empty", ConcreteFieldReference];
```

***

## NotFilter

```ts
type NotFilter = ["not", Filter];
```

***

## NotNullFilter

```ts
type NotNullFilter = ["not-null", ConcreteFieldReference];
```

***

## NotRemappedFieldValue

```ts
type NotRemappedFieldValue = [RowValue];
```

***

## NotRemappedParameterValue

```ts
type NotRemappedParameterValue = [RowValue];
```

***

## NullFilter

```ts
type NullFilter = ["is-null", ConcreteFieldReference];
```

***

## NumberFieldFingerprint

```ts
type NumberFieldFingerprint = {
  avg: number;
  max: number;
  min: number;
  q1: number;
  q3: number;
  sd: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="avg"></a> `avg` | `number` |
| <a id="max"></a> `max` | `number` |
| <a id="min"></a> `min` | `number` |
| <a id="q1"></a> `q1` | `number` |
| <a id="q3"></a> `q3` | `number` |
| <a id="sd"></a> `sd` | `number` |

***

## NumberFingerprintDisplayInfo

```ts
type NumberFingerprintDisplayInfo = {
  avg: unknown;
  max: unknown;
  min: unknown;
  q1: unknown;
  q3: unknown;
  sd: unknown;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="avg-1"></a> `avg` | `unknown` |
| <a id="max-1"></a> `max` | `unknown` |
| <a id="min-1"></a> `min` | `unknown` |
| <a id="q1-1"></a> `q1` | `unknown` |
| <a id="q3-1"></a> `q3` | `unknown` |
| <a id="sd-1"></a> `sd` | `unknown` |

***

## NumberRange

```ts
type NumberRange = [number, number];
```

***

## NumericLiteral

```ts
type NumericLiteral = number;
```

***

## NumericScale

```ts
type NumericScale = typeof numericScale[number];
```

***

## ObjectDetailsDrillThruInfo\<Type\>

```ts
type ObjectDetailsDrillThruInfo<Type> = BaseDrillThruInfo<Type> & {
  isManyPks: boolean;
  objectId: string | number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `isManyPks` | `boolean` |
| `objectId` | `string` \| `number` |

### Type Parameters

| Type Parameter |
| ------ |
| `Type` *extends* [`DrillThruType`](internal.md#drillthrutype) |

***

## OffsetAgg

```ts
type OffsetAgg = ["offset", OffsetOptions, Aggregation, NumericLiteral];
```

***

## OffsetExpression

```ts
type OffsetExpression = ["offset", OffsetOptions, Expression, NumericLiteral];
```

***

## OffsetOptions

```ts
type OffsetOptions = {
  display-name: string;
  lib/uuid: string;
  name: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="display-name-7"></a> `display-name` | `string` |
| <a id="lib/uuid"></a> `lib/uuid` | `string` |
| <a id="name-56"></a> `name` | `string` |

***

## OnChangeCardAndRun()

```ts
type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`OnChangeCardAndRunOpts`](internal.md#onchangecardandrunopts) |

### Returns

`void`

***

## OnChangeCardAndRunOpts

```ts
type OnChangeCardAndRunOpts = {
  nextCard: Card;
  previousCard: Card;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="nextcard-1"></a> `nextCard` | [`Card`](internal.md#cardq) |
| <a id="previouscard-1"></a> `previousCard`? | [`Card`](internal.md#cardq) |

***

## OrderableValue

```ts
type OrderableValue = 
  | NumericLiteral
  | DatetimeLiteral;
```

***

## OrderBy

```ts
type OrderBy = ["asc" | "desc", FieldReference];
```

***

## OrderByClause

```ts
type OrderByClause = OrderBy[];
```

***

## OrFilter

```ts
type OrFilter = ["or", ...Filter[]];
```

***

## ParameterDimensionTarget

```ts
type ParameterDimensionTarget = 
  | NativeParameterDimensionTarget
  | StructuredParameterDimensionTarget;
```

***

## ParameterId

```ts
type ParameterId = string;
```

***

## ParameterTarget

```ts
type ParameterTarget = 
  | ParameterVariableTarget
  | ParameterDimensionTarget
  | ParameterTextTarget;
```

***

## ParameterTextTarget

```ts
type ParameterTextTarget = ["text-tag", string];
```

***

## ParameterValue

```ts
type ParameterValue = 
  | NotRemappedParameterValue
  | RemappedParameterValue;
```

***

## ParameterValueOrArray

```ts
type ParameterValueOrArray = string | number | boolean | (string | number | boolean)[];
```

***

## ParameterValues

```ts
type ParameterValues = Record<ParameterId, string | number>;
```

***

## ParameterValuesCache

```ts
type ParameterValuesCache = Record<string, ParameterValues>;
```

***

## ParameterValuesMap

```ts
type ParameterValuesMap = Record<ParameterId, ParameterValueOrArray | null>;
```

***

## ParameterVariableTarget

```ts
type ParameterVariableTarget = ["variable", VariableTarget];
```

***

## PasswordComplexity

```ts
type PasswordComplexity = {
  digit: number;
  total: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="digit"></a> `digit`? | `number` |
| <a id="total"></a> `total`? | `number` |

***

## PivotDrillThruInfo

```ts
type PivotDrillThruInfo = BaseDrillThruInfo<"drill-thru/pivot">;
```

***

## PivotTableCollapsedRowsSetting

```ts
type PivotTableCollapsedRowsSetting = 
  | ColumnNameCollapsedRowsSetting
  | FieldRefCollapsedRowsSetting;
```

***

## PivotTableColumnSplitSetting

```ts
type PivotTableColumnSplitSetting = 
  | ColumnNameColumnSplitSetting
  | FieldRefColumnSplitSetting;
```

***

## PKDrillThruInfo

```ts
type PKDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/pk">;
```

***

## PopoverClickAction

```ts
type PopoverClickAction = ClickActionBase & {
  popover: (props: ClickActionPopoverProps) => JSX.Element;
  popoverProps: Record<string, unknown>;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `popover` | (`props`: [`ClickActionPopoverProps`](internal.md#clickactionpopoverprops)) => `JSX.Element` |
| `popoverProps`? | `Record`\<`string`, `unknown`\> |

***

## PrivilegedSettings

```ts
type PrivilegedSettings = AdminSettings & SettingsManagerSettings;
```

***

## PublicComponentWrapperProps

```ts
type PublicComponentWrapperProps = {
  children: React.ReactNode;
  className: string;
  style: CSSProperties;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="children-3"></a> `children` | `React.ReactNode` |
| <a id="classname-2"></a> `className`? | `string` |
| <a id="style"></a> `style`? | `CSSProperties` |

***

## PublicOrEmbeddedDashboardEventHandlersProps

```ts
type PublicOrEmbeddedDashboardEventHandlersProps = {
  onLoad: (dashboard: Dashboard | null) => void;
  onLoadWithoutCards: (dashboard: Dashboard | null) => void;
};
```

### Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="onload"></a> `onLoad`? | (`dashboard`: [`Dashboard`](internal.md#dashboard-1) \| `null`) => `void` | Callback that is called when the dashboard is loaded. |
| <a id="onloadwithoutcards"></a> `onLoadWithoutCards`? | (`dashboard`: [`Dashboard`](internal.md#dashboard-1) \| `null`) => `void` | Callback that is called when the dashboard is loaded without cards. |

***

## Query

```ts
type Query = unknown & {
  _opaque: typeof Query;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `_opaque` | *typeof* [`Query`](internal.md#query-6) |

***

## QueryBuilderMode

```ts
type QueryBuilderMode = "view" | "notebook" | "dataset";
```

***

## QueryBuilderQueryStatus

```ts
type QueryBuilderQueryStatus = "idle" | "running" | "complete";
```

***

## QueryClickActionsMode

```ts
type QueryClickActionsMode = {
  clickActions: LegacyDrill[];
  fallback: LegacyDrill;
  name: string;
 } & 
  | {
  hasDrills: false;
 }
  | {
  availableOnlyDrills: DrillThruType[];
  hasDrills: true;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `clickActions` | [`LegacyDrill`](internal.md#legacydrill)[] |
| `fallback`? | [`LegacyDrill`](internal.md#legacydrill) |
| `name` | `string` |

***

## QueryKey

```ts
type QueryKey = string;
```

***

## QueryModalType

```ts
type QueryModalType = typeof MODAL_TYPES[keyof typeof MODAL_TYPES];
```

***

## QueryParams

```ts
type QueryParams = BlankQueryOptions & {
  objectId: string;
  slug: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `objectId`? | `string` |
| `slug`? | `string` |

***

## QuestionChangeClickAction

```ts
type QuestionChangeClickAction = ClickActionBase & QuestionChangeClickActionBase;
```

***

## QuestionChangeClickActionBase

```ts
type QuestionChangeClickActionBase = {
  question: () => Question;
  questionChangeBehavior: QuestionChangeClickActionBehavior;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="question-7"></a> `question` | () => [`Question`](internal.md#question-3) |
| <a id="questionchangebehavior"></a> `questionChangeBehavior`? | [`QuestionChangeClickActionBehavior`](internal.md#questionchangeclickactionbehavior) |

***

## QuestionChangeClickActionBehavior

```ts
type QuestionChangeClickActionBehavior = "changeCardAndRun" | "updateQuestion";
```

What should happen when a "question change" click action is performed?

- `changeCardAndRun`: the card is changed and the query is run. this is the default behavior.
- `updateQuestion`: the question is updated (without running the query)

***

## QuestionCreatorOpts

```ts
type QuestionCreatorOpts = {
  cardType: CardType;
  collectionId: CollectionId;
  dashboardId: DashboardId;
  databaseId: DatabaseId;
  dataset_query: DatasetQuery;
  display: CardDisplayType;
  metadata: Metadata;
  name: string;
  parameterValues: ParameterValuesMap;
  tableId: TableId;
  type: "query" | "native";
  visualization_settings: VisualizationSettings;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="cardtype-1"></a> `cardType`? | [`CardType`](internal.md#cardtype) |
| <a id="collectionid-2"></a> `collectionId`? | [`CollectionId`](internal.md#collectionid) |
| <a id="dashboardid-5"></a> `dashboardId`? | [`DashboardId`](internal.md#dashboardid-4) |
| <a id="databaseid-1"></a> `databaseId`? | [`DatabaseId`](internal.md#databaseid) |
| <a id="dataset_query-3"></a> `dataset_query`? | [`DatasetQuery`](internal.md#datasetquery-3) |
| <a id="display-4"></a> `display`? | [`CardDisplayType`](internal.md#carddisplaytype) |
| <a id="metadata-10"></a> `metadata`? | [`Metadata`](internal.md#metadata-4) |
| <a id="name-57"></a> `name`? | `string` |
| <a id="parametervalues-4"></a> `parameterValues`? | [`ParameterValuesMap`](internal.md#parametervaluesmap) |
| <a id="tableid-2"></a> `tableId`? | [`TableId`](internal.md#tableid-3) |
| <a id="type-59"></a> `type`? | `"query"` \| `"native"` |
| <a id="visualization_settings-3"></a> `visualization_settings`? | [`VisualizationSettings`](internal.md#visualizationsettings) |

***

## QuestionDashboardCard

```ts
type QuestionDashboardCard = BaseDashboardCard & {
  card: Card;
  card_id: CardId | null;
  parameter_mappings:   | DashboardParameterMapping[]
     | null;
  series: Card[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`Card`](internal.md#cardq) |
| `card_id` | [`CardId`](internal.md#cardid-1) \| `null` |
| `parameter_mappings`? | \| [`DashboardParameterMapping`](internal.md#dashboardparametermapping)[] \| `null` |
| `series`? | [`Card`](internal.md#cardq)[] |

***

## QuickFilterDrillThruInfo

```ts
type QuickFilterDrillThruInfo = BaseDrillThruInfo<"drill-thru/quick-filter"> & {
  operators: QuickFilterDrillThruOperator[];
  value: unknown;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `operators` | [`QuickFilterDrillThruOperator`](internal.md#quickfilterdrillthruoperator)[] |
| `value` | `unknown` |

***

## QuickFilterDrillThruOperator

```ts
type QuickFilterDrillThruOperator = "=" | "≠" | "<" | ">" | "contains" | "does-not-contain";
```

***

## RawSeries

```ts
type RawSeries = SingleSeries[];
```

***

## ReduxClickAction

```ts
type ReduxClickAction = ClickActionBase & ReduxClickActionBase;
```

***

## ReduxClickActionBase

```ts
type ReduxClickActionBase = {
  action: () => Dispatcher;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="action-1"></a> `action` | () => [`Dispatcher`](internal.md#dispatcher) |

***

## RefreshPeriod

```ts
type RefreshPeriod = number | null;
```

***

## RegularClickAction

```ts
type RegularClickAction = 
  | ReduxClickAction
  | QuestionChangeClickAction
  | PopoverClickAction
  | UrlClickAction;
```

***

## RegularCollectionId

```ts
type RegularCollectionId = number;
```

***

## RelativeDatetimePeriod

```ts
type RelativeDatetimePeriod = "current" | "last" | "next" | number;
```

***

## RemappedFieldValue

```ts
type RemappedFieldValue = [RowValue, HumanReadableFieldValue];
```

***

## RemappedParameterValue

```ts
type RemappedParameterValue = [RowValue, HumanReadableParameterValue];
```

***

## RequestsGroupState

```ts
type RequestsGroupState = Record<EntityKey, Record<QueryKey, Record<RequestType, RequestState>>>;
```

***

## RequestsState

```ts
type RequestsState = {
  entities: RequestsGroupState;
  plugins: RequestsGroupState;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="entities-2"></a> `entities` | [`RequestsGroupState`](internal.md#requestsgroupstate) |
| <a id="plugins"></a> `plugins` | [`RequestsGroupState`](internal.md#requestsgroupstate) |

***

## RequestType

```ts
type RequestType = string;
```

***

## RestrictedLinkEntity

```ts
type RestrictedLinkEntity = {
  restricted: true;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="restricted"></a> `restricted` | `true` |

***

## RowValue

```ts
type RowValue = string | number | null | boolean;
```

***

## RowValues

```ts
type RowValues = RowValue[];
```

***

## SaveQuestionProps\<C\>

```ts
type SaveQuestionProps<C> = {
  closeOnSuccess: boolean;
  initialCollectionId: CollectionId | null;
  initialDashboardTabId: number | null;
  multiStep: boolean;
  onCreate: (question: Question, options?: {
     dashboardTabId: DashboardTabId;
    }) => Promise<Question>;
  onSave: (question: Question) => Promise<void>;
  originalQuestion: Question | null;
  question: Question;
  targetCollection: C;
};
```

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `C` | [`CollectionId`](internal.md#collectionid) |

### Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="closeonsuccess"></a> `closeOnSuccess`? | `boolean` | - |
| <a id="initialcollectionid"></a> `initialCollectionId`? | [`CollectionId`](internal.md#collectionid) \| `null` | - |
| <a id="initialdashboardtabid"></a> `initialDashboardTabId`? | `number` \| `null` | - |
| <a id="multistep"></a> `multiStep`? | `boolean` | - |
| <a id="oncreate"></a> `onCreate` | (`question`: [`Question`](internal.md#question-3), `options`?: \{ `dashboardTabId`: [`DashboardTabId`](internal.md#dashboardtabid); \}) => `Promise`\<[`Question`](internal.md#question-3)\> | - |
| <a id="onsave"></a> `onSave` | (`question`: [`Question`](internal.md#question-3)) => `Promise`\<`void`\> | - |
| <a id="originalquestion"></a> `originalQuestion` | [`Question`](internal.md#question-3) \| `null` | - |
| <a id="question-8"></a> `question` | [`Question`](internal.md#question-3) | - |
| <a id="targetcollection"></a> `targetCollection`? | `C` | The target collection to save the question to. Currently used for the embedding SDK. When this is defined, the collection picker will be hidden and the question will be saved to this collection. |

***

## ScheduleDayType

```ts
type ScheduleDayType = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
```

***

## ScheduleFrameType

```ts
type ScheduleFrameType = "first" | "mid" | "last";
```

***

## ScheduleType

```ts
type ScheduleType = "hourly" | "daily" | "weekly" | "monthly";
```

***

## SchemaId

```ts
type SchemaId = string;
```

***

## SchemaName

```ts
type SchemaName = string;
```

***

## SchemasPermissions

```ts
type SchemasPermissions = 
  | UNRESTRICTED
  | NO
  | LEGACY_NO_SELF_SERVICE
  | BLOCKED
  | IMPERSONATED
| {};
```

***

## SDKCollectionReference

```ts
type SDKCollectionReference = 
  | RegularCollectionId
  | "personal"
  | "root";
```

***

## SdkDashboardDisplayProps

```ts
type SdkDashboardDisplayProps = {
  className: string;
  dashboardId: DashboardId;
  hiddenParameters: string[];
  initialParameters: Query;
  style: CSSProperties;
  withCardTitle: boolean;
  withDownloads: boolean;
  withFooter: boolean;
  withTitle: boolean;
};
```

### Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="classname-3"></a> `className`? | `string` | A custom class name to be added to the root element. |
| <a id="dashboardid-6"></a> `dashboardId` | [`DashboardId`](internal.md#dashboardid-4) | The ID of the dashboard. This is either: <br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1` <br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| <a id="hiddenparameters"></a> `hiddenParameters`? | `string`[] | A list of parameters to hide ../../embedding/public-links.md#appearance-parameters. |
| <a id="initialparameters"></a> `initialParameters`? | `Query` | Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options. |
| <a id="style-1"></a> `style`? | `CSSProperties` | A custom style object to be added to the root element. |
| <a id="withcardtitle"></a> `withCardTitle`? | `boolean` | Whether the dashboard cards should display a title. |
| <a id="withdownloads-1"></a> `withDownloads`? | `boolean` | Whether to hide the download button. |
| <a id="withfooter"></a> `withFooter`? | `boolean` | Whether to display the footer. |
| <a id="withtitle"></a> `withTitle`? | `boolean` | Whether the dashboard should display a title. |

***

## SdkDashboardLoadEvent()

```ts
type SdkDashboardLoadEvent = (dashboard: Dashboard | null) => void;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `dashboard` | [`Dashboard`](internal.md#dashboard-1) \| `null` |

### Returns

`void`

***

## SdkErrorComponent()

```ts
type SdkErrorComponent = ({
  message,
}: SdkErrorComponentProps) => JSX.Element;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `{ message, }` | [`SdkErrorComponentProps`](internal.md#sdkerrorcomponentprops) |

### Returns

`JSX.Element`

***

## SdkErrorComponentProps

```ts
type SdkErrorComponentProps = {
  message: ReactNode;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="message-3"></a> `message` | `ReactNode` |

***

## SdkEventHandlersConfig

```ts
type SdkEventHandlersConfig = {
  onDashboardLoad: SdkDashboardLoadEvent;
  onDashboardLoadWithoutCards: SdkDashboardLoadEvent;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="ondashboardload"></a> `onDashboardLoad`? | [`SdkDashboardLoadEvent`](internal.md#sdkdashboardloadevent) |
| <a id="ondashboardloadwithoutcards"></a> `onDashboardLoadWithoutCards`? | [`SdkDashboardLoadEvent`](internal.md#sdkdashboardloadevent) |

***

## SdkQuestionTitleProps

```ts
type SdkQuestionTitleProps = boolean | undefined | ReactNode | () => ReactNode;
```

***

## SdkSaveQuestionFormProps

```ts
type SdkSaveQuestionFormProps = {
  onCancel: () => void;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="oncancel"></a> `onCancel`? | () => `void` |

***

## SdkState

```ts
type SdkState = {
  errorComponent: null | SdkErrorComponent;
  eventHandlers: null | SdkEventHandlersConfig;
  fetchRefreshTokenFn:   | null
     | MetabaseFetchRequestTokenFn;
  loaderComponent: null | () => JSX.Element;
  loginStatus: LoginStatus;
  metabaseInstanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"];
  plugins: null | MetabasePluginsConfig;
  token: EmbeddingSessionTokenState;
  usageProblem: null | SdkUsageProblem;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="errorcomponent-1"></a> `errorComponent` | `null` \| [`SdkErrorComponent`](internal.md#sdkerrorcomponent) |
| <a id="eventhandlers-1"></a> `eventHandlers` | `null` \| [`SdkEventHandlersConfig`](internal.md#sdkeventhandlersconfig) |
| <a id="fetchrefreshtokenfn"></a> `fetchRefreshTokenFn` | \| `null` \| [`MetabaseFetchRequestTokenFn`](internal.md#metabasefetchrequesttokenfn) |
| <a id="loadercomponent-1"></a> `loaderComponent` | `null` \| () => `JSX.Element` |
| <a id="loginstatus-1"></a> `loginStatus` | [`LoginStatus`](internal.md#loginstatus) |
| <a id="metabaseinstanceurl-1"></a> `metabaseInstanceUrl` | [`MetabaseAuthConfig`](internal.md#metabaseauthconfig)\[`"metabaseInstanceUrl"`\] |
| <a id="plugins-1"></a> `plugins` | `null` \| [`MetabasePluginsConfig`](internal.md#metabasepluginsconfig) |
| <a id="token-1"></a> `token` | [`EmbeddingSessionTokenState`](internal.md#embeddingsessiontokenstate) |
| <a id="usageproblem"></a> `usageProblem` | `null` \| [`SdkUsageProblem`](internal.md#sdkusageproblem) |

***

## SearchModel

```ts
type SearchModel = typeof SEARCH_MODELS[number];
```

***

## SegmentDisplayInfo

```ts
type SegmentDisplayInfo = {
  description: string;
  displayName: string;
  effectiveType: string;
  filterPositions: number[];
  longDisplayName: string;
  name: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="description-23"></a> `description` | `string` |
| <a id="displayname-5"></a> `displayName` | `string` |
| <a id="effectivetype-1"></a> `effectiveType`? | `string` |
| <a id="filterpositions-1"></a> `filterPositions`? | `number`[] |
| <a id="longdisplayname-1"></a> `longDisplayName` | `string` |
| <a id="name-58"></a> `name` | `string` |

***

## SegmentFilter

```ts
type SegmentFilter = ["segment", SegmentId];
```

***

## SegmentId

```ts
type SegmentId = number;
```

***

## SegmentListItem

```ts
type SegmentListItem = SegmentDisplayInfo & {
  segment: SegmentMetadata;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `segment` | [`SegmentMetadata`](internal.md#segmentmetadata) |

***

## SegmentMetadata

```ts
type SegmentMetadata = unknown & {
  _opaque: typeof SegmentMetadata;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `_opaque` | *typeof* `SegmentMetadata` |

***

## SelectedTabId

```ts
type SelectedTabId = number | null;
```

***

## Series

```ts
type Series = 
  | RawSeries
  | TransformedSeries;
```

***

## SeriesOrderSetting

```ts
type SeriesOrderSetting = {
  color: string;
  enabled: boolean;
  key: string;
  name: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="color-2"></a> `color`? | `string` |
| <a id="enabled-1"></a> `enabled` | `boolean` |
| <a id="key-3"></a> `key` | `string` |
| <a id="name-59"></a> `name` | `string` |

***

## SeriesSettings

```ts
type SeriesSettings = {
  axis: string;
  color: string;
  display: string;
  line.interpolate: string;
  line.marker_enabled: boolean;
  line.missing: string;
  line.size: LineSize;
  line.style: "solid" | "dashed" | "dotted";
  show_series_values: boolean;
  title: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="axis"></a> `axis`? | `string` |
| <a id="color-3"></a> `color`? | `string` |
| <a id="display-5"></a> `display`? | `string` |
| <a id="line.interpolate"></a> `line.interpolate`? | `string` |
| <a id="line.marker_enabled"></a> `line.marker_enabled`? | `boolean` |
| <a id="line.missing"></a> `line.missing`? | `string` |
| <a id="line.size"></a> `line.size`? | [`LineSize`](internal.md#linesize) |
| <a id="line.style"></a> `line.style`? | `"solid"` \| `"dashed"` \| `"dotted"` |
| <a id="show_series_values"></a> `show_series_values`? | `boolean` |
| <a id="title-4"></a> `title`? | `string` |

***

## SessionCookieSameSite

```ts
type SessionCookieSameSite = "lax" | "strict" | "none";
```

***

## SettingKey

```ts
type SettingKey = keyof Settings;
```

***

## Settings

```ts
type Settings = InstanceSettings & PublicSettings & UserSettings & PrivilegedSettings;
```

Important distinction between `null` and `undefined` settings values.
 - `null` means that the setting actually has a value of `null`.
 - `undefined` means that the setting is not available in a certain context.

Further longer explanation:

Clojure doesn't have `undefined`. It uses `nil` to set (the default) value to (JS) `null`.
This can backfire on frontend if we are not aware of this distinction!

Do not use `undefined` when checking for a setting value! Use `null` instead.
Use `undefined` only when checking does the setting (key) exist in a certain context.

Contexts / Scopes:
Settings types are divided into contexts to make this more explicit:
 - `PublicSettings` will always be available to everyone.
 - `InstanceSettings` are settings that are available to all **authenticated** users.
 - `AdminSettings` are settings that are available only to **admins**.
 - `SettingsManagerSettings` are settings that are available only to **settings managers**.
 - `UserSettings` are settings that are available only to **regular users**.

Each new scope is more strict than the previous one.

To further complicate things, there are two endpoints for fetching settings:
 - `GET /api/setting` that _can only be used by admins!_
 - `GET /api/session/properties` that can be used by any user, but some settings might be omitted (unavailable).

SettingsApi will return `403` for non-admins, while SessionApi will return `200`!

***

## SettingValue\<Key\>

```ts
type SettingValue<Key> = Settings[Key];
```

### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Key` *extends* [`SettingKey`](internal.md#settingkey) | [`SettingKey`](internal.md#settingkey) |

***

## SetupStep

```ts
type SetupStep = 
  | "welcome"
  | "language"
  | "user_info"
  | "usage_question"
  | "db_connection"
  | "license_token"
  | "data_usage"
  | "completed";
```

***

## SingleSeries

```ts
type SingleSeries = {
  card: Card;
} & Pick<Dataset, "data" | "error">;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`Card`](internal.md#cardq) |

***

## Size

```ts
type Size = "small" | "medium" | "large";
```

***

## SmartScalarComparison

```ts
type SmartScalarComparison = 
  | SmartScalarComparisonAnotherColumn
  | SmartScalarComparisonPreviousValue
  | SmartScalarComparisonPreviousPeriod
  | SmartScalarComparisonPeriodsAgo
  | SmartScalarComparisonStaticNumber;
```

***

## SmartScalarComparisonType

```ts
type SmartScalarComparisonType = 
  | "anotherColumn"
  | "previousValue"
  | "previousPeriod"
  | "periodsAgo"
  | "staticNumber";
```

***

## SortDrillThruDirection

```ts
type SortDrillThruDirection = "asc" | "desc";
```

***

## SortDrillThruInfo

```ts
type SortDrillThruInfo = BaseDrillThruInfo<"drill-thru/sort"> & {
  directions: SortDrillThruDirection[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `directions` | [`SortDrillThruDirection`](internal.md#sortdrillthrudirection)[] |

***

## SourceTableId

```ts
type SourceTableId = 
  | TableId
  | NestedQueryTableId;
```

***

## StackType

```ts
type StackType = "stacked" | "normalized" | null;
```

***

## StackValuesDisplay

```ts
type StackValuesDisplay = "total" | "all" | "series";
```

***

## StdDevAgg

```ts
type StdDevAgg = ["stddev", ConcreteFieldReference];
```

***

## StoreDashboard

```ts
type StoreDashboard = Omit<Dashboard, "dashcards" | "tabs"> & {
  dashcards: DashCardId[];
  isDirty: boolean;
  tabs: StoreDashboardTab[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `dashcards` | [`DashCardId`](internal.md#dashcardid-3)[] |
| `isDirty`? | `boolean` |
| `tabs`? | [`StoreDashboardTab`](internal.md#storedashboardtab)[] |

***

## StoreDashboardTab

```ts
type StoreDashboardTab = DashboardTab & {
  isRemoved: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `isRemoved`? | `boolean` |

***

## StoreDashcard

```ts
type StoreDashcard = DashboardCard & {
  isAdded: boolean;
  isDirty: boolean;
  isRemoved: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `isAdded`? | `boolean` |
| `isDirty`? | `boolean` |
| `isRemoved`? | `boolean` |

***

## StringFilter

```ts
type StringFilter = 
  | ["starts-with" | "contains" | "does-not-contain" | "ends-with", ConcreteFieldReference, StringLiteral]
  | ["starts-with" | "contains" | "does-not-contain" | "ends-with", ConcreteFieldReference, StringLiteral, StringFilterOptions];
```

***

## StringFilterOptions

```ts
type StringFilterOptions = {
  case-sensitive: false;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="case-sensitive-1"></a> `case-sensitive`? | `false` |

***

## StringifiedDimension

```ts
type StringifiedDimension = string;
```

***

## StringLiteral

```ts
type StringLiteral = string;
```

***

## StructuredParameterDimensionTarget

```ts
type StructuredParameterDimensionTarget = 
  | ["dimension", 
  | ConcreteFieldReference
  | ExpressionReference]
  | ["dimension", 
  | ConcreteFieldReference
  | ExpressionReference, DimensionTargetOptions];
```

***

## StructuredQuery

```ts
type StructuredQuery = {
  aggregation: AggregationClause;
  breakout: BreakoutClause;
  expressions: ExpressionClause;
  fields: FieldsClause;
  filter: FilterClause;
  joins: JoinClause;
  limit: LimitClause;
  order-by: OrderByClause;
  source-query: StructuredQuery;
  source-table: SourceTableId;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="aggregation-1"></a> `aggregation`? | [`AggregationClause`](internal.md#aggregationclause) |
| <a id="breakout-1"></a> `breakout`? | [`BreakoutClause`](internal.md#breakoutclause) |
| <a id="expressions"></a> `expressions`? | [`ExpressionClause`](internal.md#expressionclause) |
| <a id="fields-8"></a> `fields`? | [`FieldsClause`](internal.md#fieldsclause) |
| <a id="filter-2"></a> `filter`? | [`FilterClause`](internal.md#filterclause) |
| <a id="joins"></a> `joins`? | [`JoinClause`](internal.md#joinclause) |
| <a id="limit"></a> `limit`? | [`LimitClause`](internal.md#limitclause) |
| <a id="order-by"></a> `order-by`? | [`OrderByClause`](internal.md#orderbyclause) |
| <a id="source-query-1"></a> `source-query`? | [`StructuredQuery`](internal.md#structuredquery-1) |
| <a id="source-table-1"></a> `source-table`? | [`SourceTableId`](internal.md#sourcetableid) |

***

## SumAgg

```ts
type SumAgg = ["sum", ConcreteFieldReference];
```

***

## SummarizeColumnByTimeDrillThruInfo

```ts
type SummarizeColumnByTimeDrillThruInfo = BaseDrillThruInfo<"drill-thru/summarize-column-by-time">;
```

***

## SummarizeColumnDrillThruInfo

```ts
type SummarizeColumnDrillThruInfo = BaseDrillThruInfo<"drill-thru/summarize-column"> & {
  aggregations: SummarizeColumnDrillThruOperator[];
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `aggregations` | [`SummarizeColumnDrillThruOperator`](internal.md#summarizecolumndrillthruoperator)[] |

***

## SummarizeColumnDrillThruOperator

```ts
type SummarizeColumnDrillThruOperator = "sum" | "avg" | "distinct";
```

***

## TabDeletion

```ts
type TabDeletion = {
  id: TabDeletionId;
  removedDashCardIds: DashCardId[];
  tabId: DashboardTabId;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="id-51"></a> `id` | [`TabDeletionId`](internal.md#tabdeletionid) |
| <a id="removeddashcardids"></a> `removedDashCardIds` | [`DashCardId`](internal.md#dashcardid-3)[] |
| <a id="tabid-1"></a> `tabId` | [`DashboardTabId`](internal.md#dashboardtabid) |

***

## TabDeletionId

```ts
type TabDeletionId = number;
```

***

## Table

```ts
type Table = {
  active: boolean;
  caveats: string;
  created_at: string;
  db: Database;
  db_id: DatabaseId;
  description: string | null;
  dimension_options: Record<string, FieldDimensionOption>;
  display_name: string;
  field_order: TableFieldOrder;
  fields: Field[];
  fks: ForeignKey[];
  id: TableId;
  initial_sync_status: InitialSyncStatus;
  is_upload: boolean;
  metrics: Card[];
  name: string;
  points_of_interest: string;
  schema: SchemaName;
  segments: Segment[];
  type: CardType;
  updated_at: string;
  visibility_type: TableVisibilityType;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="active-4"></a> `active` | `boolean` |
| <a id="caveats-7"></a> `caveats`? | `string` |
| <a id="created_at-13"></a> `created_at` | `string` |
| <a id="db-3"></a> `db`? | [`Database`](internal.md#database-3) |
| <a id="db_id-3"></a> `db_id` | [`DatabaseId`](internal.md#databaseid) |
| <a id="description-24"></a> `description` | `string` \| `null` |
| <a id="dimension_options-4"></a> `dimension_options`? | `Record`\<`string`, [`FieldDimensionOption`](internal.md#fielddimensionoption)\> |
| <a id="display_name-7"></a> `display_name` | `string` |
| <a id="field_order-2"></a> `field_order` | [`TableFieldOrder`](internal.md#tablefieldorder) |
| <a id="fields-9"></a> `fields`? | [`Field`](internal.md#field-5)[] |
| <a id="fks-3"></a> `fks`? | [`ForeignKey`](internal.md#foreignkey-1)[] |
| <a id="id-52"></a> `id` | [`TableId`](internal.md#tableid-3) |
| <a id="initial_sync_status-5"></a> `initial_sync_status` | [`InitialSyncStatus`](internal.md#initialsyncstatus) |
| <a id="is_upload-2"></a> `is_upload` | `boolean` |
| <a id="metrics-2"></a> `metrics`? | [`Card`](internal.md#cardq)[] |
| <a id="name-60"></a> `name` | `string` |
| <a id="points_of_interest-7"></a> `points_of_interest`? | `string` |
| <a id="schema-5"></a> `schema` | [`SchemaName`](internal.md#schemaname) |
| <a id="segments-5"></a> `segments`? | [`Segment`](internal.md#segment-2)[] |
| <a id="type-60"></a> `type`? | [`CardType`](internal.md#cardtype) |
| <a id="updated_at-12"></a> `updated_at` | `string` |
| <a id="visibility_type-6"></a> `visibility_type` | [`TableVisibilityType`](internal.md#tablevisibilitytype) |

***

## TableColumnOrderSetting

```ts
type TableColumnOrderSetting = {
  enabled: boolean;
  name: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="enabled-2"></a> `enabled` | `boolean` |
| <a id="name-61"></a> `name` | `string` |

***

## TableDisplayInfo

```ts
type TableDisplayInfo = {
  displayName: string;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  isMetric: boolean;
  isModel: boolean;
  isQuestion: boolean;
  isSourceTable: boolean;
  name: string;
  schema: SchemaId;
  visibilityType: TableVisibilityType;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="displayname-6"></a> `displayName` | `string` |
| <a id="isfromjoin-1"></a> `isFromJoin` | `boolean` |
| <a id="isimplicitlyjoinable-1"></a> `isImplicitlyJoinable` | `boolean` |
| <a id="ismetric"></a> `isMetric`? | `boolean` |
| <a id="ismodel"></a> `isModel`? | `boolean` |
| <a id="isquestion"></a> `isQuestion`? | `boolean` |
| <a id="issourcetable"></a> `isSourceTable` | `boolean` |
| <a id="name-62"></a> `name` | `string` |
| <a id="schema-6"></a> `schema` | [`SchemaId`](internal.md#schemaid) |
| <a id="visibilitytype"></a> `visibilityType`? | [`TableVisibilityType`](internal.md#tablevisibilitytype) |

***

## TableFieldOrder

```ts
type TableFieldOrder = "database" | "alphabetical" | "custom" | "smart";
```

***

## TableId

```ts
type TableId = 
  | ConcreteTableId
  | VirtualTableId;
```

***

## TableInlineDisplayInfo

```ts
type TableInlineDisplayInfo = Pick<TableDisplayInfo, "name" | "displayName" | "isSourceTable">;
```

***

## TablesPermissions

```ts
type TablesPermissions = 
  | UNRESTRICTED
  | LEGACY_NO_SELF_SERVICE
  | BLOCKED
| {};
```

***

## TableVisibilityType

```ts
type TableVisibilityType = 
  | null
  | "details-only"
  | "hidden"
  | "normal"
  | "retired"
  | "sensitive"
  | "technical"
  | "cruft";
```

***

## TagName

```ts
type TagName = string;
```

***

## TemplateTagName

```ts
type TemplateTagName = string;
```

***

## TemplateTagReference

```ts
type TemplateTagReference = ["template-tag", TagName];
```

***

## TemplateTags

```ts
type TemplateTags = Record<TemplateTagName, TemplateTag>;
```

***

## TemplateTagType

```ts
type TemplateTagType = "card" | "text" | "number" | "date" | "dimension" | "snippet";
```

***

## TemporalUnit

```ts
type TemporalUnit = 
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "quarter"
  | "month"
  | "year"
  | "minute-of-hour"
  | "hour-of-day"
  | "day-of-week"
  | "day-of-month"
  | "day-of-year"
  | "week-of-year"
  | "month-of-year"
  | "quarter-of-year";
```

***

## TempStorage

```ts
type TempStorage = {
  last-opened-onboarding-checklist-item: ChecklistItemValue | undefined;
};
```

Storage for non-critical, ephemeral user preferences.
Think of it as a sessionStorage alternative implemented in Redux.
Only specific key/value pairs can be stored here,
and then later used with the `use-temp-storage` hook.

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="last-opened-onboarding-checklist-item"></a> `last-opened-onboarding-checklist-item` | [`ChecklistItemValue`](internal.md#checklistitemvalue) \| `undefined` |

***

## TextFieldFingerprint

```ts
type TextFieldFingerprint = {
  average-length: number;
  percent-email: number;
  percent-json: number;
  percent-state: number;
  percent-url: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="average-length"></a> `average-length` | `number` |
| <a id="percent-email"></a> `percent-email` | `number` |
| <a id="percent-json"></a> `percent-json` | `number` |
| <a id="percent-state"></a> `percent-state` | `number` |
| <a id="percent-url"></a> `percent-url` | `number` |

***

## TextFingerprintDisplayInfo

```ts
type TextFingerprintDisplayInfo = {
  averageLength: number;
  percentEmail: number;
  percentJson: number;
  percentState: number;
  percentUrl: number;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="averagelength"></a> `averageLength` | `number` |
| <a id="percentemail"></a> `percentEmail` | `number` |
| <a id="percentjson"></a> `percentJson` | `number` |
| <a id="percentstate"></a> `percentState` | `number` |
| <a id="percenturl"></a> `percentUrl` | `number` |

***

## TimeIntervalFilter

```ts
type TimeIntervalFilter = 
  | ["time-interval", ConcreteFieldReference, RelativeDatetimePeriod, DateTimeAbsoluteUnit]
  | ["time-interval", ConcreteFieldReference, RelativeDatetimePeriod, DateTimeAbsoluteUnit, TimeIntervalFilterOptions];
```

***

## TimeIntervalFilterOptions

```ts
type TimeIntervalFilterOptions = {
  include-current: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="include-current"></a> `include-current`? | `boolean` |

***

## TokenFeature

```ts
type TokenFeature = typeof tokenFeatures[number];
```

***

## TokenFeatures

```ts
type TokenFeatures = Record<TokenFeature, boolean>;
```

***

## TransformedSeries

```ts
type TransformedSeries = RawSeries & {
  _raw: Series;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `_raw` | [`Series`](internal.md#series-1) |

***

## UiParameter

```ts
type UiParameter = 
  | FieldFilterUiParameter
  | ValuePopulatedParameter & {
  hidden: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `hidden`? | `boolean` |

***

## UnderlyingRecordsDrillThruInfo

```ts
type UnderlyingRecordsDrillThruInfo = BaseDrillThruInfo<"drill-thru/underlying-records"> & {
  rowCount: number;
  tableName: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `rowCount` | `number` |
| `tableName` | `string` |

***

## UndoState

```ts
type UndoState = Undo[];
```

***

## UnrestrictedLinkEntity

```ts
type UnrestrictedLinkEntity = {
  database_id: number;
  db_id: number;
  description: string | null;
  display: CardDisplayType;
  display_name: string;
  id: number;
  model: SearchModel;
  name: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="database_id-4"></a> `database_id`? | `number` |
| <a id="db_id-4"></a> `db_id`? | `number` |
| <a id="description-25"></a> `description`? | `string` \| `null` |
| <a id="display-6"></a> `display`? | [`CardDisplayType`](internal.md#carddisplaytype) |
| <a id="display_name-8"></a> `display_name`? | `string` |
| <a id="id-53"></a> `id` | `number` |
| <a id="model-3"></a> `model` | [`SearchModel`](internal.md#searchmodel) |
| <a id="name-63"></a> `name` | `string` |

***

## UpdateChannel

```ts
type UpdateChannel = "latest" | "beta" | "nightly";
```

***

## UrlClickAction

```ts
type UrlClickAction = ClickActionBase & UrlClickActionBase;
```

***

## UrlClickActionBase

```ts
type UrlClickActionBase = {
  ignoreSiteUrl: boolean;
  url: () => string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="ignoresiteurl"></a> `ignoreSiteUrl`? | `boolean` |
| <a id="url-2"></a> `url` | () => `string` |

***

## UsageReason

```ts
type UsageReason = "self-service-analytics" | "embedding" | "both" | "not-sure";
```

***

## UserFacingEntityName

```ts
type UserFacingEntityName = typeof USER_FACING_ENTITY_NAMES[number];
```

***

## UserId

```ts
type UserId = number;
```

***

## UserInfo

```ts
type UserInfo = Pick<BaseUser, 
  | "id"
  | "common_name"
  | "first_name"
  | "last_name"
  | "email"
  | "date_joined"
  | "last_login"
  | "is_superuser"
| "is_qbnewb">;
```

***

## UserSettings

```ts
type UserSettings = {
  browse-filter-only-verified-metrics: boolean;
  browse-filter-only-verified-models: boolean;
  dismissed-browse-models-banner: boolean;
  dismissed-collection-cleanup-banner: boolean;
  dismissed-custom-dashboard-toast: boolean;
  dismissed-onboarding-sidebar-link: boolean;
  expand-bookmarks-in-nav: boolean;
  expand-browse-in-nav: boolean;
  last-used-native-database-id: number | null;
  notebook-native-preview-shown: boolean;
  notebook-native-preview-sidebar-width: number | null;
  show-updated-permission-banner: boolean;
  show-updated-permission-modal: boolean;
  trial-banner-dismissal-timestamp: string | null;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="browse-filter-only-verified-metrics"></a> `browse-filter-only-verified-metrics`? | `boolean` |
| <a id="browse-filter-only-verified-models"></a> `browse-filter-only-verified-models`? | `boolean` |
| <a id="dismissed-browse-models-banner"></a> `dismissed-browse-models-banner`? | `boolean` |
| <a id="dismissed-collection-cleanup-banner"></a> `dismissed-collection-cleanup-banner`? | `boolean` |
| <a id="dismissed-custom-dashboard-toast"></a> `dismissed-custom-dashboard-toast`? | `boolean` |
| <a id="dismissed-onboarding-sidebar-link"></a> `dismissed-onboarding-sidebar-link`? | `boolean` |
| <a id="expand-bookmarks-in-nav"></a> `expand-bookmarks-in-nav`? | `boolean` |
| <a id="expand-browse-in-nav"></a> `expand-browse-in-nav`? | `boolean` |
| <a id="last-used-native-database-id"></a> `last-used-native-database-id`? | `number` \| `null` |
| <a id="notebook-native-preview-shown"></a> `notebook-native-preview-shown`? | `boolean` |
| <a id="notebook-native-preview-sidebar-width"></a> `notebook-native-preview-sidebar-width`? | `number` \| `null` |
| <a id="show-updated-permission-banner"></a> `show-updated-permission-banner` | `boolean` |
| <a id="show-updated-permission-modal"></a> `show-updated-permission-modal` | `boolean` |
| <a id="trial-banner-dismissal-timestamp"></a> `trial-banner-dismissal-timestamp`? | `string` \| `null` |

***

## Value

```ts
type Value = 
  | null
  | boolean
  | StringLiteral
  | NumericLiteral
  | DatetimeLiteral;
```

***

## ValuesQueryType

```ts
type ValuesQueryType = "list" | "search" | "none";
```

***

## ValuesSourceType

```ts
type ValuesSourceType = null | "card" | "static-list";
```

***

## VariableFilter()

```ts
type VariableFilter = (variable: Variable) => boolean;
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `variable` | `Variable` |

### Returns

`boolean`

***

## VariableTarget

```ts
type VariableTarget = ["template-tag", string];
```

***

## VirtualCard

```ts
type VirtualCard = Partial<Omit<Card, "name" | "dataset_query" | "visualization_settings" | "display">> & {
  dataset_query: Record<string, never>;
  display: VirtualCardDisplay;
  name: null;
  visualization_settings: VisualizationSettings;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `dataset_query` | `Record`\<`string`, `never`\> |
| `display` | [`VirtualCardDisplay`](internal.md#virtualcarddisplay) |
| `name` | `null` |
| `visualization_settings` | [`VisualizationSettings`](internal.md#visualizationsettings) |

***

## VirtualCardDisplay

```ts
type VirtualCardDisplay = typeof virtualCardDisplayTypes[number];
```

***

## VirtualDashboardCard

```ts
type VirtualDashboardCard = BaseDashboardCard & {
  card: VirtualCard;
  card_id: null;
  parameter_mappings:   | VirtualDashCardParameterMapping[]
     | null;
  visualization_settings: BaseDashboardCard["visualization_settings"] & {
     link: LinkCardSettings;
     virtual_card: VirtualCard;
    };
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`VirtualCard`](internal.md#virtualcard) |
| `card_id` | `null` |
| `parameter_mappings`? | \| [`VirtualDashCardParameterMapping`](internal.md#virtualdashcardparametermapping)[] \| `null` |
| `visualization_settings` | [`BaseDashboardCard`](internal.md#basedashboardcard)\[`"visualization_settings"`\] & \{ `link`: [`LinkCardSettings`](internal.md#linkcardsettings); `virtual_card`: [`VirtualCard`](internal.md#virtualcard); \} |

***

## VirtualDashCardParameterMapping

```ts
type VirtualDashCardParameterMapping = {
  parameter_id: ParameterId;
  target: ParameterTarget;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="parameter_id-1"></a> `parameter_id` | [`ParameterId`](internal.md#parameterid-1) |
| <a id="target-9"></a> `target` | [`ParameterTarget`](internal.md#parametertarget) |

***

## VirtualTableId

```ts
type VirtualTableId = string;
```

***

## VisualizationDisplay

```ts
type VisualizationDisplay = 
  | VirtualCardDisplay
  | CardDisplayType;
```

***

## VisualizationSettings

```ts
type VisualizationSettings = {
[key: string]: any;   column_settings: Record<string, ColumnSettings>;
  funnel.rows: SeriesOrderSetting[];
  graph.dimensions: string[];
  graph.goal_label: string;
  graph.goal_value: number;
  graph.max_categories: number;
  graph.max_categories_enabled: boolean;
  graph.metrics: string[];
  graph.other_category_aggregation_fn: "sum" | "avg" | "min" | "max" | "stddev" | "median";
  graph.series_order: SeriesOrderSetting[];
  graph.show_goal: boolean;
  graph.show_stack_values: StackValuesDisplay;
  graph.show_trendline: boolean;
  graph.show_values: boolean;
  graph.x_axis.axis_enabled: true | false | "compact" | "rotate-45" | "rotate-90";
  graph.x_axis.scale: XAxisScale;
  graph.x_axis.title_text: string;
  graph.y_axis.axis_enabled: boolean;
  graph.y_axis.max: number;
  graph.y_axis.min: number;
  graph.y_axis.scale: YAxisScale;
  graph.y_axis.title_text: string;
  pie.colors: Record<string, string>;
  pie.decimal_places: number;
  pie.dimension: string | string[];
  pie.metric: string;
  pie.middle_dimension: string;
  pie.outer_dimension: string;
  pie.percent_visibility: "off" | "legend" | "inside" | "both";
  pie.rows: PieRow[];
  pie.show_labels: boolean;
  pie.show_legend: boolean;
  pie.show_total: boolean;
  pie.slice_threshold: number;
  pie.sort_rows: boolean;
  pivot_table.collapsed_rows: PivotTableCollapsedRowsSetting;
  pivot_table.column_split: PivotTableColumnSplitSetting;
  sankey.label_value_formatting: "auto" | "full" | "compact";
  sankey.node_align: "left" | "right" | "justify";
  sankey.show_edge_labels: boolean;
  sankey.source: string;
  sankey.target: string;
  sankey.value: string;
  scalar.compact_primary_number: boolean;
  scalar.comparisons: SmartScalarComparison[];
  scalar.field: string;
  scalar.switch_positive_negative: boolean;
  scatter.bubble: string;
  series_settings: Record<string, SeriesSettings>;
  stackable.stack_type: StackType;
  table.column_formatting: ColumnFormattingSetting[];
  table.columns: TableColumnOrderSetting[];
  waterfall.decrease_color: string;
  waterfall.increase_color: string;
  waterfall.show_total: boolean;
  waterfall.total_color: string;
 } & EmbedVisualizationSettings;
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `column_settings`? | `Record`\<`string`, [`ColumnSettings`](internal.md#columnsettings)\> |
| `funnel.rows`? | [`SeriesOrderSetting`](internal.md#seriesordersetting)[] |
| `graph.dimensions`? | `string`[] |
| `graph.goal_label`? | `string` |
| `graph.goal_value`? | `number` |
| `graph.max_categories`? | `number` |
| `graph.max_categories_enabled`? | `boolean` |
| `graph.metrics`? | `string`[] |
| `graph.other_category_aggregation_fn`? | `"sum"` \| `"avg"` \| `"min"` \| `"max"` \| `"stddev"` \| `"median"` |
| `graph.series_order`? | [`SeriesOrderSetting`](internal.md#seriesordersetting)[] |
| `graph.show_goal`? | `boolean` |
| `graph.show_stack_values`? | [`StackValuesDisplay`](internal.md#stackvaluesdisplay) |
| `graph.show_trendline`? | `boolean` |
| `graph.show_values`? | `boolean` |
| `graph.x_axis.axis_enabled`? | `true` \| `false` \| `"compact"` \| `"rotate-45"` \| `"rotate-90"` |
| `graph.x_axis.scale`? | [`XAxisScale`](internal.md#xaxisscale) |
| `graph.x_axis.title_text`? | `string` |
| `graph.y_axis.axis_enabled`? | `boolean` |
| `graph.y_axis.max`? | `number` |
| `graph.y_axis.min`? | `number` |
| `graph.y_axis.scale`? | [`YAxisScale`](internal.md#yaxisscale) |
| `graph.y_axis.title_text`? | `string` |
| `pie.colors`? | `Record`\<`string`, `string`\> |
| `pie.decimal_places`? | `number` |
| `pie.dimension`? | `string` \| `string`[] |
| `pie.metric`? | `string` |
| `pie.middle_dimension`? | `string` |
| `pie.outer_dimension`? | `string` |
| `pie.percent_visibility`? | `"off"` \| `"legend"` \| `"inside"` \| `"both"` |
| `pie.rows`? | [`PieRow`](internal.md#pierow)[] |
| `pie.show_labels`? | `boolean` |
| `pie.show_legend`? | `boolean` |
| `pie.show_total`? | `boolean` |
| `pie.slice_threshold`? | `number` |
| `pie.sort_rows`? | `boolean` |
| `pivot_table.collapsed_rows`? | [`PivotTableCollapsedRowsSetting`](internal.md#pivottablecollapsedrowssetting) |
| `pivot_table.column_split`? | [`PivotTableColumnSplitSetting`](internal.md#pivottablecolumnsplitsetting) |
| `sankey.label_value_formatting`? | `"auto"` \| `"full"` \| `"compact"` |
| `sankey.node_align`? | `"left"` \| `"right"` \| `"justify"` |
| `sankey.show_edge_labels`? | `boolean` |
| `sankey.source`? | `string` |
| `sankey.target`? | `string` |
| `sankey.value`? | `string` |
| `scalar.compact_primary_number`? | `boolean` |
| `scalar.comparisons`? | [`SmartScalarComparison`](internal.md#smartscalarcomparison)[] |
| `scalar.field`? | `string` |
| `scalar.switch_positive_negative`? | `boolean` |
| `scatter.bubble`? | `string` |
| `series_settings`? | `Record`\<`string`, [`SeriesSettings`](internal.md#seriessettings)\> |
| `stackable.stack_type`? | [`StackType`](internal.md#stacktype) |
| `table.column_formatting`? | [`ColumnFormattingSetting`](internal.md#columnformattingsetting)[] |
| `table.columns`? | [`TableColumnOrderSetting`](internal.md#tablecolumnordersetting)[] |
| `waterfall.decrease_color`? | `string` |
| `waterfall.increase_color`? | `string` |
| `waterfall.show_total`? | `boolean` |
| `waterfall.total_color`? | `string` |

***

## Widget

```ts
type Widget = {
  hidden: boolean;
  id: string;
  props: Record<string, unknown>;
  section: string;
  title: string;
  widget: () => JSX.Element | null | undefined;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="hidden-2"></a> `hidden`? | `boolean` |
| <a id="id-54"></a> `id` | `string` |
| <a id="props-3"></a> `props` | `Record`\<`string`, `unknown`\> |
| <a id="section-3"></a> `section` | `string` |
| <a id="title-5"></a> `title`? | `string` |
| <a id="widget-2"></a> `widget` | () => `JSX.Element` \| `null` \| `undefined` |

***

## WritebackAction

```ts
type WritebackAction = WritebackActionBase & 
  | QueryAction
  | ImplicitQueryAction
  | HttpAction;
```

***

## WritebackActionId

```ts
type WritebackActionId = number;
```

***

## XAxisScale

```ts
type XAxisScale = 
  | "ordinal"
  | "histogram"
  | "timeseries"
  | NumericScale;
```

***

## YAxisScale

```ts
type YAxisScale = NumericScale;
```

***

## ZoomDrillThruInfo

```ts
type ZoomDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/zoom">;
```

***

## ZoomTimeseriesDrillThruInfo

```ts
type ZoomTimeseriesDrillThruInfo = BaseDrillThruInfo<"drill-thru/zoom-in.timeseries"> & {
  displayName: string;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| `displayName`? | `string` |

***

## Query

```ts
const Query: unique symbol;
```

An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
