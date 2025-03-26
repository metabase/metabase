## Properties

| Property | Type |
| ------ | ------ |
| <a id="archived"></a> `archived` | `boolean` |
| <a id="auto_apply_filters"></a> `auto_apply_filters` | `boolean` |
| <a id="cache_ttl"></a> `cache_ttl` | `null` \| `number` |
| <a id="can_delete"></a> `can_delete` | `boolean` |
| <a id="can_restore"></a> `can_restore` | `boolean` |
| <a id="can_write"></a> `can_write` | `boolean` |
| <a id="collection"></a> `collection?` | `null` \| [`Collection`](internal/Collection.md) |
| <a id="collection_authority_level"></a> `collection_authority_level?` | [`CollectionAuthorityLevel`](internal/CollectionAuthorityLevel.md) |
| <a id="collection_id"></a> `collection_id` | `null` \| [`CollectionId`](internal/CollectionId.md) |
| <a id="created_at"></a> `created_at` | `string` |
| <a id="creator_id"></a> `creator_id` | `number` |
| <a id="dashcards"></a> `dashcards` | [`DashboardCard`](internal/DashboardCard.md)[] |
| <a id="description"></a> `description` | `null` \| `string` |
| <a id="embedding_params"></a> `embedding_params?` | `null` \| [`EmbeddingParameters`](internal/EmbeddingParameters.md) |
| <a id="enable_embedding"></a> `enable_embedding` | `boolean` |
| <a id="entity_id"></a> `entity_id` | [`NanoID`](internal/NanoID.md) |
| <a id="id"></a> `id` | [`DashboardId`](internal/DashboardId.md) |
| <a id="initially_published_at"></a> `initially_published_at` | `null` \| `string` |
| <a id="last_used_param_values"></a> `last_used_param_values` | `Record`\<`string`, `null` \| `string` \| `number` \| `boolean` \| `string`[] \| `number`[]\> |
| <a id="last-edit-info"></a> `last-edit-info` | \{ `email`: `string`; `first_name`: `string`; `id`: `number`; `last_name`: `string`; `timestamp`: `string`; \} |
| `last-edit-info.email` | `string` |
| `last-edit-info.first_name` | `string` |
| `last-edit-info.id` | `number` |
| `last-edit-info.last_name` | `string` |
| `last-edit-info.timestamp` | `string` |
| <a id="model"></a> `model?` | `string` |
| <a id="moderation_reviews"></a> `moderation_reviews` | [`ModerationReview`](internal/ModerationReview.md)[] |
| <a id="name"></a> `name` | `string` |
| <a id="parameters"></a> `parameters?` | `null` \| [`Parameter`](internal/Parameter.md)[] |
| <a id="point_of_interest"></a> `point_of_interest?` | `null` \| `string` |
| <a id="public_uuid"></a> `public_uuid` | `null` \| `string` |
| <a id="show_in_getting_started"></a> `show_in_getting_started?` | `null` \| `boolean` |
| <a id="tabs"></a> `tabs?` | [`DashboardTab`](internal/DashboardTab.md)[] |
| <a id="updated_at"></a> `updated_at` | `string` |
| <a id="width"></a> `width` | [`DashboardWidth`](internal/DashboardWidth.md) |
