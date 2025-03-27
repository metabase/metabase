#### Properties

| Property                                                               | Type                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| <a id="autoapplyfilters"></a> `autoApplyFilters`                       | { `toastDashboardId`: `null` \| `number`; `toastId`: `null` \| `number`; }                             |
| `autoApplyFilters.toastDashboardId`                                    | `null` \| `number`                                                                                     |
| `autoApplyFilters.toastId`                                             | `null` \| `number`                                                                                     |
| <a id="dashboardid"></a> `dashboardId`                                 | `null` \| [`DashboardId`](./api_html/DashboardId.md)                                                   |
| <a id="dashboards"></a> `dashboards`                                   | `Record`<[`DashboardId`](./api_html/DashboardId.md), [`StoreDashboard`](./api_html/StoreDashboard.md)> |
| <a id="dashcarddata"></a> `dashcardData`                               | [`DashCardDataMap`](./api_html/DashCardDataMap.md)                                                     |
| <a id="dashcards"></a> `dashcards`                                     | `Record`<`number`, [`StoreDashcard`](./api_html/StoreDashcard.md)>                                     |
| <a id="draftparametervalues"></a> `draftParameterValues`               | `Record`<`string`, `null` \| [`ParameterValueOrArray`](./api_html/ParameterValueOrArray.md)>           |
| <a id="editingdashboard"></a> `editingDashboard`                       | `null` \| [`MetabaseDashboard`](./api_html/../MetabaseDashboard.md)                                    |
| <a id="isaddparameterpopoveropen"></a> `isAddParameterPopoverOpen`     | `boolean`                                                                                              |
| <a id="isnavigatingbacktodashboard"></a> `isNavigatingBackToDashboard` | `boolean`                                                                                              |
| <a id="loadingcontrols"></a> `loadingControls`                         | [`DashboardLoadingControls`](./api_html/DashboardLoadingControls.md)                                   |
| <a id="loadingdashcards"></a> `loadingDashCards`                       | [`DashboardCardsLoadingState`](./api_html/DashboardCardsLoadingState.md)                               |
| <a id="missingactionparameters"></a> `missingActionParameters`         | `unknown`                                                                                              |
| <a id="parametervalues"></a> `parameterValues`                         | `Record`<`string`, [`ParameterValueOrArray`](./api_html/ParameterValueOrArray.md)>                     |
| <a id="selectedtabid"></a> `selectedTabId`                             | [`SelectedTabId`](./api_html/SelectedTabId.md)                                                         |
| <a id="sidebar"></a> `sidebar`                                         | [`DashboardSidebarState`](./api_html/DashboardSidebarState.md)                                         |
| <a id="slowcards"></a> `slowCards`                                     | `Record`<`number`, `boolean`>                                                                          |
| <a id="tabdeletions"></a> `tabDeletions`                               | `Record`<`number`, [`TabDeletion`](./api_html/TabDeletion.md)>                                         |
| <a id="theme"></a> `theme`                                             | [`DisplayTheme`](./api_html/DisplayTheme.md)                                                           |
