#### Extends

* `Omit`<[`Table`](./api_html/Table.md), `"db"` | `"fields"` | `"fks"` | `"segments"` | `"metrics"` | `"schema"`>

#### Properties

| Property                                               | Type                                                                             | Inherited from             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------- |
| <a id="active"></a> `active`                           | `boolean`                                                                        | `Omit.active`              |
| <a id="caveats"></a> `caveats?`                        | `string`                                                                         | `Omit.caveats`             |
| <a id="created_at"></a> `created_at`                   | `string`                                                                         | `Omit.created_at`          |
| <a id="db"></a> `db?`                                  | `number`                                                                         | -                          |
| <a id="db_id"></a> `db_id`                             | `number`                                                                         | `Omit.db_id`               |
| <a id="description"></a> `description`                 | `null` \| `string`                                                               | `Omit.description`         |
| <a id="dimension_options"></a> `dimension_options?`    | `Record`<`string`, [`FieldDimensionOption`](./api_html/FieldDimensionOption.md)> | `Omit.dimension_options`   |
| <a id="display_name"></a> `display_name`               | `string`                                                                         | `Omit.display_name`        |
| <a id="field_order"></a> `field_order`                 | [`TableFieldOrder`](./api_html/TableFieldOrder.md)                               | `Omit.field_order`         |
| <a id="fields"></a> `fields?`                          | `number`\[]                                                                      | -                          |
| <a id="fks"></a> `fks?`                                | [`NormalizedForeignKey`](./api_html/NormalizedForeignKey.md)\[]                  | -                          |
| <a id="id"></a> `id`                                   | [`TableId`](./api_html/TableId.md)                                               | `Omit.id`                  |
| <a id="initial_sync_status"></a> `initial_sync_status` | [`LongTaskStatus`](./api_html/LongTaskStatus.md)                                 | `Omit.initial_sync_status` |
| <a id="is_upload"></a> `is_upload`                     | `boolean`                                                                        | `Omit.is_upload`           |
| <a id="metrics"></a> `metrics?`                        | `number`\[]                                                                      | -                          |
| <a id="name"></a> `name`                               | `string`                                                                         | `Omit.name`                |
| <a id="original_fields"></a> `original_fields?`        | [`Field_2`](./api_html/Field_2.md)\[]                                            | -                          |
| <a id="points_of_interest"></a> `points_of_interest?`  | `string`                                                                         | `Omit.points_of_interest`  |
| <a id="schema"></a> `schema?`                          | `string`                                                                         | -                          |
| <a id="schema_name"></a> `schema_name?`                | `string`                                                                         | -                          |
| <a id="segments"></a> `segments?`                      | `number`\[]                                                                      | -                          |
| <a id="type"></a> `type?`                              | [`CardType`](./api_html/CardType.md)                                             | `Omit.type`                |
| <a id="updated_at"></a> `updated_at`                   | `string`                                                                         | `Omit.updated_at`          |
| <a id="visibility_type"></a> `visibility_type`         | [`TableVisibilityType`](./api_html/TableVisibilityType.md)                       | `Omit.visibility_type`     |
