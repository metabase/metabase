## Properties

| Property                                                               | Type                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| <a id="autoapplyfilters"></a> `autoApplyFilters`                       | \{ `toastDashboardId`: `null` \| `number`; `toastId`: `null` \| `number`; \}        |
| `autoApplyFilters.toastDashboardId`                                    | `null` \| `number`                                                                  |
| `autoApplyFilters.toastId`                                             | `null` \| `number`                                                                  |
| <a id="dashboardid"></a> `dashboardId`                                 | `null` \| [`DashboardId`](DashboardId.md)                                           |
| <a id="dashboards"></a> `dashboards`                                   | `Record`\<[`DashboardId`](DashboardId.md), [`StoreDashboard`](StoreDashboard.md)\>  |
| <a id="dashcarddata"></a> `dashcardData`                               | [`DashCardDataMap`](DashCardDataMap.md)                                             |
| <a id="dashcards"></a> `dashcards`                                     | `Record`\<`number`, [`StoreDashcard`](StoreDashcard.md)\>                           |
| <a id="draftparametervalues"></a> `draftParameterValues`               | `Record`\<`string`, `null` \| [`ParameterValueOrArray`](ParameterValueOrArray.md)\> |
| <a id="editingdashboard"></a> `editingDashboard`                       | `null` \| [`MetabaseDashboard`](../MetabaseDashboard.md)                            |
| <a id="isaddparameterpopoveropen"></a> `isAddParameterPopoverOpen`     | `boolean`                                                                           |
| <a id="isnavigatingbacktodashboard"></a> `isNavigatingBackToDashboard` | `boolean`                                                                           |
| <a id="loadingcontrols"></a> `loadingControls`                         | [`DashboardLoadingControls`](DashboardLoadingControls.md)                           |
| <a id="loadingdashcards"></a> `loadingDashCards`                       | [`DashboardCardsLoadingState`](DashboardCardsLoadingState.md)                       |
| <a id="missingactionparameters"></a> `missingActionParameters`         | `unknown`                                                                           |
| <a id="parametervalues"></a> `parameterValues`                         | `Record`\<`string`, [`ParameterValueOrArray`](ParameterValueOrArray.md)\>           |
| <a id="selectedtabid"></a> `selectedTabId`                             | [`SelectedTabId`](SelectedTabId.md)                                                 |
| <a id="sidebar"></a> `sidebar`                                         | [`DashboardSidebarState`](DashboardSidebarState.md)                                 |
| <a id="slowcards"></a> `slowCards`                                     | `Record`\<`number`, `boolean`\>                                                     |
| <a id="tabdeletions"></a> `tabDeletions`                               | `Record`\<`number`, [`TabDeletion`](TabDeletion.md)\>                               |
| <a id="theme"></a> `theme`                                             | [`DisplayTheme`](DisplayTheme.md)                                                   |
