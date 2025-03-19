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

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="active"></a> `active` | `boolean` |
| <a id="caveats"></a> `caveats`? | `string` |
| <a id="created_at"></a> `created_at` | `string` |
| <a id="db"></a> `db`? | [`Database`](../interfaces/Database.md) |
| <a id="db_id"></a> `db_id` | [`DatabaseId`](DatabaseId.md) |
| <a id="description"></a> `description` | `string` \| `null` |
| <a id="dimension_options"></a> `dimension_options`? | `Record`\<`string`, [`FieldDimensionOption`](FieldDimensionOption.md)\> |
| <a id="display_name"></a> `display_name` | `string` |
| <a id="field_order"></a> `field_order` | [`TableFieldOrder`](TableFieldOrder.md) |
| <a id="fields"></a> `fields`? | [`Field`](../interfaces/Field.md)[] |
| <a id="fks"></a> `fks`? | [`ForeignKey`](../interfaces/ForeignKey.md)[] |
| <a id="id"></a> `id` | [`TableId`](TableId.md) |
| <a id="initial_sync_status"></a> `initial_sync_status` | [`InitialSyncStatus`](InitialSyncStatus.md) |
| <a id="is_upload"></a> `is_upload` | `boolean` |
| <a id="metrics"></a> `metrics`? | [`Card`](../interfaces/Card.md)[] |
| <a id="name"></a> `name` | `string` |
| <a id="points_of_interest"></a> `points_of_interest`? | `string` |
| <a id="schema"></a> `schema` | [`SchemaName`](SchemaName.md) |
| <a id="segments"></a> `segments`? | [`Segment`](../interfaces/Segment.md)[] |
| <a id="type"></a> `type`? | [`CardType`](CardType.md) |
| <a id="updated_at"></a> `updated_at` | `string` |
| <a id="visibility_type"></a> `visibility_type` | [`TableVisibilityType`](TableVisibilityType.md) |
