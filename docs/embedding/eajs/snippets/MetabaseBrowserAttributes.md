Attributes for the `<metabase-browser>` web component.

Embeds a collection browser so people can navigate collections and open
dashboards or questions. Only available for authenticated (SSO) modular embeds.

## Remarks

<!-- [<snippet remarks>] -->

Pro/Enterprise

<!-- [<endsnippet remarks>] -->

## Properties

<!-- [<snippet properties>] -->

| Property                                                             | Type                 | Description                                                                                                                                                                                                                                                                              |
| :------------------------------------------------------------------- | :------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="collection-entity-types"></a> `collection-entity-types`       | `string`[]           | An array of entity types to show in the collection browser: `collection`, `dashboard`, `question`, `model`.<br>---<br>Optional<br>Possible values: `"model"`, `"collection"`, `"dashboard"`, `"question"`                                                                                |
| <a id="collection-page-size"></a> `collection-page-size`             | `number`             | How many items to show per page in the collection browser.<br>---<br>Optional                                                                                                                                                                                                            |
| <a id="collection-visible-columns"></a> `collection-visible-columns` | `string`[]           | An array of columns to show in the collection browser: `type`, `name`, `description`, `lastEditedBy`, `lastEditedAt`, `archive`.<br>---<br>Optional<br>Possible values: `"type"`, `"name"`, `"description"`, `"lastEditedBy"`, `"lastEditedAt"`, `"archive"`                             |
| <a id="data-picker-entity-types"></a> `data-picker-entity-types`     | `string`[]           | An array of entity types to show in the question's data picker: `model`, `table`.<br>---<br>Optional<br>Possible values: `"model"`, `"table"`                                                                                                                                            |
| <a id="enable-entity-navigation"></a> `enable-entity-navigation`     | `boolean`            | Whether to enable internal entity navigation (links to dashboards/questions).<br>---<br>Optional<br>Default: `false`                                                                                                                                                                     |
| <a id="initial-collection"></a> `initial-collection`                 | `string` \| `number` | Which collection to start from. Values: regular ID, entity ID, `"root"` for the top-level "Our Analytics" collection, `"personal"` for the viewer's personal collection, or `"tenant"` for the viewer's tenant collection. People who aren't tenant members get an error for `"tenant"`. |
| <a id="read-only"></a> `read-only`                                   | `boolean`            | Whether the content manager is in read-only mode. When `true`, people can interact with items (filter, summarize, drill-through) but can't save. When `false`, they can create and edit items.<br>---<br>Optional<br>Default: `true`                                                     |
| <a id="with-new-dashboard"></a> `with-new-dashboard`                 | `boolean`            | Whether to show the "New dashboard" button. Only applies when `read-only` is `false`.<br>---<br>Optional<br>Default: `true`                                                                                                                                                              |
| <a id="with-new-question"></a> `with-new-question`                   | `boolean`            | Whether to show the "New question" button.<br>---<br>Optional<br>Default: `true`                                                                                                                                                                                                         |

<!-- [<endsnippet properties>] -->
