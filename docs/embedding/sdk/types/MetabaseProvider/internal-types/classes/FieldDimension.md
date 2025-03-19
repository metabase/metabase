`:field` clause e.g. `["field", fieldIdOrName, options]`

## Extends

- [`default`](default.md)

## Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="_args"></a> `_args` | `any` | [`default`](default.md).[`_args`](default.md#_args) |
| <a id="_metadata"></a> `_metadata` | `any` | [`default`](default.md).[`_metadata`](default.md#_metadata-1) |
| <a id="_options"></a> `_options` | `any` | [`default`](default.md).[`_options`](default.md#_options) |
| <a id="_parent"></a> `_parent` | `undefined` \| `null` \| [`default`](default.md) | [`default`](default.md).[`_parent`](default.md#_parent) |
| <a id="_query"></a> `_query` | `any` | [`default`](default.md).[`_query`](default.md#_query) |
| <a id="_subdisplayname"></a> `_subDisplayName` | `undefined` \| `null` \| `string` | [`default`](default.md).[`_subDisplayName`](default.md#_subdisplayname) |
| <a id="_subtriggerdisplayname"></a> `_subTriggerDisplayName` | `undefined` \| `null` \| `string` | [`default`](default.md).[`_subTriggerDisplayName`](default.md#_subtriggerdisplayname) |

## Methods

### \_describeBinning()

```ts
_describeBinning(): string
```

Short string that describes the binning options used. Used for both subTriggerDisplayName() and render()

#### Returns

`string`

#### Inherited from

[`default`](default.md).[`_describeBinning`](default.md#_describebinning)

***

### \_dimensionForOption()

```ts
_dimensionForOption(option: any): FieldDimension
```

Internal method gets a Dimension from a DimensionOption

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `option` | `any` |

#### Returns

[`FieldDimension`](FieldDimension.md)

#### Overrides

[`default`](default.md).[`_dimensionForOption`](default.md#_dimensionforoption)

***

### \_isBinnable()

```ts
_isBinnable(): boolean
```

Whether this is a numeric Field that can be binned

#### Returns

`boolean`

#### Inherited from

[`default`](default.md).[`_isBinnable`](default.md#_isbinnable)

***

### \_withOptions()

```ts
_withOptions(options: any): FieldDimension
```

Return a copy of this FieldDimension that includes the specified `options`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `any` |

#### Returns

[`FieldDimension`](FieldDimension.md)

#### Overrides

[`default`](default.md).[`_withOptions`](default.md#_withoptions)

***

### baseDimension()

```ts
baseDimension(): default
```

Return a copy of this Dimension with any temporal bucketing or binning options removed.

#### Returns

[`default`](default.md)

#### Inherited from

[`default`](default.md).[`baseDimension`](default.md#basedimension)

***

### columnName()

```ts
columnName(): any
```

The `name` appearing in the column object (except duplicates would normally be suffxied)

#### Returns

`any`

#### Overrides

[`default`](default.md).[`columnName`](default.md#columnname)

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

#### Inherited from

[`default`](default.md).[`defaultBreakout`](default.md#defaultbreakout)

***

### defaultDimension()

```ts
abstract defaultDimension(dimensionTypes: never[]): FieldDimension
```

Returns the default sub-dimension of this dimension, if any.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `dimensionTypes` | `never`[] | `[]` |

#### Returns

[`FieldDimension`](FieldDimension.md)

#### Overrides

[`default`](default.md).[`defaultDimension`](default.md#defaultdimension)

***

### dimensions()

```ts
abstract dimensions(DimensionTypes?: typeof default[]): FieldDimension[]
```

Returns "sub-dimensions" of this dimension.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `DimensionTypes`? | *typeof* [`default`](default.md)[] |

#### Returns

[`FieldDimension`](FieldDimension.md)[]

#### Overrides

[`default`](default.md).[`dimensions`](default.md#dimensions)

***

### displayName()

```ts
abstract displayName(...args: any[]): string
```

The display name of this dimension, e.x. the field's display_name

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

#### Returns

`string`

#### Overrides

[`default`](default.md).[`displayName`](default.md#displayname)

***

### field()

```ts
field(): default
```

The underlying field for this dimension

#### Returns

[`default`](default.md)

#### Overrides

[`default`](default.md).[`field`](default.md#field-1)

***

### fieldIdOrName()

```ts
fieldIdOrName(): string | number
```

Return integer ID *or* string name of the Field this `field` clause refers to.

#### Returns

`string` \| `number`

***

### fk()

```ts
fk(): null | FieldDimension
```

For `:field` clauses with an FK source field, returns a new Dimension for the source field.

#### Returns

`null` \| [`FieldDimension`](FieldDimension.md)

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

#### Inherited from

[`default`](default.md).[`getOption`](default.md#getoption)

***

### icon()

```ts
abstract icon(): string
```

An icon name representing this dimension's type, to be used in the <Icon> component.

#### Returns

`string`

#### Overrides

[`default`](default.md).[`icon`](default.md#icon)

***

### isEqual()

```ts
isEqual(somethingElse: any): any
```

Is this dimension identical to another dimension or MBQL clause

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `somethingElse` | `any` |

#### Returns

`any`

#### Overrides

[`default`](default.md).[`isEqual`](default.md#isequal)

***

### isIntegerFieldId()

```ts
isIntegerFieldId(): boolean
```

Whether this Field clause has an integer Field ID (as opposed to a string Field name).

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

#### Inherited from

[`default`](default.md).[`isSameBaseDimension`](default.md#issamebasedimension)

***

### isStringFieldName()

```ts
isStringFieldName(): boolean
```

Whether this Field clause has a string Field name (as opposed to an integer Field ID). This generally means the
Field comes from a native query.

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

#### Inherited from

[`default`](default.md).[`isTemporalExtraction`](default.md#istemporalextraction)

***

### joinAlias()

```ts
joinAlias(): any
```

Return the join alias associated with this field, if any.

#### Returns

`any`

#### Inherited from

[`default`](default.md).[`joinAlias`](default.md#joinalias)

***

### render()

```ts
render(): string
```

Renders a dimension to a string for display in query builders

#### Returns

`string`

#### Overrides

[`default`](default.md).[`render`](default.md#render)

***

### subDisplayName()

```ts
subDisplayName(): string
```

The name to be shown when this dimension is being displayed as a sub-dimension of another.

Example: a temporal bucketing option such as 'by Day' or 'by Month'.

#### Returns

`string`

#### Inherited from

[`default`](default.md).[`subDisplayName`](default.md#subdisplayname)

***

### subTriggerDisplayName()

```ts
subTriggerDisplayName(): string
```

A shorter version of subDisplayName, e.x. to be shown in the dimension picker trigger (e.g. the list of temporal
bucketing options like 'Day' or 'Month')

#### Returns

`string`

#### Inherited from

[`default`](default.md).[`subTriggerDisplayName`](default.md#subtriggerdisplayname)

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

#### Inherited from

[`default`](default.md).[`withJoinAlias`](default.md#withjoinalias)

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

#### Inherited from

[`default`](default.md).[`withOption`](default.md#withoption)

***

### withoutOptions()

```ts
withoutOptions(...options: string[]): FieldDimension
```

Return a copy of this FieldDimension that excludes `options`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`options` | `string`[] |

#### Returns

[`FieldDimension`](FieldDimension.md)

#### Overrides

[`default`](default.md).[`withoutOptions`](default.md#withoutoptions)

***

### withoutTemporalBucketing()

```ts
withoutTemporalBucketing(): default
```

Return a copy of this Dimension with any temporal unit options removed.

#### Returns

[`default`](default.md)

#### Inherited from

[`default`](default.md).[`withoutTemporalBucketing`](default.md#withouttemporalbucketing)

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

#### Inherited from

[`default`](default.md).[`withSourceField`](default.md#withsourcefield)

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

#### Inherited from

[`default`](default.md).[`withTemporalUnit`](default.md#withtemporalunit)

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

#### Inherited from

[`default`](default.md).[`defaultDimension`](default.md#defaultdimension-2)

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

#### Inherited from

[`default`](default.md).[`dimensions`](default.md#dimensions-2)

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

#### Inherited from

[`default`](default.md).[`isEqual`](default.md#isequal-2)

***

### parseMBQL()

```ts
static parseMBQL(
   mbql: any, 
   metadata: null, 
   query: null): undefined | null | FieldDimension
```

Parses an MBQL expression into an appropriate Dimension subclass, if possible.
Metadata should be provided if you intend to use the display name or render methods.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `mbql` | `any` | `undefined` |
| `metadata` | `null` | `null` |
| `query` | `null` | `null` |

#### Returns

`undefined` \| `null` \| [`FieldDimension`](FieldDimension.md)

#### Overrides

[`default`](default.md).[`parseMBQL`](default.md#parsembql)

***

### parseMBQLOrWarn()

```ts
static parseMBQLOrWarn(
   mbql: any, 
   metadata: null, 
   query: null): undefined | null | FieldDimension
```

Parse MBQL field clause or log a warning message if it could not be parsed. Use this when you expect the clause to
be a `:field` clause

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `mbql` | `any` | `undefined` |
| `metadata` | `null` | `null` |
| `query` | `null` | `null` |

#### Returns

`undefined` \| `null` \| [`FieldDimension`](FieldDimension.md)
