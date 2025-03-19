## Extends

- [`UnsavedCard`](UnsavedCard.md)\<`Q`\>

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Q` *extends* [`DatasetQuery`](../type-aliases/DatasetQuery.md) | [`DatasetQuery`](../type-aliases/DatasetQuery.md) |

## Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="archived"></a> `archived` | `boolean` | - |
| <a id="average_query_time"></a> `average_query_time` | `null` \| `number` | - |
| <a id="based_on_upload"></a> `based_on_upload?` | `null` \| [`TableId`](../type-aliases/TableId.md) | - |
| <a id="cache_ttl"></a> `cache_ttl` | `null` \| `number` | - |
| <a id="can_delete"></a> `can_delete` | `boolean` | - |
| <a id="can_manage_db"></a> `can_manage_db` | `boolean` | - |
| <a id="can_restore"></a> `can_restore` | `boolean` | - |
| <a id="can_write"></a> `can_write` | `boolean` | - |
| <a id="collection"></a> `collection?` | `null` \| [`Collection`](Collection.md) | - |
| <a id="collection_id"></a> `collection_id` | `null` \| `number` | - |
| <a id="collection_position"></a> `collection_position` | `null` \| `number` | - |
| <a id="created_at"></a> `created_at` | `string` | - |
| <a id="creator"></a> `creator?` | [`CreatorInfo`](../type-aliases/CreatorInfo.md) | - |
| <a id="dashboard"></a> `dashboard` | `null` \| `Pick`\<[`Dashboard`](Dashboard.md), `"id"` \| `"name"`\> | - |
| <a id="dashboard_count"></a> `dashboard_count` | `null` \| `number` | - |
| <a id="dashboard_id"></a> `dashboard_id` | `null` \| [`DashboardId`](../type-aliases/DashboardId.md) | - |
| <a id="dashboardid"></a> `dashboardId?` | [`DashboardId`](../type-aliases/DashboardId.md) | [`UnsavedCard`](UnsavedCard.md).[`dashboardId`](UnsavedCard.md#dashboardid) |
| <a id="dashcardid"></a> `dashcardId?` | `number` | [`UnsavedCard`](UnsavedCard.md).[`dashcardId`](UnsavedCard.md#dashcardid) |
| <a id="database_id"></a> `database_id?` | `number` | - |
| <a id="dataset_query"></a> `dataset_query` | `Q` | [`UnsavedCard`](UnsavedCard.md).[`dataset_query`](UnsavedCard.md#dataset_query) |
| <a id="description"></a> `description` | `null` \| `string` | - |
| <a id="display"></a> `display` | [`VisualizationDisplay`](../type-aliases/VisualizationDisplay.md) | [`UnsavedCard`](UnsavedCard.md).[`display`](UnsavedCard.md#display) |
| <a id="embedding_params"></a> `embedding_params` | `null` \| [`EmbeddingParameters`](../type-aliases/EmbeddingParameters.md) | - |
| <a id="enable_embedding"></a> `enable_embedding` | `boolean` | - |
| <a id="entity_id"></a> `entity_id` | [`NanoID`](../type-aliases/NanoID.md) | - |
| <a id="id"></a> `id` | `number` | - |
| <a id="initially_published_at"></a> `initially_published_at` | `null` \| `string` | - |
| <a id="last_query_start"></a> `last_query_start` | `null` \| `string` | - |
| <a id="last-edit-info"></a> `last-edit-info?` | [`LastEditInfo`](../type-aliases/LastEditInfo.md) | - |
| <a id="moderation_reviews"></a> `moderation_reviews?` | [`ModerationReview`](../type-aliases/ModerationReview.md)[] | - |
| <a id="name"></a> `name` | `string` | - |
| <a id="original_card_id"></a> `original_card_id?` | `number` | [`UnsavedCard`](UnsavedCard.md).[`original_card_id`](UnsavedCard.md#original_card_id) |
| <a id="parameters"></a> `parameters?` | [`Parameter`](Parameter.md)[] | [`UnsavedCard`](UnsavedCard.md).[`parameters`](UnsavedCard.md#parameters) |
| <a id="persisted"></a> `persisted?` | `boolean` | - |
| <a id="public_uuid"></a> `public_uuid` | `null` \| `string` | - |
| <a id="query_average_duration"></a> `query_average_duration?` | `null` \| `number` | - |
| <a id="result_metadata"></a> `result_metadata` | [`Field`](Field.md)[] | - |
| <a id="type"></a> `type` | [`CardType`](../type-aliases/CardType.md) | - |
| <a id="updated_at"></a> `updated_at` | `string` | - |
| <a id="visualization_settings"></a> `visualization_settings` | [`VisualizationSettings`](../type-aliases/VisualizationSettings.md) | [`UnsavedCard`](UnsavedCard.md).[`visualization_settings`](UnsavedCard.md#visualization_settings) |
