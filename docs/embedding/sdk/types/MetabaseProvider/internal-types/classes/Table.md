## Deprecated

use RTK Query endpoints and plain api objects from metabase-types/api

## Extends

- `Omit`\<[`NormalizedTable`](../interfaces/NormalizedTable.md), `"db"` \| `"schema"` \| `"fields"` \| `"fks"` \| `"segments"` \| `"metrics"`\>

## Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="active"></a> ~~`active`~~ | `boolean` | `Omit.active` |
| <a id="caveats"></a> ~~`caveats?`~~ | `string` | `Omit.caveats` |
| <a id="created_at"></a> ~~`created_at`~~ | `string` | `Omit.created_at` |
| <a id="db"></a> ~~`db?`~~ | [`Database`](Database.md) | - |
| <a id="db_id"></a> ~~`db_id`~~ | `number` | `Omit.db_id` |
| <a id="description"></a> ~~`description`~~ | `null` \| `string` | `Omit.description` |
| <a id="dimension_options"></a> ~~`dimension_options?`~~ | `Record`\<`string`, [`FieldDimensionOption`](../type-aliases/FieldDimensionOption.md)\> | `Omit.dimension_options` |
| <a id="display_name"></a> ~~`display_name`~~ | `string` | `Omit.display_name` |
| <a id="field_order"></a> ~~`field_order`~~ | [`TableFieldOrder`](../type-aliases/TableFieldOrder.md) | `Omit.field_order` |
| <a id="fields"></a> ~~`fields?`~~ | [`default`](default.md)[] | - |
| <a id="fks"></a> ~~`fks?`~~ | [`ForeignKey`](ForeignKey.md)[] | - |
| <a id="id"></a> ~~`id`~~ | [`TableId`](../type-aliases/TableId.md) | `Omit.id` |
| <a id="initial_sync_status"></a> ~~`initial_sync_status`~~ | [`LongTaskStatus`](../type-aliases/LongTaskStatus.md) | `Omit.initial_sync_status` |
| <a id="is_upload"></a> ~~`is_upload`~~ | `boolean` | `Omit.is_upload` |
| <a id="metadata"></a> ~~`metadata?`~~ | [`Metadata`](Metadata.md) | - |
| <a id="metrics"></a> ~~`metrics?`~~ | [`Question`](Question.md)[] | - |
| <a id="name"></a> ~~`name`~~ | `string` | `Omit.name` |
| <a id="original_fields"></a> ~~`original_fields?`~~ | [`Field`](../interfaces/Field.md)[] | `Omit.original_fields` |
| <a id="points_of_interest"></a> ~~`points_of_interest?`~~ | `string` | `Omit.points_of_interest` |
| <a id="schema"></a> ~~`schema?`~~ | [`Schema`](Schema.md) | - |
| <a id="schema_name"></a> ~~`schema_name?`~~ | `string` | `Omit.schema_name` |
| <a id="segments"></a> ~~`segments?`~~ | [`Segment`](Segment.md)[] | - |
| <a id="type"></a> ~~`type?`~~ | [`CardType`](../type-aliases/CardType.md) | `Omit.type` |
| <a id="updated_at"></a> ~~`updated_at`~~ | `string` | `Omit.updated_at` |
| <a id="visibility_type"></a> ~~`visibility_type`~~ | [`TableVisibilityType`](../type-aliases/TableVisibilityType.md) | `Omit.visibility_type` |

## Methods

### ~~objectName()~~

```ts
objectName(): string
```

The singular form of the object type this table represents
Currently we try to guess this by singularizing `display_name`, but ideally it would be configurable in metadata
See also `field.targetObjectName()`

#### Returns

`string`
