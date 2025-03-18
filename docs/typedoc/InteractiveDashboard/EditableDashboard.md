## EditableDashboardProps

### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="classname"></a> `className?` | `string` | A custom class name to be added to the root element. |
| <a id="dashboardid"></a> `dashboardId` | [`DashboardId`](../internal.md#dashboardid-4) | The ID of the dashboard. This is either: <br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1` <br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| <a id="drillthroughquestionheight"></a> `drillThroughQuestionHeight?` | `number` | Height of a question component when drilled from the dashboard to a question level. |
| <a id="initialparameters"></a> `initialParameters?` | `DefaultQuery`\<`string`\> | Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options. |
| <a id="onload"></a> `onLoad?` | (`dashboard`: `null` \| [`Dashboard`](../internal.md#dashboard-1)) => `void` | Callback that is called when the dashboard is loaded. |
| <a id="onloadwithoutcards"></a> `onLoadWithoutCards?` | (`dashboard`: `null` \| [`Dashboard`](../internal.md#dashboard-1)) => `void` | Callback that is called when the dashboard is loaded without cards. |
| <a id="plugins"></a> `plugins?` | [`MetabasePluginsConfig`](../internal.md#metabasepluginsconfig) | Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details. |
| <a id="style"></a> `style?` | `CSSProperties` | A custom style object to be added to the root element. |
| <a id="withcardtitle"></a> `withCardTitle?` | `boolean` | Whether the dashboard cards should display a title. |
| <a id="withdownloads"></a> `withDownloads?` | `boolean` | Whether to hide the download button. |
| <a id="withfooter"></a> `withFooter?` | `boolean` | Whether to display the footer. |
