Dimension base class, represents an MBQL field reference.

Used for displaying fields (like Created At) and their "sub-dimensions" (like Created At by Day)
in field lists and active value widgets for filters, aggregations and breakouts.

## Extended by

- [`FieldDimension`](FieldDimension.md)

## Constructors

### new default()

```ts
new default(
   parent: undefined | null | default, 
   args: any[], 
   metadata?: any, 
   query?: null | StructuredQuery, 
   options?: any): default
```

Dimension constructor

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parent` | `undefined` \| `null` \| [`default`](default.md) |
| `args` | `any`[] |
| `metadata`? | `any` |
| `query`? | `null` \| [`StructuredQuery`](StructuredQuery.md) |
| `options`? | `any` |

#### Returns

[`default`](default.md)

## Properties

| Property | Type |
| ------ | ------ |
| <a id="_args"></a> `_args` | `any` |
| <a id="_metadata-1"></a> `_metadata` | `any` |
| <a id="_options"></a> `_options` | `any` |
| <a id="_parent"></a> `_parent` | `undefined` \| `null` \| [`default`](default.md) |
| <a id="_query"></a> `_query` | `any` |
| <a id="_subdisplayname"></a> `_subDisplayName` | `undefined` \| `null` \| `string` |
| <a id="_subtriggerdisplayname"></a> `_subTriggerDisplayName` | `undefined` \| `null` \| `string` |

## Methods

### \_describeBinning()

```ts
_describeBinning(): string
```

Short string that describes the binning options used. Used for both subTriggerDisplayName() and render()

#### Returns

`string`

***

### \_dimensionForOption()

```ts
_dimensionForOption(option: DimensionOption): undefined | null | default
```

Internal method gets a Dimension from a DimensionOption

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `option` | [`DimensionOption`](../type-aliases/DimensionOption.md) |

#### Returns

`undefined` \| `null` \| [`default`](default.md)

***

### \_isBinnable()

```ts
_isBinnable(): boolean
```

Whether this is a numeric Field that can be binned

#### Returns

`boolean`

***

### \_withOptions()

```ts
abstract _withOptions(_options: any): default
```

Return a copy of this Dimension that includes the specified `options`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `_options` | `any` |

#### Returns

[`default`](default.md)

***

### baseDimension()

```ts
baseDimension(): default
```

Return a copy of this Dimension with any temporal bucketing or binning options removed.

#### Returns

[`default`](default.md)

***

### columnName()

```ts
columnName(): string
```

The `name` appearing in the column object (except duplicates would normally be suffxied)

#### Returns

`string`

***

### defaultBreakout()

```ts
defaultBreakout(): undefined | null | FieldReference
```

Returns MBQL for the default breakout

Tries to look up a default subdimension (like "Created At: Day" for "Created At" field)
and if it isn't found, uses the plain field id dimension (like "Product ID") as a fallback.

#### Returns

`undefined` \| `null` \| [`FieldReference`](../type-aliases/FieldReference.md)

***

### defaultDimension()

```ts
abstract defaultDimension(DimensionTypes: any[]): undefined | null | default
```

Returns the default sub-dimension of this dimension, if any.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `DimensionTypes` | `any`[] | `DIMENSION_TYPES` |

#### Returns

`undefined` \| `null` \| [`default`](default.md)

***

### dimensions()

```ts
abstract dimensions(DimensionTypes?: typeof default[]): default[]
```

Returns "sub-dimensions" of this dimension.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `DimensionTypes`? | *typeof* [`default`](default.md)[] |

#### Returns

[`default`](default.md)[]

***

### displayName()

```ts
abstract displayName(..._args: unknown[]): string
```

The display name of this dimension, e.x. the field's display_name

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`_args` | `unknown`[] |

#### Returns

`string`

***

### field()

```ts
field(): default
```

The underlying field for this dimension

#### Returns

[`default`](default.md)

***

### getOption()

```ts
getOption(k: string): any
```

Get an option from the field options map, if there is one.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `k` | `string` |

#### Returns

`any`

***

### icon()

```ts
abstract icon(): undefined | null | string
```

An icon name representing this dimension's type, to be used in the <Icon> component.

#### Returns

`undefined` \| `null` \| `string`

***

### isEqual()

```ts
isEqual(other: 
  | undefined
  | null
  | ConcreteFieldReference
  | default): boolean
```

Is this dimension identical to another dimension or MBQL clause

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | \| `undefined` \| `null` \| [`ConcreteFieldReference`](../type-aliases/ConcreteFieldReference.md) \| [`default`](default.md) |

#### Returns

`boolean`

***

### isSameBaseDimension()

```ts
isSameBaseDimension(other: 
  | undefined
  | null
  | FieldReference
  | default): boolean
```

Does this dimension have the same underlying base dimension, typically a field

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | \| `undefined` \| `null` \| [`FieldReference`](../type-aliases/FieldReference.md) \| [`default`](default.md) |

#### Returns

`boolean`

***

### isTemporalExtraction()

```ts
isTemporalExtraction(): boolean
```

Whether temporal bucketing is being applied, *and* the bucketing is a truncation operation such as "month" or
"quarter";

#### Returns

`boolean`

***

### joinAlias()

```ts
joinAlias(): any
```

Return the join alias associated with this field, if any.

#### Returns

`any`

***

### render()

```ts
render(): any
```

Renders a dimension to a string for display in query builders

#### Returns

`any`

***

### subDisplayName()

```ts
subDisplayName(): string
```

The name to be shown when this dimension is being displayed as a sub-dimension of another.

Example: a temporal bucketing option such as 'by Day' or 'by Month'.

#### Returns

`string`

***

### subTriggerDisplayName()

```ts
subTriggerDisplayName(): string
```

A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger (e.g. the list of temporal
bucketing options like 'Day' or 'Month')

#### Returns

`string`

***

### withJoinAlias()

```ts
withJoinAlias(newAlias: any): default
```

Return a copy of this Dimension with join alias set to `newAlias`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `newAlias` | `any` |

#### Returns

[`default`](default.md)

***

### withOption()

```ts
withOption(key: string, value: any): default
```

Return a copy of this Dimension with option `key` set to `value`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `value` | `any` |

#### Returns

[`default`](default.md)

***

### withoutOptions()

```ts
abstract withoutOptions(..._options: string[]): default
```

Return a copy of this Dimension that excludes `options`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`_options` | `string`[] |

#### Returns

[`default`](default.md)

***

### withoutTemporalBucketing()

```ts
withoutTemporalBucketing(): default
```

Return a copy of this Dimension with any temporal unit options removed.

#### Returns

[`default`](default.md)

***

### withSourceField()

```ts
withSourceField(sourceField: any): default
```

Return a copy of this Dimension with a replacement source field.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sourceField` | `any` |

#### Returns

[`default`](default.md)

***

### withTemporalUnit()

```ts
withTemporalUnit(unit: string): default
```

Return a copy of this Dimension, bucketed by the specified temporal unit.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `unit` | `string` |

#### Returns

[`default`](default.md)

***

### defaultDimension()

```ts
abstract static defaultDimension(_parent: default): undefined | null | default
```

The default sub-dimension for the provided dimension of this type, if any.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `_parent` | [`default`](default.md) |

#### Returns

`undefined` \| `null` \| [`default`](default.md)

***

### dimensions()

```ts
abstract static dimensions(_parent: default): default[]
```

Sub-dimensions for the provided dimension of this type.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `_parent` | [`default`](default.md) |

#### Returns

[`default`](default.md)[]

***

### isEqual()

```ts
static isEqual(a: 
  | undefined
  | null
  | ConcreteFieldReference
  | default, b: undefined | null | default): boolean
```

Returns true if these two dimensions are identical to one another.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | \| `undefined` \| `null` \| [`ConcreteFieldReference`](../type-aliases/ConcreteFieldReference.md) \| [`default`](default.md) |
| `b` | `undefined` \| `null` \| [`default`](default.md) |

#### Returns

`boolean`

***

### parseMBQL()

```ts
static parseMBQL(
   mbql: 
  | VariableTarget
  | FieldReference, 
   metadata?: any, 
   query?: null | StructuredQuery | NativeQuery): undefined | null | default
```

Parses an MBQL expression into an appropriate Dimension subclass, if possible.
Metadata should be provided if you intend to use the display name or render methods.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mbql` | \| [`VariableTarget`](../type-aliases/VariableTarget.md) \| [`FieldReference`](../type-aliases/FieldReference.md) |
| `metadata`? | `any` |
| `query`? | `null` \| [`StructuredQuery`](StructuredQuery.md) \| `NativeQuery` |

#### Returns

`undefined` \| `null` \| [`default`](default.md)
