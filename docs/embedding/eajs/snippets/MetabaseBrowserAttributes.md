Attributes for the `<metabase-browser>` web component.

Embeds a collection browser so people can navigate collections and open
dashboards or questions. Only available for authenticated (SSO) modular embeds.

## Remarks

<!-- [<snippet remarks>] -->

Pro/Enterprise

<!-- [<endsnippet remarks>] -->

## Properties

<!-- [<snippet properties>] -->

| Property                                                              | Type                                                                                                   | Default value | Description                                                                                                                                                                                    |
| :-------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="collection-entity-types"></a> `collection-entity-types?`       | (`"model"` \| `"collection"` \| `"dashboard"` \| `"question"`)[]                                       | `undefined`   | An array of entity types to show in the collection browser: `collection`, `dashboard`, `question`, `model`.                                                                                    |
| <a id="collection-page-size"></a> `collection-page-size?`             | `number`                                                                                               | `undefined`   | How many items to show per page in the collection browser.                                                                                                                                     |
| <a id="collection-visible-columns"></a> `collection-visible-columns?` | ( \| `"type"` \| `"name"` \| `"description"` \| `"lastEditedBy"` \| `"lastEditedAt"` \| `"archive"`)[] | `undefined`   | An array of columns to show in the collection browser: `type`, `name`, `description`, `lastEditedBy`, `lastEditedAt`, `archive`.                                                               |
| <a id="data-picker-entity-types"></a> `data-picker-entity-types?`     | (`"model"` \| `"table"`)[]                                                                             | `undefined`   | An array of entity types to show in the question's data picker: `model`, `table`.                                                                                                              |
| <a id="enable-entity-navigation"></a> `enable-entity-navigation?`     | `boolean`                                                                                              | `false`       | Whether to enable internal entity navigation (links to dashboards/questions).                                                                                                                  |
| <a id="initial-collection"></a> `initial-collection`                  | `string` \| `number`                                                                                   | `undefined`   | Which collection to start from. Use a collection ID (e.g., `14`) to start in a specific collection, or `"root"` for the top-level "Our Analytics" collection.                                  |
| <a id="read-only"></a> `read-only?`                                   | `boolean`                                                                                              | `true`        | Whether the content manager is in read-only mode. When `true`, people can interact with items (filter, summarize, drill-through) but can't save. When `false`, they can create and edit items. |
| <a id="with-new-dashboard"></a> `with-new-dashboard?`                 | `boolean`                                                                                              | `true`        | Whether to show the "New dashboard" button. Only applies when `read-only` is `false`.                                                                                                          |
| <a id="with-new-question"></a> `with-new-question?`                   | `boolean`                                                                                              | `true`        | Whether to show the "New exploration" button.                                                                                                                                                  |

<!-- [<endsnippet properties>] -->
