# Helper index (generated — do not edit; run scripts/build-helper-index.mjs)

## actions-on-dashboards.ts
- `queryWritableDB` — Port of H.queryWritableDB(sql, type) — the Cypress version runs through
- `resetTestTable` — Port of H.resetTestTable({ type, table }) (cy.task("resetTable") →
- `MANY_DATA_TYPES_ROWS` — Port of many_data_types_rows (e2e/support/test_tables_data.js). */
- `createModelFromTableName` — Port of H.createModelFromTableName (e2e-qa-databases-helpers.js) — unlike
- `createAction` — Port of H.createAction (e2e-action-helpers.js). */
- `createImplicitAction` — Port of H.createImplicitAction (e2e-action-helpers.js). */
- `getActionCardDetails` — Port of H.getActionCardDetails (e2e-dashboard-helpers.ts) — the shared
- `addWidgetStringFilter` — Port of addWidgetStringFilter (native-filters/helpers/e2e-field-filter-helpers.js):
- `moveDnDKitListElement` — Port of H.moveDnDKitListElement(dataTestId, { startIndex, dropIndex }):
- `aside` — The click-behavior sidebar. Cypress used a bare cy.get("aside"). */

## admin-extras.ts
- `seedSecurityAdvisories` — Nuke all existing security advisories and insert the provided ones. */
- `deleteToken` — Port of H.deleteToken (e2e-token-helpers.ts). */
- `mockSessionProperty` — Port of H.mockSessionProperty: fetch the real /api/session/properties
- `configureSmtpSettings` — Stand-in for H.setupSMTP: the Cypress helper PUTs /api/email, which
- `pressDownloadDiagnosticsShortcut` — The "Download diagnostics" shortcut is tinykeys "$mod+f1"
- `downloadDiagnosticInfo` — Port of the error-reporting spec's getDiagnosticInfoFile: click Download in

## admin.ts
- `getSamlCertificate` — Port of getSamlCertificate() from e2e/test/scenarios/admin-2/sso/shared/helpers.js. */
- `setupSaml` — Port of setupSaml() from e2e/test/scenarios/admin-2/sso/shared/helpers.js. */
- `isOssBackend` — Whether the backend is an OSS build (version tags are v0.x for OSS, v1.x

## api.ts
- `MetabaseApi` — HTTP client mirroring cy.request semantics: requests run as the currently
- `resolveToken`

## binning.ts
- `chartPathWithFillColor` — Port of H.chartPathWithFillColor. */
- `openTable` — Port of H.openTable: open a table as an ad-hoc question in simple or
- `getDimensionByName` — Port of getDimensionByName: dimension rows filtered by (optionally)
- `getBinningButtonForDimension` — Port of H.getBinningButtonForDimension: the binning button only renders on
- `changeBinningForDimension` — Port of H.changeBinningForDimension: open the dimension's binning popover

## bookmarks-extras.ts
- `openCollectionItemMenu` — Port of H.openCollectionItemMenu: `.findAllByText(item).eq(index)` — the

## charts-extras.ts
- `openVizTypeSidebar` — Port of H.openVizTypeSidebar. */
- `getDraggableElements` — Port of H.getDraggableElements: findAllByTestId(/draggable-item/). */
- `visitNativeQuestionAdhoc` — Native-autorun branch of H.visitQuestionAdhoc: ad-hoc native queries

## charts.ts
- `openVizSettingsSidebar`
- `leftSidebar`
- `tooltip`
- `echartsContainer`
- `trendLine`

## click-behavior.ts
- `COUNT_COLUMN_ID`
- `COUNT_COLUMN_NAME`
- `COUNT_COLUMN_SOURCE`
- `CREATED_AT_COLUMN_ID`
- `CREATED_AT_COLUMN_NAME`
- `CREATED_AT_COLUMN_SOURCE`
- `FILTER_VALUE`
- `POINT_COUNT`
- `POINT_CREATED_AT`
- `POINT_CREATED_AT_FORMATTED`
- `POINT_INDEX`
- `RESTRICTED_COLLECTION_NAME`
- `COLUMN_INDEX`
- `FIRST_TAB`
- `SECOND_TAB`
- `THIRD_TAB`
- `TARGET_DASHBOARD`
- `QUESTION_LINE_CHART`
- `QUESTION_TABLE`
- `OBJECT_DETAIL_CHART`
- `TARGET_QUESTION`
- `DASHBOARD_FILTER_TEXT` — The Cypress spec builds these with createMockActionParameter, which only
- `DASHBOARD_FILTER_TIME`
- `DASHBOARD_FILTER_NUMBER`
- `DASHBOARD_FILTER_TEXT_WITH_DEFAULT`
- `LINK_URL`
- `URL_WITH_PARAMS`
- `URL_WITH_FILLED_PARAMS`
- `URL_WITH_FILLED_PARAMS_ACTUAL` — `URL_WITH_FILLED_PARAMS` interpolates `FILTER_VALUE` ("123"), but neither
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
- `USER_GROUPS` — Mirrors USER_GROUPS in e2e/support/cypress_data.js (fixed ids baked into
- `aside` — The click-behavior sidebar. Cypress used bare cy.get("aside"); the only
- `dashboardParametersPopover` — Port of H.dashboardParametersPopover ({ testId: "parameter-value-dropdown" }). */
- `caseSensitive` — Case-sensitive substring matcher (Cypress cy.contains semantics). */
- `filterWidgetWithLabel` — Port of the Cypress `findAllByTestId("parameter-widget").contains(label)
- `expectFilterWidgets` — Port of the repeated `cy.findAllByTestId("parameter-widget")
- `expectLocation` — Port of the retried `cy.location().should(...)` pathname/search checks —
- `clickLineChartPoint` — constructs: post-ECharts there is no voronoi layer and no `circle.dot`, so
- `assertDrillThroughMenuOpen`
- `addDashboardDestination`
- `addUrlDestination`
- `addSavedQuestionDestination`
- `addSavedQuestionCreatedAtParameter`
- `addSavedQuestionQuantityParameter`
- `addTextParameter`
- `addTextWithDefaultParameter`
- `addTimeParameter`
- `addNumericParameter`
- `customizeLinkText` — Port of the spec's customizeLinkText (the aside's only textbox). */
- `getClickMapping` — Port of getClickMapping: exact-text matches inside unset-click-mappings. */
- `verifyAvailableClickTargetColumns`
- `getCreatedAtToQuestionMapping`
- `getCountToDashboardMapping`
- `getCreatedAtToUrlMapping`
- `getCountToDashboardFilterMapping`
- `getTableCell` — Port of the spec's getTableCell: POINT_INDEX-th row, index-th cell. */
- `testChangingBackToDefaultBehavior`
- `verifyVizTypeIsLine`
- `createTextFilterMapping`
- `createTextFilterWithDefaultMapping`
- `createTimeFilterMapping`
- `createNumberFilterMapping`
- `createMockDashboardCard`
- `getTextCardDetails`
- `getHeadingCardDetails`
- `getActionCardDetails`
- `getLinkCardDetails`
- `updateDashboardCards` — Port of H.updateDashboardCards: replaces all the dashboard's cards with
- `updateCollectionGraph` — Port of cy.updateCollectionGraph: GET the graph, merge, PUT it back. */
- `createQuestion` — Port of H.createQuestion for arbitrary details (collection_id,
- `createQuestionAndDashboard` — Port of H.createQuestionAndDashboard — unlike the spike's
- `createDashboard` — Port of H.createDashboard (e2e/support/helpers/api/createDashboard.ts).
- `createDashboardWithTabsLocal` — Port of the spec's createDashboardWithTabsLocal (also covers the one
- `tabSlugMap` — Build the `${tabId}-${tabName}` slug map keyed by tab name. */
- `captureNextAnchorClick` — Port of H.onNextAnchorClick: the frontend opens external URLs by creating
- `expectCapturedAnchor`
- `verifyNotebookQuery`
- `createMultiStageQuery`

## collections-core.ts
- `FIRST_COLLECTION_ENTITY_ID` — Port of FIRST_COLLECTION_ENTITY_ID (cypress_sample_instance_data.js). */
- `ALL_USERS_GROUP_ID` — Port of ALL_USERS_GROUP_ID (cypress_sample_instance_data.js). */
- `DATA_GROUP` — Mirrors USER_GROUPS.DATA_GROUP (e2e/support/cypress_data.js). */
- `displaySidebarChildOf` — Port of displaySidebarChildOf (e2e-collections-sidebar.js): click the
- `openCollectionMenu` — Port of H.openCollectionMenu: the collection-menu ellipsis. */
- `moveOpenedCollectionTo` — Port of H.moveOpenedCollectionTo: open the collection menu, pick Move, wait
- `closeNavigationSidebar` — Port of H.closeNavigationSidebar. */
- `waitForCollectionItems` — Cypress alias for the collection-items GET (any collection id) — resolve
- `openEllipsisMenuFor` — Port of the spec-local openEllipsisMenuFor: the row ellipsis is hover-gated,
- `getRowCheckbox` — Port of the spec-local getRowCheckbox. */
- `selectItemUsingCheckbox` — Port of the spec-local selectItemUsingCheckbox (click the enclosing button). */
- `assertSelectAllIsIndeterminate` — Port of the spec-local assertSelectAllIsIndeterminate. */
- `ensureCollectionHasNoChildren` — Port of the spec-local ensureCollectionHasNoChildren: the chevron exists but
- `ensureCollectionIsExpanded` — Port of the spec-local ensureCollectionIsExpanded. */
- `findPickerItem` — Port of the spec-local findPickerItem: the anchor (which carries the
- `moveItemToCollection` — Port of the spec-local moveItemToCollection. */
- `archiveAll` — Port of the spec-local archiveAll (archive every non-collection root item). */
- `toggleSortingFor` — Port of the spec-local toggleSortingFor. */
- `assertCollectionItemsOrder` — Port of the spec-local assertCollectionItemsOrder. */

## collections-trash.ts
- `archiveCollection` — Port of H.archiveCollection (api/archiveCollection.ts). */
- `archiveQuestion` — Port of H.archiveQuestion (api/archiveQuestion.ts). */
- `archiveDashboard` — Port of H.archiveDashboard (api/archiveDashboard.ts). */
- `createCollection` — Port of the spec-local createCollection(collectionInfo, archive): create the
- `createQuestion` — Port of the spec-local createQuestion(questionInfo, archive) (MBQL query). */
- `createNativeQuestion` — Port of the spec-local createNativeQuestion(questionInfo, archive). */
- `createDashboard` — Port of the spec-local createDashboard(dashboardInfo, archive). */
- `toggleEllipsisMenuFor` — Port of the spec-local toggleEllipsisMenuFor: the row-level ellipsis in the
- `archiveBanner` — Port of the spec-local archiveBanner. */
- `ensureCanRestoreFromPage` — Port of the spec-local ensureCanRestoreFromPage: from an archived entity's
- `selectItem` — Port of the spec-local selectItem: click the checkbox's enclosing button in
- `assertChecked` — Port of the spec-local assertChecked. */
- `assertTrashSelectedInNavigationSidebar` — Port of the spec-local assertTrashSelectedInNavigationSidebar: the Trash
- `ensureBookmarkVisible` — Port of the spec-local ensureBookmarkVisible. */
- `selectSidebarItem` — Port of H.selectSidebarItem (e2e-permissions-helpers.js):
- `visitRootCollection` — Port of visitRootCollection (cy.visit("/collection/root")). */

## collections.ts
- `getPinnedSection` — Port of H.getPinnedSection. */
- `getUnpinnedSection` — Port of H.getUnpinnedSection. */
- `openPinnedItemMenu` — Port of H.openPinnedItemMenu: hover the pinned card, then open Actions. */
- `openUnpinnedItemMenu` — Port of H.openUnpinnedItemMenu: the row ellipsis is hover-gated. */
- `waitForPinnedItems` — Cypress intercept `GET /api/(**)/items?pinned_state*` — the collection
- `waitForCardQuery` — Cypress intercept `POST /api/card/(**)/query` — a pinned card's query run.
- `dragAndDrop` — Port of H.dragAndDrop (e2e-dragndrop-helpers.js): fires the HTML5 drag

## column-compare.ts
- `toggleColumnPickerItems`
- `verifyNoColumnCompareShortcut`
- `verifySummarizeText`
- `verifyColumnDrillText`
- `verifyPlusButtonText`
- `verifyNotebookText`
- `verifyAggregations`
- `verifyColumns`
- `breakout`
- `verifyBreakoutExistsAndIsFirst`

## command-palette.ts
- `ORDERS_BY_YEAR_QUESTION_ID` — Ports of ORDERS_BY_YEAR_QUESTION_ID from
- `commandPalette` — Port of H.commandPalette. Accepts a FrameLocator for embedding tests. */
- `commandPaletteInput` — Port of H.commandPaletteInput (findByPlaceholderText is exact). */
- `commandPaletteButton` — Port of H.commandPaletteButton. */
- `commandPaletteAction` — Port of H.commandPaletteAction (findByRole name strings are exact). */
- `openCommandPalette` — Port of H.openCommandPalette — upstream types both {ctrl+k} and {cmd+k}
- `closeCommandPalette` — Port of H.closeCommandPalette. */
- `openShortcutModal` — Port of H.openShortcutModal (cy.type "{shift+?}"). The tinykeys binding is
- `shortcutModal` — Port of H.shortcutModal. */
- `pressShortcut` — took effect, re-pressing if the keystroke was dropped.
- `getProfileLink` — Port of H.getProfileLink. */
- `getHelpSubmenu` — Port of H.getHelpSubmenu. */
- `goToAdmin` — Port of H.goToAdmin. */
- `startNewCollectionFromSidebar` — Port of H.startNewCollectionFromSidebar. */
- `startNewAction` — Port of H.startNewAction (e2e-action-helpers.js). */
- `setActionsEnabledForDB` — Port of H.setActionsEnabledForDB. */
- `createDashboardWithTabs` — Port of H.createDashboardWithTabs (e2e/support/helpers/api): create the
- `mockDashboardCard` — Local stand-in for createMockDashboardCard (metabase-types/api/mocks):
- `createDocument` — Local stand-in for createMockDocument + cy.request("POST", "/api/document"):
- `modifyPermission` — Port of H.modifyPermission (e2e-permissions-helpers.js): click the
- `saveChangesToPermissions` — Port of H.saveChangesToPermissions. */

## custom-column-3.ts
- `focusCustomExpressionEditor` — Port of H.CustomExpressionEditor.focus(): click the editor, confirm
- `clearCustomExpressionEditor` — Port of H.CustomExpressionEditor.clear(): focus, select all, backspace. */
- `customExpressionEditorType` — Port of H.CustomExpressionEditor.type(): real keystrokes with the small set
- `expectCustomExpressionValue` — Port of H.CustomExpressionEditor.value().should("eq"/"equal", expected):
- `customExpressionCompletions` — Port of H.CustomExpressionEditor.completions(). */
- `customExpressionCompletion` — Port of H.CustomExpressionEditor.completion(name):
- `functionBrowser` — Port of H.CustomExpressionEditor.functionBrowser(). */
- `customExpressionName` — Port of H.CustomExpressionEditor.nameInput(). */
- `formatExpression` — Port of H.CustomExpressionEditor.format(): click the Auto-format button. */
- `setModelMetadata` — Port of H.setModelMetadata (e2e-models-metadata-helpers.js). */
- `summarizeInStep` — Port of H.summarize({ mode: "notebook" }) scoped to a notebook step. */
- `filterInStep` — Port of H.filter({ mode: "notebook" }) scoped to a notebook step. */
- `addCustomColumnInStep` — Port of H.addCustomColumn scoped to a notebook step. */
- `joinInStep` — Port of H.join() scoped to a notebook step. */
- `sortInStep` — Port of H.sort() scoped to a notebook step. */
- `assertLastColumnData` — Port of the spec-local assertTableData({ title, value }) used by the path
- `scrollTableRight` — Port of H.tableInteractiveScrollContainer().scrollTo("right"). */

## custom-column.ts
- `customExpressionEditor` — Port of H.CustomExpressionEditor.value()'s target: the CodeMirror content
- `openTableNotebookWithLimit` — Port of H.openTable({ mode: "notebook", limit, table }). */

## dashboard-card-repros.ts
- `pieSlices` — Port of H.pieSlices (e2e-visual-tests-helpers.js): the pie/donut wedge paths
- `assertIsEllipsified` — Port of H.assertIsEllipsified (kept local so both live together). */
- `assertIsNotEllipsified` — Port of H.assertIsNotEllipsified. */
- `assertDescendantsNotOverflowDashcards` — Port of the spec-local assertDescendantsNotOverflowDashcards +
- `grantClipboardPermissions` — Port of H.grantClipboardPermissions: the Cypress helper drives CDP
- `readClipboard` — Port of H.readClipboard: read the async-clipboard text in the page. */
- `toggleFilterWidgetValues` — Port of H.toggleFilterWidgetValues (e2e-ui-elements-helpers.js): open the
- `showDashcardVisualizerModalSettings` — Port of H.showDashcardVisualizerModalSettings
- `saveDashcardVisualizerModal` — Port of H.saveDashcardVisualizerModal: click Save/Add-to-dashboard and wait
- `createQuestionAndAddToDashboard` — Port of H.createQuestionAndAddToDashboard (api/createQuestionAndAddToDashboard.ts):

## dashboard-cards.ts
- `showDashboardCardActions` — Port of H.showDashboardCardActions (realHover → native hover). */
- `getDashboardCardMenu` — Port of H.getDashboardCardMenu — waits for the card to finish loading. */
- `inputWithValue` — Port of cy.findByDisplayValue: find the input in `scope` whose current
- `moveDnDKitElement` — Port of H.moveDnDKitElementByAlias — but with real mouse input instead of
- `moveDnDKitElementOnto` — Deterministic dnd-kit sortable move: drag `element` so its center lands

## dashboard-core.ts
- `ORDERS_DASHBOARD_ENTITY_ID`
- `ORDERS_DASHBOARD_DASHCARD_ID`
- `GRID_WIDTH` — metabase/utils/dashboard_grid GRID_WIDTH — the repo import is outside
- `cachedUserName` — The harness signIn is typed to the USERS credential map, but its login
- `updateDashboardCards` — Port of H.updateDashboardCards: replaces all the cards on a dashboard
- `createCollection` — Port of H.createCollection (api/createCollection.ts), the subset used here. */
- `createDashboardWithTabs` — Port of H.createDashboardWithTabs. The command-palette.ts port of the same
- `createDashboardWithCards` — Port of H.createDashboard({ name, dashcards }) (api/createDashboard.ts):
- `getTextCardDetails` — Port of H.getTextCardDetails. */
- `mockVirtualCard` — Local stand-in for createMockVirtualCard (metabase-types/api/mocks). */
- `mockVirtualDashCard` — Local stand-in for createMockVirtualDashCard: only the fields the
- `getDashboardCards` — Port of H.getDashboardCards. */
- `removeDashboardCard` — Port of H.removeDashboardCard (realHover → native hover). */
- `addIFrameWhileEditing` — Port of H.addIFrameWhileEditing. */
- `editIFrameWhileEditing` — Port of H.editIFrameWhileEditing ({selectall} + type → fill). */
- `validateIFrame` — Port of the spec-local validateIFrame. The Cypress original chains
- `createNewTab`
- `deleteTab`
- `duplicateTab`
- `renameTab`
- `assertDashboardFixedWidth`
- `assertDashboardFullWidth`
- `mapPinIcon` — Port of H.mapPinIcon. */
- `dashboardParametersPopover` — Port of H.dashboardParametersPopover. */
- `openProductsTable` — Port of H.openProductsTable (default simple mode, no limit). */
- `dragOnXAxis` — Port of the spec-local dragOnXAxis (mousedown → mousemove(clientX) →
- `assertScrollBarExists` — Port of the spec-local assertScrollBarExists. */
- `checkOptionsForFilter` — Port of the spec-local checkOptionsForFilter. */
- `countDashboardUpdates` — Port of the cy.spy() intercept pattern: counts PUT /api/dashboard/:id

## dashboard-filters-auto-wiring.ts
- `createDashboardWithCards` — Port of the spec-local createDashboardWithCards: create a dashboard, then
- `addCardToDashboard` — Port of the spec-local addCardToDashboard: open the questions sidebar and
- `goToFilterMapping` — Port of the spec-local goToFilterMapping: click a filter's editing widget to
- `removeFilterFromDashboard` — Port of the spec-local removeFilterFromDashboard. */
- `removeFilterFromDashCard` — Port of the spec-local removeFilterFromDashCard (the close icon on a card). */
- `getTableCell` — Port of the spec-local getTableCell: find the column index by header text,
- `addQuestionFromQueryBuilder` — Port of the spec-local addQuestionFromQueryBuilder: from the QB, add a

## dashboard-filters-reset-clear.ts
- `NO_DEFAULT_NON_REQUIRED`
- `DEFAULT_NON_REQUIRED`
- `DEFAULT_REQUIRED`
- `typeCypress` — Interpret the Cypress key sequences this spec's callbacks type into
- `fieldValuesTextbox` — Port of H.fieldValuesTextbox: cy.findByRole("textbox"). */
- `filter` — Port of the spec-local filter(label): cy.findByLabelText(label) (exact). */
- `editFilter` — Port of the spec-local editFilter(label). */
- `clearButton` — Port of the spec-local clearButton(label). */
- `resetButton` — Port of the spec-local resetButton(label). */
- `checkStatusIcon` — Port of the spec-local checkStatusIcon: exactly one of the three status
- `checkResetAllFiltersShown` — Port of the spec-local checkResetAllFiltersShown. */
- `checkResetAllFiltersHidden` — Port of the spec-local checkResetAllFiltersHidden. */
- `resetAllFilters` — Click the dashboard menu's "Reset all filters" item. */
- `addDateFilter` — Port of the spec-local addDateFilter. */
- `updateDateFilter` — Port of the spec-local updateDateFilter. */
- `addRangeFilter` — Port of the spec-local addRangeFilter. */
- `updateRangeFilter` — Port of the spec-local updateRangeFilter. */
- `listItemContaining` — Case-sensitive substring listitem matcher (cy.contains semantics). */
- `createDashboardWithParameters` — Port of the spec-local createDashboardWithParameters. */
- `createDashboardWithParameterInEachTab` — Port of the spec-local createDashboardWithParameterInEachTab. */
- `checkDashboardParameters` — Port of the spec-local checkDashboardParameters. */
- `checkParameterSidebarDefaultValue` — Port of the spec-local checkParameterSidebarDefaultValue. */
- `checkResetAllFiltersWorksAcrossTabs` — Port of the spec-local checkResetAllFiltersWorksAcrossTabs. */
- `checkResetAllFiltersToDefaultWorksAcrossTabs` — Port of the spec-local checkResetAllFiltersToDefaultWorksAcrossTabs. */

## dashboard-management.ts
- `USER_NAMES` — First/last names from e2e/support/cypress_data.js — that file is untyped
- `createNativeQuestion` — Port of H.createNativeQuestion (api/createNativeQuestion.ts). */
- `createNativeQuestionAndDashboard` — Port of H.createNativeQuestionAndDashboard (no tabs/cardDetails needed here). */
- `createDashboardQuestion` — Port of H.createQuestion({ ..., dashboard_id }) — a "dashboard question"
- `addOrUpdateDashboardCard` — Port of H.addOrUpdateDashboardCard. Like the original, the PUT replaces
- `openDashboardInfoSidebar` — Port of H.openDashboardInfoSidebar. */
- `closeDashboardInfoSidebar` — Port of H.closeDashboardInfoSidebar. */
- `addTextBox` — Port of H.addTextBox (enters edit mode, adds a text card, types into it). */
- `collectionEntry` — Port of cy.findAllByTestId("collection-entry-name").should("contain", name):
- `waitForDashboardGet`
- `waitForDashboardUpdate`
- `waitForDashboardCopy`
- `assertOnRequest` — Port of the spec's assertOnRequest(alias): the waitFor* promise must be

## dashboard-parameters.ts
- `mockParameter` — Port of createMockParameter (metabase-types/api/mocks/parameters.ts). */
- `mockVirtualCard` — Port of createMockVirtualCard — the UXW-751 test reads its `id`. */
- `mockHeadingDashboardCard` — Port of createMockHeadingDashboardCard. */
- `mockTextDashboardCard` — Port of createMockTextDashboardCard. */
- `mockQuestionDashboardCard` — Port of createMockDashboardCard (question dashcards). The command-palette
- `createDashboard` — Port of H.createDashboard (api/createDashboard.ts): plain details go in
- `createQuestionAndDashboard` — Port of H.createQuestionAndDashboard — unlike api.createQuestionAndDashboard
- `createNativeQuestionAndDashboard` — Port of H.createNativeQuestionAndDashboard, dashboardDetails included. */
- `createDashboardWithQuestions` — Port of H.createDashboardWithQuestions, reduced to the single-question
- `filterWidget` — Port of H.filterWidget({ isEditing, name }). The name filter is Cypress
- `clearFilterWidget` — Port of H.clearFilterWidget (the close icon is hover-gated). */
- `dashboardParametersContainer` — Port of H.dashboardParametersContainer. */
- `editingDashboardParametersContainer` — Port of H.editingDashboardParametersContainer. */
- `dashboardParameterSidebar` — Port of H.dashboardParameterSidebar. */
- `applyFilterButton` — Port of H.applyFilterButton (the auto_apply_filters=false toast). */
- `setDashboardParameterName` — Port of H.setDashboardParameterName. */
- `setDashboardParameterType` — Port of H.setDashboardParameterType (findByText("...").next()). */
- `setDashboardParameterOperator` — Port of H.setDashboardParameterOperator. */
- `setDashCardFilter` — Port of H.setDashCardFilter (the Add a filter button is hover-gated). */
- `selectDashboardFilter` — Port of H.selectDashboardFilter. Unlike the dashboard.ts port this keeps
- `disconnectDashboardFilter` — Port of H.disconnectDashboardFilter. */
- `moveDashboardFilter` — Port of H.moveDashboardFilter — the parameter sidebar must already be
- `addHeadingWhileEditing` — Port of H.addHeadingWhileEditing. */
- `moveDashCardToTab` — Port of H.moveDashCardToTab (hover the card, hover the move icon). */
- `undo` — Port of H.undo (click Undo inside the toast).
- `countRequests` — Port of H.spyRequestFinished / cy.spy() interceptors: counts matching
- `isDashcardQueryRequest` — Matcher for POST /api/dashboard/:id/dashcard/:id/card/:id/query. */
- `waitForDashboardPut` — Register a wait for the dashboard-save PUT so its payload can be read. */
- `expectFilterSelected` — Port of the spec-local isFilterSelected (checkbox state by label). */
- `expectRenderedWithinViewport` — Port of the isRenderedWithinViewport custom command. */

## dashboard-repros.ts
- `ALL_USERS_GROUP`
- `COLLECTION_GROUP`
- `assertTabSelected` — Port of H.assertTabSelected. */
- `openDashboardSettingsSidebar` — Port of H.openDashboardSettingsSidebar. */
- `closeDashboardSettingsSidebar` — Port of H.closeDashboardSettingsSidebar. */
- `closeDashboardInfoSidebarWhenSettled` — closeDashboardInfoSidebar, retried as a unit.
- `clickBehaviorSidebar` — Port of H.clickBehaviorSidebar(dashcardIndex): hover the card, click its
- `countOpaqueElements` — Count the elements a locator matches that are NOT transparent.
- `lastIndexInViewport` — Index of the LAST element a locator matches whose bounding box lies fully
- `updatePermissionsGraph` — Port of cy.updatePermissionsGraph: GET the graph, merge, PUT it back. */
- `sandboxTable` — Port of cy.sandboxTable: look up the table's schema/db, grant the group
- `addParameterMappingToFirstDashcard` — The GET dashboard → PUT dashcards[0].parameter_mappings dance that issues
- `DASHCARD_QUERY_PATH` — POST /api/dashboard/:id/dashcard/:id/card/:id/query. */
- `CARD_QUERY_PATH` — POST /api/card/:id/query. */
- `isDashcardQueryResponse`
- `waitForDashcardQuery` — Register BEFORE the triggering action; await after. */
- `gateResponses` — Hold every matching request until release() is called (the Playwright
- `delayResponses` — Delay every matching request by delayMs (the spec's res.setDelay(n)).

## dashboard-tabs.ts
- `ORDERS_COUNT_QUESTION_ID`
- `ADMIN_PERSONAL_COLLECTION_ID`
- `NORMAL_PERSONAL_COLLECTION_ID`
- `dashboardCards` — Port of H.dashboardCards (cy.get("[data-element-id=dashboard-cards-container]")). */
- `visitDashboardAndCreateTab` — Port of H.visitDashboardAndCreateTab: visit, enter edit mode, add a tab,
- `createNativeQuestionAndDashboardInCollections` — Port of H.createNativeQuestionAndDashboard for the permission test, which
- `addLinkWhileEditing` — Port of H.addLinkWhileEditing. */
- `reorderTabToStart` — Port of the spec's tab-drag (issue #34970). Cypress fires
- `DASHBOARD_DATE_FILTER`
- `DASHBOARD_NUMBER_FILTER`
- `DASHBOARD_TEXT_FILTER`
- `DASHBOARD_LOCATION_FILTER`
- `createTextFilterMapping`
- `createDateFilterMapping`
- `createNumberFilterMapping`
- `assertFiltersVisibility` — as `cy.findByTestId`'s SECOND argument, where testing-library expects an
- `assertFilterValues` — Port of the spec-local assertFilterValues: each filter's slug=value pair

## dashboard.ts
- `dashboardHeader`
- `editBar`
- `sidebar`
- `selectDropdown`
- `getDashboardCard`
- `filterWidget`
- `editDashboard`
- `saveDashboard` — cy.intercept(...).as() + click + cy.wait("@alias") becomes
- `waitForDashcardsToLoad`
- `setFilter`
- `selectDashboardFilter`
- `setFilterListSource`
- `setFilterQuestionSource`
- `pickEntity`

## data-model.ts
- `SAMPLE_DB_SCHEMA_ID` — Mirrors e2e/support/cypress_data.js */
- `areas`
- `getBasePath`
- `checkLocation` — Port of Shared.getCheckLocation — pathname equality, retried. */
- `expectPathnameStartsWith` — Port of the `cy.location("pathname").should(startsWith)` call sites. */
- `visitDataModel` — Port of Shared.visitArea(area) / DataModel.visit / visitDataStudio. */
- `waitForTableUpdate` — PUT /api/table/:id — register before the edit, await after the blur. */
- `waitForFieldUpdate` — PUT /api/field/:id — register before the edit, await after the blur. */
- `DataModel`
- `TablePicker`
- `TableSection`
- `FieldSection`
- `PreviewSection`
- `hovercard` — Port of H.hovercard() (e2e-ui-elements-helpers.js). */
- `verifyAndCloseToast` — Port of Shared.verifyAndCloseToast. */
- `assertTableData` — Scoped port of H.assertTableData — header cells and first body rows of the
- `hoverPreviewHeaderCell` — Open the preview's column-description hovercard. Keeps the upstream
- `verifyTablePreview` — Port of Shared.verifyTablePreview (minus the dataset wait — see header). */
- `verifyObjectDetailPreview` — Port of Shared.verifyObjectDetailPreview. The Cypress version located the
- `replaceValue` — Replace an input's value via real keystrokes (`fill` doesn't mark these
- `verifyAdminTableSectionEmptyState` — Port of the spec's admin table-section empty state check. */
- `verifyFieldSectionEmptyState` — Port of the spec's admin field-section empty state check. */
- `startNewQuestion` — Port of the CURRENT H.startNewQuestion (e2e-ad-hoc-question-helpers.js):
- `resetTestTableMultiSchema` — Port of H.resetTestTable({ type: "postgres", table: "multi_schema" }) —

## data-reference.ts
- `dataStudioNav`
- `visitDataStudio`

## detail-view.ts
- `visitTable` — Port of DetailView.visitTable: navigate and wait for the table
- `visitModel` — Port of DetailView.visitModel: navigate and wait for the card
- `getHeader`
- `getDetails`
- `getDetailsRow` — Port of DetailView.getDetailsRow: asserts the total row count (like the
- `getDetailsRowColumnName`
- `getDetailsRowValue`
- `getRelationships`
- `verifyDetails` — Port of DetailView.verifyDetails. */
- `queryBuilderFiltersPanel` — Port of H.queryBuilderFiltersPanel. */
- `remapDisplayValueToFK` — Port of H.remapDisplayValueToFK: remap a field display value to a foreign

## documents-core.ts
- `READ_ONLY_PERSONAL_COLLECTION_ID`
- `NO_SQL_PERSONAL_COLLECTION_ID`
- `ORDERS_COUNT_BY_PRODUCT_CATEGORY`
- `ACCOUNTS_COUNT_BY_CREATED_AT`
- `PRODUCTS_COUNT_BY_CATEGORY`
- `PRODUCTS_AVERAGE_BY_CATEGORY`
- `PRODUCTS_COUNT_BY_CATEGORY_PIE`
- `PIVOT_TABLE_CARD`
- `STEP_COLUMN_CARD`
- `SCALAR_CARD`
- `createCard` — Port of H.createQuestion / H.createNativeQuestion for the shapes this spec
- `createDocument`
- `visitDocument` — Port of H.visitDocument: navigate and wait for the document fetch (any
- `documentContent`
- `documentSaveButton`
- `documentFormattingMenu`
- `leaveConfirmationModal` — Port of H.leaveConfirmationModal (e2e-ui-elements-helpers.js). */
- `modalContentByTestId` — Mantine spreads a Modal's extra props (data-testid included) onto its ROOT,
- `addToDocument` — Port of H.addToDocument: cy.realType into the focused editor. "\n" presses
- `clearDocumentContent` — Port of H.clearDocumentContent: select-all + backspace in the editor. */
- `documentMentionDialog`
- `commandSuggestionDialog`
- `documentMetabotDialog`
- `commandSuggestionItem` — Port of H.commandSuggestionItem (findByRole name strings are exact). */
- `documentMetabotSuggestionItem` — Port of H.documentMetabotSuggestionItem. */
- `getDocumentCard` — Port of H.getDocumentCard: the embed whose title's innerText === name
- `getDocumentCardResizeContainer` — Port of H.getDocumentCardResizeContainer (`.closest('[data-type="resizeNode"]')`). */
- `getFlexContainerForCard` — Port of H.getFlexContainerForCard (`.closest('[data-type="flexContainer"]')`). */
- `getResizeHandlesForFlexContainer` — Port of H.getResizeHandlesForFlexContianer [sic]. */
- `getDragHandleForDocumentResizeNode` — Port of H.getDragHandleForDocumentResizeNode. */
- `documentCardVizType` — Port of H.assertDocumentCardVizType (upstream `.find()` = existence). */
- `getDocumentSidebar`
- `openDocumentCardMenu` — Port of H.openDocumentCardMenu. */
- `documentDoDrag` — Port of H.documentDoDrag: press at the handle's top-left corner (like the
- `removeSummaryGroupingField` — Port of H.removeSummaryGroupingField: the close icon inside the breakout
- `addPostgresDatabase`
- `waitForCardQuery` — Register a wait for the next POST /api/card/:id/query response. */
- `waitForCardQueries` — Register a wait for `count` POST /api/card/:id/query responses (the flex
- `contentBoxWidth` — jQuery-style .width(): content-box width. The upstream chart/container
- `expectInViewport` — Cypress `should("not.be.visible")` on a scrolled-away block means "clipped

## documents.ts
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (e2e/support/cypress_sample_instance_data). */
- `apiForCachedUser` — An API client running as a snapshot user with a cached session (the users
- `createDocument` — Port of H.createDocument (api/createDocument.ts). */
- `createComment` — Port of H.createComment (api/createComment.ts). Note: like the Cypress
- `createNodeComment` — Convenience shared by the spec: a one-paragraph text comment on a node. */
- `updateComment` — Port of H.updateComment (api/updateComment.ts). */
- `deleteComment` — Port of H.deleteComment (api/deleteComment.ts). */
- `createReaction` — Port of H.createReaction (api/createReaction.ts). */
- `visitDocument` — Port of H.visitDocument: navigate and wait for the document fetch. */
- `visitDocumentComment` — Port of H.visitDocumentComment. */
- `documentContent`
- `documentFormattingMenu`
- `documentMentionDialog`
- `getHeading1`
- `getHeading2`
- `getHeading3`
- `getParagraph`
- `getBulletList`
- `getBlockquote`
- `getOrderedList`
- `getCodeBlock`
- `getEmbed`
- `getSidebar`
- `closeSidebar` — Port of Comments.closeSidebar (cy.icon("close").click()) — the only close
- `getNewThreadInput`
- `getCommentInputs`
- `getPlaceholder`
- `getCommentByText` — Port of Comments.getCommentByText: findByText(text).closest(discussion
- `commentTextContaining` — Case-sensitive substring matcher for comment text that shares an element
- `getAllComments`
- `getMentionDialog`
- `getEmojiPicker`
- `expectFirstEmojiSuggestion` — Gate before pressing Enter to accept the emoji picker's first suggestion.
- `expectEmojiPickerSettled` — Gate after typing an emoji query, before arrow-key navigation.
- `pressArrowUntilActive` — EmojiSuggestionExtension documents that the first arrow press can be spent
- `openAllComments` — Port of Comments.openAllComments. */
- `resolveCommentByText` — Port of Comments.resolveCommentByText. */
- `reopenCommentByText` — Port of Comments.reopenCommentByText. */
- `reactToComment` — Port of Comments.reactToComment. */
- `expectNewThreadParamCleared` — CommentsSidesheet.handleSubmit strips `?new=true` only once the create
- `parkMouseAwayFromTooltips` — Cypress's `.click()`/`.type()` are synthetic: the OS cursor stays wherever
- `getDocumentNodeButtons` — Port of Comments.getDocumentNodeButtons. */
- `getDocumentNodeButton` — Port of Comments.getDocumentNodeButton. */
- `expectNodeButtonVisibility` — Cypress-visibility check for a node comment button: the button is always
- `expectVisibleNodeButtonCount` — Port of getDocumentNodeButtons().filter(":visible").should("have.length", n). */
- `lastVisibleNodeButtonHref` — The href of the LAST visible node button in DOM order — the Playwright
- `getInboxWithRetry` — Port of H.getInbox(emailsCount): polls until the inbox holds exactly

## downloads.ts
- `readSheetRows` — Parse an exported file (xlsx or csv — the lib handles both) into rows. */
- `downloadAndAssert` — Port of H.downloadAndAssert: drives the download popover, asserts the
- `exportFromDashcard` — Port of H.exportFromDashcard (non-tabular exports like .png): assumes the
- `ensureDownloadStatusDismissed` — Port of ensureDownloadStatusDismissed: the status toast auto-closes a few

## drillthroughs.ts
- `dashboardGrid` — Port of H.dashboardGrid (e2e-dashboard-helpers.ts). */
- `addOrUpdateDashboardCard` — Port of H.addOrUpdateDashboardCard (api/addOrUpdateDashboardCard.ts). */
- `createDashboardWithDetails` — Like api.createDashboard but accepting arbitrary dashboard fields
- `addCardToNewDashboard` — Port of the spec-local addCardToNewDashboard from dash_drill.cy.spec.js. */
- `clickScalarCardTitle` — Port of the spec-local clickScalarCardTitle from dash_drill.cy.spec.js:

## embedding-dashboard.ts
- `questionDetails`
- `questionDetailsWithDefaults`
- `dashboardDetails`
- `mapParameters` — Port of mapParameters (shared/embedding-dashboard.js). */
- `createDashboard` — Port of H.createDashboard (api/createDashboard.ts): POST accepts most
- `createQuestion` — Port of H.createQuestion (api/createQuestion.ts). */
- `createNativeQuestion` — Port of H.createNativeQuestion (api/createQuestion.ts). */
- `createQuestionAndDashboard` — Port of H.createQuestionAndDashboard: returns the created dashcard (whose
- `createNativeQuestionAndDashboard` — Port of H.createNativeQuestionAndDashboard: unlike the plain
- `addOrUpdateDashboardCard` — Port of H.addOrUpdateDashboardCard: PUT a single dashcard, return it. */
- `createDashboardWithTabs` — Port of H.createDashboardWithTabs: create the dashboard (holding back the
- `getEmbeddedPageUrl` — Port of getEmbeddedPageUrl — builds the signed /embed path plus the hash
- `visitEmbeddedPage` — Port of H.visitEmbeddedPage: sign the JWT, sign out, and navigate straight
- `visitEmbeddedResizerHarness` — Port of the standalone e2e/test/scenarios/embedding/embedding-dashboard.html
- `embeddedPageAbsoluteUrl` — The (absolute) signed embed url for a payload — for the resize harness,
- `openLegacyStaticEmbeddingModal` — Port of H.openLegacyStaticEmbeddingModal with `previewMode`. Delegates to
- `closeStaticEmbeddingModal`
- `publishChanges` — Port of H.publishChanges: click Publish and wait for the PUT that carries
- `getParametersContainer` — Port of getParametersContainer (e2e-embedding-helpers.js). */
- `setEmbeddingParameter` — Port of H.setEmbeddingParameter. */
- `assertEmbeddingParameter` — Port of H.assertEmbeddingParameter. */
- `getRequiredToggle` — Port of H.getRequiredToggle. */
- `toggleRequiredParameter` — Port of H.toggleRequiredParameter (the real input is hidden in Mantine). */

## embedding-repros.ts
- `getIframeBody` — Port of H.getIframeBody: the (single) iframe on the page as a FrameLocator.
- `tableInteractiveHeader` — Port of H.tableInteractiveHeader (`cy.findByTestId("table-header")`). */
- `setDefaultValueForLockedFilter` — Port of the spec-local setDefaultValueForLockedFilter (issue 15860): in the
- `createDashboardWithQuestions` — Port of H.createDashboardWithQuestions (api/createDashboardWithQuestions.ts):
- `createModelFromTableName` — Port of H.createModelFromTableName (e2e-qa-databases-helpers.js) returning
- `moveCardToCollection` — Port of the spec-local moveToCollection (issue 51934): PUT the card's
- `getFieldIdByName` — Port of H.withDatabase's field-id lookup (e2e-database-metadata-helpers.ts),
- `holdEmbedRoute` — Playwright equivalent of the spec's `cy.intercept(..., () => deferred)` /

## embedding.ts
- `METABASE_SECRET_KEY` — Port of METABASE_SECRET_KEY (e2e/support/cypress_data.js) — the
- `embedModalContent`
- `embedModalEnableEmbeddingCard`
- `legacyStaticEmbeddingButton`
- `embedModalEnableEmbedding` — Port of H.embedModalEnableEmbedding. Upstream is a cy.get("body") snapshot
- `openEmbedJsModal` — Port of H.openEmbedJsModal. */
- `openLegacyStaticEmbeddingModal` — Port of H.openLegacyStaticEmbeddingModal (only the options this spec uses:
- `visitIframe` — Port of H.visitIframe: click Preview in the static embedding modal, grab
- `currentIframeSrc` — The src of the page's (first) preview iframe, rebased onto baseUrl: the
- `visitStaticEmbedUrl` — Load an absolute url (a signed /embed/* or /public/* link) inside a real
- `createQuestion` — Port of H.createQuestion for the details the spike's api.createQuestion

## env.ts
- `BASE_URL`

## filter-bulk.ts
- `hovercard` — Port of H.hovercard: the visible Mantine HoverCard dropdown. */
- `queryBuilderFooter` — Port of H.queryBuilderFooter. */
- `createSegment` — Port of H.createSegment (POST /api/segment). */
- `trackDatasetRequests` — Counter for POST /api/dataset responses — the wait-free side of the
- `setupBooleanQuery` — Port of H.setupBooleanQuery: create + visit a native question with a

## filters-repros-2.ts
- `dashboardParametersDoneButton` — Port of H.dashboardParametersDoneButton: the "Done" button inside the
- `getManyDataTypesBooleanFieldId` — Port of the issue-45670 spec-local getField(): locate the `boolean` field of

## filters-repros.ts
- `ORDERS_DASHBOARD_DASHCARD_ID` — Port of ORDERS_DASHBOARD_DASHCARD_ID (cypress_sample_instance_data.js). */
- `createDashboard` — Port of H.createDashboard — accepts arbitrary dashboard details.
- `createQuestion` — Port of H.createQuestion (api/createQuestion.ts) returning the card id. */
- `createNativeQuestion` — Port of H.createNativeQuestion — accepts `parameters` and `type`. */
- `createQuestionAndDashboard` — Port of H.createQuestionAndDashboard: returns the created dashcard (whose
- `createNativeQuestionAndDashboard` — Port of H.createNativeQuestionAndDashboard. */
- `updateDashboardCards` — Port of H.updateDashboardCards: replaces all dashcards with `cards`. */
- `editDashboardCard` — Port of H.editDashboardCard (api/editDashboardCard.ts). */
- `createDashboardWithQuestions` — Port of H.createDashboardWithQuestions: create the dashboard, then create
- `setModelMetadata` — Port of H.setModelMetadata (e2e-models-metadata-helpers.js). */
- `dashboardParametersPopover` — Port of H.dashboardParametersPopover (popover with a dedicated testid). */
- `dashboardParameterSidebar` — Port of H.dashboardParameterSidebar. */
- `dashboardParametersContainer` — Port of H.dashboardParametersContainer. */
- `editingParametersContainer` — Port of H.editingDashboardParametersContainer. */
- `editingFilterWidget` — Port of H.filterWidget({ isEditing: true, name }): the editing-mode widgets,
- `caseSensitiveSubstring` — Case-sensitive substring matcher (Cypress :contains semantics). */
- `findByDisplayValue` — Port of cy.findByDisplayValue: the form control in `scope` whose *current*
- `isClippedByScrollContainer` — Port of Cypress's "not.be.visible" for an element scrolled out of an
- `goToMainApp` — Port of H.goToMainApp (e2e-ui-elements-helpers.js). */
- `commandPaletteSearch` — Port of H.commandPaletteSearch(query, viewAll: false): open the palette,
- `setAdHocFilter` — Port of setAdHocFilter (e2e-date-filter-helpers.js), reduced to the
- `formatMonthDayYear` — dayjs "MMM D, YYYY" equivalent for the issue-22482 range assertion. */
- `waitForResponseMatching` — The waitForResponse side of a cy.intercept alias: register BEFORE the
- `trackResponses` — The counting side of a cy.intercept alias
- `visitDashboardWithParams` — Port of H.visitDashboard's `params` option: same dashcard-query waits as
- `visitEmbeddedDashboard` — Port of H.visitEmbeddedPage for dashboards, with the `setFilters` option

## filters.ts
- `clauseStepPopover`
- `containsText` — Port of cy.contains(text) inside a scope: case-sensitive substring match

## fixtures.ts
- `test`

## interactive-embedding.ts
- `mockRedirectResponse` — Mock an external redirect (e.g. a JWT/SAML IdP bouncing back to the app).
- `visitFullAppEmbeddingUrl`
- `embedFrame` — The Frame behind visitFullAppEmbeddingUrl, for URL assertions.
- `recordedPostMessages` — Messages the embed posted to its parent since the last harness load /
- `clearRecordedPostMessages` — Port of cy.get("@postMessage").invoke("resetHistory"). */
- `expectFrameHeightMessage` — Port of `cy.get("@postMessage").should("have.been.calledWith", {metabase:
- `postMessageToEmbed` — Port of H.postMessageToIframe. The Cypress helper hand-crafts a
- `ResponseQueue` — Port of Cypress intercept alias semantics: matching responses are recorded
- `appBar` — COPY of ui.ts appBar, accepting a FrameLocator scope. */
- `sideNav` — Port of the spec-local sideNav(). */
- `getNotebookStep` — COPY of notebook.ts getNotebookStep, accepting a FrameLocator scope. */
- `getDashboardCard` — COPY of dashboard.ts getDashboardCard, accepting a FrameLocator scope. */
- `dashboardGrid` — COPY of drillthroughs.ts dashboardGrid, accepting a FrameLocator scope. */
- `dashboardHeader` — Port of H.dashboardHeader, accepting a FrameLocator scope. */
- `assertTableRowsCount` — COPY of native-extras.ts assertTableRowsCount, accepting any scope (the
- `expectInputWithValue` — Port of cy.findByDisplayValue(value): retried scan of the scope's form
- `exportDashcardCsv` — Port of the dashcard-menu CSV export path: H.exportFromDashcard(".csv")
- `updateCollectionGraph` — Port of cy.updateCollectionGraph (support/commands/permissions):
- `addLinkClickBehavior` — Port of the spec-local addLinkClickBehavior. */
- `createDashboardWithTabs` — COPY of command-palette.ts createDashboardWithTabs with tabs optional
- `updateDashboardCards` — Port of H.updateDashboardCards (PUT the dashcards array). */
- `getNextUnsavedDashboardCardId` — Port of H.getNextUnsavedDashboardCardId (e2e-dashboard-helpers.ts). */
- `mockDashboardCard` — Local stand-in for createMockDashboardCard (metabase-types/api/mocks) —
- `getTextCardDetails` — Port of H.getTextCardDetails / createMockTextDashboardCard (the virtual
- `createDocument` — Port of H.createDocument (createMockDocument + POST /api/document),
- `createComment` — Port of H.createComment (api/createComment.ts). */
- `getTableId` — Port of H.getTableId (e2e-qa-databases-helpers.js). */
- `createModelFromTableName` — Port of H.createModelFromTableName (e2e-qa-databases-helpers.js). */
- `signJwt` — Port of cy.task("signJwt") (e2e/support/commands/embedding/signJwt or the
- `ALL_USERS_GROUP` — Mirrors ALL_USERS_GROUP in e2e/support/cypress_data.js (fixed id baked

## joins.ts
- `visitQuestionAdhocNotebook` — Port of H.visitQuestionAdhoc's notebook-mode branch: no results render in
- `openTableNotebook` — Port of H.openTable({ mode: "notebook" }) (and openOrdersTable etc). */
- `join` — Port of H.join: click the "Join data" action button. */
- `filterNotebook` — Port of H.filter({ mode: "notebook" }). */
- `summarizeNotebook` — Port of H.summarize({ mode: "notebook" }). */
- `addCustomColumn` — Port of H.addCustomColumn (always notebook mode). */
- `miniPickerBrowseAll`
- `joinTable` — Port of H.joinTable: pick a raw table in the join's mini picker, plus
- `selectSavedQuestionsToJoin` — Port of H.selectSavedQuestionsToJoin: pick a saved question as the data
- `selectFilterOperator` — Port of H.selectFilterOperator. */
- `addSummaryField` — Port of H.addSummaryField (aggregation). */
- `addSummaryGroupingField` — Port of H.addSummaryGroupingField (breakout). */
- `assertJoinValid` — Port of H.assertJoinValid: the visualized table must have columns from both

## metrics-explorer.ts
- `MetricsViewer`
- `waitForMetricDataset` — The next POST /api/metric/dataset response (the "@dataset" alias).
- `waitForGetMetric` — The next GET /api/metric/:id response (the "@getMetric" alias). */
- `ensureChartIsActive` — Port of H.ensureChartIsActive: DebouncedFrame disables pointer events
- `applyBrush` — Port of H.applyBrush: drag horizontally across the chart at y=100
- `splitPanelAxisLines`
- `echartsTooltip` — Port of H.echartsTooltip: ECharts may keep two DOM instances of the
- `hoverChartPointForTooltip` — no tooltip appears (metrics-explorer:1131 on the first sharded run);
- `createMeasure` — Port of H.createMeasure (POST /api/measure). */
- `createMetric` — Port of H.createQuestion for the metric card shapes this spec uses —
- `DEFAULT_PLACEHOLDER_COLOR` — Default color of an unassigned pill indicator (orion 100 as hex). */
- `readColorsFromIndicator` — Port of readColorsFromIndicator: the hex colors of a pill's
- `getPillColors` — Port of getPillColors: retried (like the upstream .should callback) until
- `readLegendEntries` — The breakout legend's { label, color(hex) } entries, in DOM order. */
- `resetDecimalPkTable` — Port of H.resetTestTable({ type: "postgres", table: "decimal_pk_table" })

## metrics.ts
- `MetricPage`
- `undoToast`
- `visitMetric` — Port of H.visitMetric: navigate and wait for the metric's query. */
- `filterInNotebook` — Port of H.filter({ mode: "notebook" }) from e2e-bi-basics-helpers.js. */
- `cartesianChartCircles`
- `changeBinningForDimension` — Port of H.changeBinningForDimension: hover the dimension row, click its

## models.ts
- `tableInteractive` — Port of H.tableInteractive(). */
- `openQuestionActions` — Port of H.openQuestionActions: the ellipsis menu in the QB header. */
- `summarize` — Port of H.summarize({ mode }): the sum icon in the notebook action toolbar,
- `selectFromDropdown` — Port of selectFromDropdown (models helpers): clicks an option in the
- `waitForDataset` — POST /api/dataset response — the wait behind H's "@dataset" alias. */
- `visitModel` — Port of H.visitModel (hasDataAccess variant): visit the model page and wait
- `runNativeQuery` — Port of H.runNativeQuery: click the play button in the native editor, wait
- `createNativeModel` — Port of H.createNativeQuestion({ type: "model", ... }). Mirrors the Cypress

## multiple-column-breakouts.ts
- `createQuestion` — Port of H.createQuestion (POST /api/card). Returns the created card id. */
- `createAndVisitQuestion` — Port of H.createQuestion(details, { visitQuestion: true }). */
- `createQuestionAndDashboard` — Port of H.createQuestionAndDashboard for this spec's shape. Applies the
- `assertTableData` — Port of H.assertTableData — header cells and first body rows of the QB's
- `summarize` — Port of H.summarize() (non-notebook mode): guard against the empty-sidebar
- `tableHeaderClick` — Port of the spec-local tableHeaderClick: click a result-table header to open
- `addBreakoutColumn` — Port of the breakout-picker interaction in the "create a query with multiple
- `datasetResponse` — POST /api/dataset (the "@dataset" alias). */
- `pivotDatasetResponse` — POST /api/dataset/pivot (the "@pivotDataset" alias). */
- `dashcardQueryResponse` — /api/dashboard/*​/dashcard/*​/card/*​/query (the "@dashcardQuery" alias). */
- `publicDashcardQueryResponse` — /api/public/dashboard/*​/dashcard/*​/card/* (the "@publicDashcardQuery"). */
- `embedDashcardQueryResponse` — /api/embed/dashboard/*​/dashcard/*​/card/* (the "@embedDashcardQuery"). */
- `toggleColumn` — The "add or remove columns" checkbox toggle used by the viz-settings tests. */

## native-editor.ts
- `adhocQuestionHash` — Port of adhocQuestionHash (the btoa'd card definition in the URL hash). */
- `startNewNativeQuestion` — Port of H.startNewNativeQuestion: visit the ad-hoc URL that clicking
- `nativeEditor` — Port of NativeEditor.get(): the CodeMirror content element. */
- `focusNativeEditor` — Port of NativeEditor.focus(): wait for loading to finish, click the editor,
- `typeInNativeEditor` — Port of NativeEditor.type() for plain text (no {escape} sequences): real
- `nativeEditorCompletions` — Port of NativeEditor.completions(): the autocomplete tooltip. */
- `nativeEditorCompletion` — Port of NativeEditor.completion(label): completion rows whose label

## native-extras.ts
- `createNativeCard` — Port of H.createNativeQuestion (api/createQuestion.ts `question()`): POST
- `visitQuestionEitherEndpoint` — a card is created through the API with hand-written template-tags):
- `createSnippet` — Port of H.createSnippet (api/createSnippet.ts). */
- `clearNativeEditor` — Port of H.NativeEditor.clear(): focus, select all, backspace. Lives here
- `assertTableRowsCount` — Port of H.assertTableRowsCount: some rows rendered (virtualization makes

## native-filters-extras.ts
- `runNativeQueryEitherEndpoint` — Port of H.runNativeQuery for specs that call it on SAVED questions:
- `filterWidgetByName` — Port of H.filterWidget({ name }): all parameter widgets whose text contains
- `resetManyDataTypesTable` — Port of H.resetTestTable({ type: "postgres", table: "many_data_types" }).
- `createNativeQuestionWithParameters` — Port of H.createNativeQuestion for the remapping spec's card shape:

## native-filters.ts
- `openTypePickerFromDefaultFilterType` — Port of SQLFilter.openTypePickerFromSelectedFilterType /
- `chooseType` — Port of SQLFilter.chooseType. */
- `toggleRequired` — Port of SQLFilter.toggleRequired (clicks the toggle's label text). */
- `getRunQueryButton` — Port of SQLFilter.getRunQueryButton. */
- `getSaveQueryButton` — Port of SQLFilter.getSaveQueryButton. */
- `runQuery` — Port of SQLFilter.runQuery: click run, wait for POST /api/dataset (the
- `setFieldAlias` — Port of SQLFilter.setFieldAlias (clear + type + blur). */
- `mapFieldFilterTo` — Port of FieldFilter.mapTo: pick the table, then the field, from the
- `clearFilterWidget` — Port of H.clearFilterWidget: click the widget's close icon (hover-gated). */
- `removeFieldValuesValue` — Port of H.removeFieldValuesValue: the nth "Remove" button among the
- `fieldValuesCombobox` — Port of H.fieldValuesCombobox (cy.findByRole("combobox") in scope). */
- `multiAutocompleteInput` — Port of H.multiAutocompleteInput. The Cypress helper's trailing

## nested-questions.ts
- `waitForDataset` — Register a wait for the next POST /api/dataset response. Must be called
- `summarize` — Port of H.summarize (default, non-notebook mode). */
- `filter` — Port of H.filter (default, non-notebook mode). */
- `getDimensions`
- `getDimensionByName` — Port of H.getDimensionByName: substring, case-sensitive (cy :contains). */
- `selectFilterOperator`
- `saveQuestionToCollection`

## notebook.ts
- `queryBuilderMain`
- `viewFooter`
- `notebookButton`
- `openNotebook` — Switch to the notebook editor from a simple query view. */
- `getNotebookStep` — Select a notebook step like filter, join, breakout, etc. */
- `visualize` — Port of H.visualize: click Visualize and wait for the dataset query.
- `miniPicker`
- `entityPickerModal`
- `entityPickerModalLevel`
- `startNewQuestion` — Port of H.startNewQuestion: New → Question. */
- `assertQueryBuilderRowCount` — Port of H.assertQueryBuilderRowCount. */
- `tableHeaderColumn`
- `tableHeaderClick`
- `expressionEditorWidget`
- `enterCustomColumnDetails` — Minimal port of H.enterCustomColumnDetails: CodeMirror expression input via

## onboarding-extras.ts
- `mockSessionProperties` — Fetch the real /api/session/properties response and overwrite the given
- `isMaildevRunning` — Availability probe for gating the email describes: environments without
- `setupSMTP` — Port of H.setupSMTP: PUT /api/email live-validates the SMTP connection
- `clearInbox` — Port of H.clearInbox. */
- `getInbox` — One-shot inbox fetch (H.getInbox without the retry — see waitForEmail). */
- `emailAddressees` — All addresses an email was sent to. The alert lifecycle emails go out
- `waitForEmail` — Poll the inbox until an email matches (port of getInboxWithRetry). The
- `getCurrentUserId` — Port of H.getCurrentUser, reduced to the id the notifications spec needs. */
- `createQuestionAlert` — Port of H.createQuestionAlert (api/createNotification.ts). */
- `createPulse` — Port of H.createPulse (api/createPulse.ts). */
- `notificationList` — Port of H.notificationList: findByRole("list", { name: "undo-list" }). */
- `openUserNotifications` — Port of the spec's openUserNotifications: visit /account/notifications and

## onboarding.ts
- `USER_NAMES` — First/last names from e2e/support/cypress_data.js — that file is untyped
- `getFullName` — Port of H.getFullName (e2e/support/helpers/e2e-users-helpers.ts), minus the
- `getUsersPersonalCollectionSlug` — Port of getUsersPersonalCollectionSlug from urls.cy.spec.js. */
- `NORMAL_PERSONAL_COLLECTION_ID` — Port of NORMAL_PERSONAL_COLLECTION_ID from
- `expectPathname` — Port of cy.location("pathname").should("eq", ...). Cypress retried the

## organization-extras.ts
- `USER_DISPLAY_NAMES` — First/last names from e2e/support/cypress_data.js — the harness USERS map
- `createAndBookmarkQuestion` — Port of createAndBookmarkQuestion (bookmark-helpers.ts): API-create a
- `verifyBookmarksOrder` — Port of verifyBookmarksOrder: the Cypress helper asserted the list length
- `moveBookmark` — Port of moveBookmark: drag the bookmark by `verticalDistance` pixels and

## organization.ts
- `ORDERS_MODEL_ID`
- `ORDERS_COUNT_QUESTION_ID`
- `toggleQuestionBookmarkStatus` — Port of toggleQuestionBookmarkStatus (bookmark-helpers.ts). The Cypress
- `getSidebarSectionTitle` — Port of H.getSidebarSectionTitle (e2e-collection-helpers.ts), scoped to the
- `undoToastList` — Port of H.undoToastList: findAllByTestId("toast-undo"). */
- `openDashboardMenu` — Port of H.openDashboardMenu (e2e-dashboard-helpers.ts). */

## permissions.ts
- `ADMIN_PERSONAL_COLLECTION_ID` — Port of ADMIN_PERSONAL_COLLECTION_ID from
- `signInWithCachedSession` — Sign in as any user with a cached session (e.g. "none"), mirroring the
- `adhocQuestionHash` — Port of adhocQuestionHash (e2e/support/helpers/e2e-ad-hoc-question-helpers.js).
- `visitQuestionAdhoc` — Port of H.visitQuestionAdhoc, minus the notebook mode and the native

## pivot-tables.ts
- `visitPivotAdhoc`
- `createPivotQuestion`
- `PIVOT_TABLE_BODY_LABEL` — Mirrors PIVOT_TABLE_BODY_LABEL from
- `assertOnPivotSettings` — Port of the spec's assertOnPivotSettings: the three field options in the
- `assertOnPivotFields` — Port of the spec's assertOnPivotFields: implicit assertions on the rendered
- `openColumnSettings` — Port of the spec's openColumnSettings: the column's ellipsis (settings)
- `sortColumnResults` — Port of the spec's sortColumnResults: open the column's settings button, pick
- `getPivotTableBodyCell` — Port of the spec's getPivotTableBodyCell: the index-th value cell in the
- `moveDnDKitListElement` — Port of H.moveDnDKitListElement: drag the list element at `startIndex` onto
- `moveDnDKitPointer` — Port of H.moveDnDKitElementByAlias for the pivot column-RESIZE handles, which
- `cellContentWidth` — jQuery-style .width() (content-box width) of the pivot-table cell wrapping a
- `findDisplayValue` — Port of cy.findByDisplayValue: the form control in `scope` whose current
- `updatePermissionsGraph` — Port of cy.updatePermissionsGraph: GET the graph, shallow-merge the given
- `saveAdhocQuestion` — Port of the column-resizing test's H.saveQuestion(undefined, undefined, {

## question-new.ts
- `SECOND_COLLECTION_ID` — Not in support/sample-data.ts, so it's looked up here the same way. */
- `NOCOLLECTION_PERSONAL_COLLECTION_NAME` — Port of H.getPersonalCollectionName(USERS.nocollection): the nocollection
- `miniPickerHeader` — Port of H.miniPickerHeader(). */
- `tableInteractiveBody` — Port of H.tableInteractiveBody(). */
- `collectionOnTheGoModal` — Port of H.collectionOnTheGoModal(). */
- `entityPickerModalItem` — Port of H.entityPickerModalItem(level, name):
- `checkSavedToCollectionQuestionToast` — Port of H.checkSavedToCollectionQuestionToast. */
- `selectPermissionRow` — Port of H.selectPermissionRow: click the permissionIndex-th permission
- `visitCollection` — Port of H.visitCollection: navigate and wait for both collection-items
- `addSQLiteDatabase` — Port of cy.addSQLiteDatabase. */
- `logRecent` — Port of the spec-local logRecent(model, model_id). */
- `waitForCreateQuestion` — Register a wait for the next POST /api/card response ("@createQuestion"). */
- `waitForCreateDashboard` — Register a wait for the next POST /api/dashboard response ("@createDashboard"). */

## question-saved.ts
- `SECOND_COLLECTION_ID`
- `ORDERS_BY_YEAR_QUESTION_ID`
- `rightSidebar` — Port of H.rightSidebar(). */
- `dashboardCards` — Port of H.dashboardCards(). */
- `collectionOnTheGoModal` — Port of H.collectionOnTheGoModal(). */
- `visitDataModel` — Port of H.DataModel.visit() with no arguments: open /admin/datamodel and
- `tablePickerTable` — Port of H.DataModel.TablePicker.getTable(name). */
- `visitEmbeddedPage` — Port of H.visitEmbeddedPage, options-free variant (the saved spec passes no
- `visitPublicDashboard`
- `WEBHOOK_TEST_SESSION_ID`
- `WEBHOOK_TEST_HOST`
- `WEBHOOK_TEST_URL`
- `resetWebhookTester` — Port of H.resetWebhookTester (404s when there are no requests yet). */
- `getAlertChannel` — Port of H.getAlertChannel. */
- `setupSMTP` — Requires the maildev container:
- `removeNotificationHandlerChannel` — Port of H.removeNotificationHandlerChannel. */
- `addNotificationHandlerChannel` — Port of H.addNotificationHandlerChannel. */

## question-settings.ts
- `openOrdersTable` — Port of H.openOrdersTable (simple mode only — all this spec needs). */
- `browseDatabases` — Port of H.browseDatabases. */
- `getSidebarColumns` — Port of the spec's getSidebarColumns: all column rows (visible and
- `getVisibleSidebarColumns` — Port of the spec's getVisibleSidebarColumns. */
- `findColumnAtIndex` — Port of the spec's findColumnAtIndex (negative indices count from the
- `moveDnDKitElementSynthetic` — Synthetic-event port of H.moveDnDKitElementByAlias({ useMouseEvents }) for
- `hideColumn` — Port of the spec's hideColumn. Like the Cypress original, no force —

## relative-datetime.ts
- `STARTING_FROM_UNITS`
- `addToDate` — UTC-calendar equivalent of dayjs().utc().add(amount, unit). */
- `clickActionsPopover` — Port of H.clickActionsPopover. */
- `nativeSQL` — Port of the spec's nativeSQL: create + visit a native question selecting
- `openCreatedAt` — Port of the spec's openCreatedAt: header click → relative date picker. */
- `addStartingFrom` — Port of the spec's addStartingFrom: reveal the "Starting from" controls. */
- `setRelativeDatetimeUnit` — Port of the spec's setRelativeDatetimeUnit (exact string or regex). */
- `setRelativeDatetimeValue` — Port of the spec's setRelativeDatetimeValue. */
- `setStartingFromValue` — Port of the spec's setStartingFromValue. */
- `setPickerValue` — Port of H.relativeDatePicker.setValue. */
- `addPickerStartingFrom` — Port of H.relativeDatePicker.addStartingFrom. */
- `withStartingFrom` — Port of the spec's withStartingFrom: build a Previous/Next filter with an

## revisions.ts
- `sidesheet`
- `questionInfoButton`
- `openQuestionsSidebar` — Port of H.openQuestionsSidebar. */
- `saveDashboardWithoutAwaitingRequests` — Port of H.saveDashboard({ awaitRequest: false }): the shared
- `openRevisionHistory` — Port of the spec-local openRevisionHistory: open the dashboard info
- `clickRevert` — Port of the spec-local clickRevert. The revert buttons carry the event
- `waitForRevert` — Playwright equivalent of the spec's cy.intercept("POST",
- `expectRevertSuccess` — Port of the repeated cy.wait("@revert") status/cause assertions. */

## sample-data.ts
- `SAMPLE_DB_ID`
- `ORDERS_QUESTION_ID`
- `ORDERS_DASHBOARD_ID`
- `FIRST_COLLECTION_ID`
- `THIRD_COLLECTION_ID`
- `LOGIN_CACHE` — Session ids cached at snapshot-creation time. The sessions live in the
- `USERS` — Credentials fallback for users without a cached session. */

## schema-viewer.ts
- `WRITABLE_DB_ID` — Mirrors e2e/support/cypress_data.js */
- `MAGIC_USER_GROUPS` — Mirrors MAGIC_USER_GROUPS in e2e/support/cypress_data.js */
- `tableNode`
- `schemaPickerTrigger`
- `schemaViewerSearchInput`
- `infoPanel`
- `reactFlowViewport`
- `dataStudioNav` — Port of H.DataStudio.nav() (e2e-data-studio-helpers.ts). */
- `tableSectionActionsMenuButton` — Port of H.DataModel.TableSection.getActionsMenuButton()
- `menu` — Port of H.menu() (e2e-ui-elements-helpers.js). */
- `waitForErd` — Register BEFORE the action that triggers the ERD fetch; await after
- `expectViewportZoomAtLeast` — Port of assertViewportZoom for the two "at least" call sites. Retries via
- `expectNodeInViewport` — Port of assertNodeInViewport — bounding-rect overlap, retried. */
- `queryWritableDB` — Port of H.queryWritableDB(sql, "postgres") — the Cypress version runs
- `getTableId` — Port of H.getTableId (e2e-qa-databases-helpers.js). */
- `resyncDatabase` — Port of H.resyncDatabase + waitForSyncToFinish

## search.ts
- `getSearchBar` — Port of H.getSearchBar. */
- `visitFullAppEmbeddingUrl`
- `embedFrame` — The Frame behind visitFullAppEmbeddingUrl, for URL assertions. */
- `isSearchRequest` — Matches the Cypress `cy.intercept("GET", "/api/search?q=*")` pattern. */
- `realPressEnter` — Port of cy.realPress("Enter") for selecting a highlighted search result.
- `waitForSearchResponse`
- `expectSearchResultContent` — Port of H.expectSearchResultContent.
- `assertIsEllipsified` — Port of H.assertIsEllipsified (isEllipsified evaluated in the browser). */
- `isScrollableHorizontally` — Port of H.isScrollableHorizontally. */
- `createQuestionWithDescription` — Port of H.createQuestion for details the spike's api.createQuestion doesn't
- `createCollection` — Port of H.createCollection. */

## sharing.ts
- `main`
- `sharingMenuButton`
- `sharingMenu`
- `openSharingMenu`
- `openNewPublicLinkDropdown` — Port of H.openNewPublicLinkDropdown: opens the sharing menu's public-link
- `createPublicQuestionLink`
- `createNativeQuestion`
- `visitPublicQuestion`
- `signInWithCachedSession` — Port of cy.signIn for users outside the fixture's UserName union (e.g.
- `startNewNativeQuestion` — Port of H.startNewNativeQuestion — the query generated by "New" > "SQL query". */
- `nativeEditor`
- `focusNativeEditor`
- `typeInNativeEditor` — Port of H.NativeEditor.type. Only the escape sequences this spec needs are
- `saveQuestion`
- `downloadViaUi` — Drives the question download UI and resolves with the resulting Download.

## sql-filters-reset-clear.ts
- `NO_DEFAULT_NON_REQUIRED`
- `NO_DEFAULT_REQUIRED`
- `DEFAULT_NON_REQUIRED`
- `DEFAULT_REQUIRED`
- `filter` — Port of the spec-local filter(label): cy.findByLabelText(label) (exact). */
- `filterInput` — Port of the spec-local filterInput(label): filter(label).findByRole("textbox"). */
- `filterSection` — Port of the spec-local filterSection(id): the tag-editor variable settings block. */
- `clearButton` — Port of clearButton(label): filter(label).parent().findByLabelText("Clear"). */
- `resetButton` — Port of resetButton(label): the "Reset filter to default state" button. */
- `checkStatusIcon` — Port of the spec-local checkStatusIcon: exactly one of the three status icons
- `setInputValue` — Port of the input setValue/updateValue callbacks:
- `setDropdownFieldValue`
- `updateDropdownFieldValue`
- `addDateFilter` — Port of the spec-local addDateFilter. */
- `updateDateFilter` — Port of the spec-local updateDateFilter. */
- `checkNativeParametersInput` — Port of checkNativeParametersInput (text/number widgets in the parameters bar). */
- `checkNativeParametersDropdown` — Port of checkNativeParametersDropdown (date/field widgets in the parameters bar). */
- `checkParameterSidebarDefaultValue` — Port of checkParameterSidebarDefaultValue (text/number sidebar default value). */
- `checkParameterSidebarDefaultValueDate` — Port of checkParameterSidebarDefaultValueDate. */
- `checkParameterSidebarDefaultValueDropdown` — Port of checkParameterSidebarDefaultValueDropdown (field widgets). */

## table-column-settings.ts
- `tableInteractiveBody` — Port of H.tableInteractiveBody() — cy.findByTestId("table-body"). */
- `tableInteractiveHeader` — Port of H.tableInteractiveHeader() — cy.findByTestId("table-header"). */
- `tableInteractiveScrollContainer` — Port of H.tableInteractiveScrollContainer() — the horizontal scroll box. */
- `visibleColumns` — The spec-local visibleColumns() — cy.findByTestId("visible-columns"). */
- `getColumn` — Port of the spec-local getColumn: `visibleColumns().contains("[role=listitem]",
- `assertColumnEnabled` — Port of the spec-local assertColumnEnabled. */
- `assertColumnHidden` — Port of the spec-local assertColumnHidden. */
- `showColumn` — Port of the spec-local showColumn: click `${column}-show-button`. */
- `hideColumn` — Port of the spec-local hideColumn: click `${column}-hide-button`. */
- `scrollVisualizationRight` — Port of the spec-local scrollVisualization (default position "right"):
- `openColumnOptions` — Port of H.openColumnOptions (e2e-models-metadata-helpers.js): scroll the
- `assertRowHeight` — Port of H.assertRowHeight(index, height): the row at [data-index=index] has
- `columnHeaderDragHandle` — The drag target for a column header reorder. H.tableHeaderColumn returns the
- `moveDnDKitColumnHeader` — Port of H.moveDnDKitElementByAlias for the interactive table's column-reorder

## temporal-unit-parameters.ts
- `dashboardDetails`
- `singleBreakoutQuestionDetails`
- `multiBreakoutQuestionDetails`
- `noBreakoutQuestionDetails`
- `multiStageQuestionDetails`
- `expressionBreakoutQuestionDetails`
- `binningBreakoutQuestionDetails`
- `nativeQuestionDetails`
- `nativeQuestionWithTextParameterDetails`
- `nativeQuestionWithDateParameterDetails`
- `nativeUnitQuestionDetails`
- `nativeTimeQuestionDetails`
- `getNativeTimeQuestionBasedQuestionDetails`
- `questionWithoutDefaultValue` — Port of the spec-local questionWithoutDefaultValue (native tests). */
- `parameterDetails`
- `getParameterMapping`
- `createDashboardWithQuestions` — Native-aware port of H.createDashboardWithQuestions: the dashboard-parameters
- `createDashboardWithMappedQuestion` — Port of the spec-local createDashboardWithMappedQuestion. */
- `createDashboardWithMultiSeriesCard` — Port of the spec-local createDashboardWithMultiSeriesCard. */
- `backToDashboard` — Port of the spec-local backToDashboard. */
- `addTemporalUnitParameter` — Port of the spec-local addTemporalUnitParameter (H.setFilter("Time grouping")). */
- `addQuestion` — Port of the spec-local addQuestion. */
- `removeQuestion` — Port of the spec-local removeQuestion (the close icon is hover-gated). */
- `selectDashboardFilter` — Faithful port of H.selectDashboardFilter (e2e-dashboard-helpers.ts): the real
- `editParameter` — Port of the spec-local editParameter. */
- `ensureDashboardCardHasText` — Port of H.ensureDashboardCardHasText — note the `dashcard` testid (distinct
- `resetFilterWidgetToDefault` — Port of H.resetFilterWidgetToDefault (the revert icon, hover-gated). */
- `dashcardTableHeaderColumn` — Port of H.tableHeaderColumn scoped to a dashcard — the click-behavior tests

## ui.ts
- `icon` — `.Icon-<name>` locator. Canonical home for the helper that had been
- `modal` — The open Mantine modal dialog. Canonical home for the helper that had been
- `popover` — Matches all visible popovers (like the Cypress helper). With a single
- `goToTab` — Click a tab by its accessible name. Canonical home for the copy that had
- `navigationSidebar`
- `appBar`
- `newButton`
- `collectionTable`
- `queryBuilderHeader`
- `assertNavigationSidebarItemSelected`
- `sidebarSection` — The sidebar sections use a literal role="section" attribute — not a valid
- `assertNavigationSidebarBookmarkSelected`
- `openNavigationSidebar` — Port of openNavigationSidebar's self-healing open loop: navigating to a
- `visitQuestion` — Port of H.visitQuestion: navigate and wait for the metadata + query
- `visitDashboard` — Port of H.visitDashboard: look up the dashboard through the API as the

## visualizer-basics.ts
- `ORDERS_COUNT_BY_CREATED_AT`
- `ORDERS_COUNT_BY_PRODUCT_CATEGORY`
- `PRODUCTS_COUNT_BY_CREATED_AT`
- `PRODUCTS_AVERAGE_BY_CREATED_AT`
- `PRODUCTS_COUNT_BY_CATEGORY`
- `PRODUCTS_COUNT_BY_CATEGORY_PIE`
- `SCALAR_CARD`
- `STEP_COLUMN_CARD`
- `VIEWS_COLUMN_CARD`
- `createQuestion` — Port of H.createQuestion (POST /api/card). Returns the created card id. */
- `createNativeQuestion` — Port of H.createNativeQuestion (POST /api/card, native dataset_query). */
- `createDashboard` — Port of H.createDashboard (api/createDashboard.ts): enable_embedding and
- `addQuestionToDashboard` — Port of H.addQuestionToDashboard: append a dashcard, keeping existing ones. */
- `createNativeQuestionAndDashboard` — Port of H.createNativeQuestionAndDashboard: create the native card, a
- `createPublicDashboardLink` — Port of H.createPublicDashboardLink. */
- `createDashboardWithVisualizerDashcards` — Port of createDashboardWithVisualizerDashcards: build a dashboard of six
- `waitForCardQueries` — Resolve after `count` POST /api/card/:id/query responses. Register BEFORE
- `dataImporter`
- `clickVisualizeAnotherWay` — Port of H.clickVisualizeAnotherWay: from the questions sidebar. */
- `openQuestionsSidebar` — Port of H.openQuestionsSidebar. */
- `verticalWell`
- `horizontalWell`
- `pieMetricWell`
- `pieDimensionWell`
- `assertWellItems` — Port of H.assertWellItems: each named well has exactly the given items. */
- `assertWellItemsCount` — Port of H.assertWellItemsCount. */
- `switchToAddMoreData`
- `switchToColumnsList`
- `selectDataset` — Port of H.selectDataset: type into the search box, click the matching
- `assertDataSourceColumnSelected` — Port of H.assertDataSourceColumnSelected. */
- `deselectColumnFromColumnsList` — Port of H.deselectColumnFromColumnsList. */
- `resetDataSourceButton` — Port of H.resetDataSourceButton: open the datasource actions menu and return
- `selectVisualization` — Port of H.selectVisualization. */
- `assertCurrentVisualization` — Port of H.assertCurrentVisualization. */
- `showDashcardVisualizerModal` — Port of H.showDashcardVisualizerModal. */
- `saveDashcardVisualizerModal` — Port of H.saveDashcardVisualizerModal. */
- `showUnderlyingQuestion` — Port of H.showUnderlyingQuestion. */
- `clickOnCardTitle` — Port of H.clickOnCardTitle. */
- `assertDashboardCardTitle` — Port of H.assertDashboardCardTitle. */
- `chartGridLines` — Port of H.chartGridLines, scoped to a dashcard. */
- `goalLine` — Port of H.goalLine (GOAL_LINE_DASH = [3, 4]). */
- `renameEditableText` — Port of the EditableText rename dance: fill() doesn't mark it dirty, so

## viz-charts-repros.ts
- `visitAdhoc`
- `visitNativeAdhoc`
- `chartGridLines` — Port of H.chartGridLines (e2e-visual-tests-helpers.js). Not scoped to
- `cartesianChartCircleWithColor` — Port of H.cartesianChartCircleWithColor: the line/area data-point markers of
- `echartsTriggerBlur` — Port of H.echartsTriggerBlur: hover the right edge of the chart to dismiss
- `echartsTooltip` — Port of H.echartsTooltip: the single visible tooltip DOM instance. */
- `assertEChartsTooltip` — Port of H.assertEChartsTooltip ({ header, rows, footer, blurAfter }). The
- `vizSettingsSidebar` — Port of H.vizSettingsSidebar (e2e-viz-settings-helpers.js). */
- `openObjectDetail` — Port of H.openObjectDetail(rowIndex): hover the row, then click the
- `saveSavedQuestion` — Port of H.saveSavedQuestion (e2e-misc-helpers.js): overwrite an already-saved
- `addQuestionToDashboard` — Port of api/addQuestionToDashboard.ts: GET the dashboard, append a dashcard
- `getChartPoints` — Port of the spec-local getChartPoints: the white line-chart point markers.
- `getNoPointsMessage` — Port of the spec-local getNoPointsMessage. */
- `assertNoPoints` — Port of the spec-local assertNoPoints. */
- `assertDataVisible` — Port of the spec-local assertDataVisible. */
- `moveDnDKitElementVertically` — Port of H.moveDnDKitElementByAlias(alias, { vertical, useMouseEvents: true }):

## viz-tabular-repros.ts
- `ADMIN_USER_ID` — Port of ADMIN_USER_ID (cypress_sample_instance_data.js): the id of the
- `main` — Port of H.main() (e2e-ui-elements-helpers.js): cy.get("main"). */
- `queryBuilderFooterDisplayToggle` — Port of H.queryBuilderFooterDisplayToggle. */
- `createVizQuestion`
- `createNativeVizQuestion` — Native-question creator accepting `display` and `visualization_settings` —
- `expectDisplayValueVisible` — cy.findByDisplayValue(value).should("be.visible"). */
- `expectNoDisplayValue` — cy.findByDisplayValue(value).should("not.exist"). */
- `getControlByDisplayValue` — cy.findByDisplayValue(value): the (first) control with that current value. */
- `echartsTooltip` — Port of H.echartsTooltip: ECharts may keep two DOM instances of the tooltip;
- `hoverLineDot` — Port of H.cartesianChartCircle().eq(index).realHover(): hover the index-th
- `assertEChartsTooltip` — Port of H.assertEChartsTooltip ({ header, rows }). Only the header/rows
- `resizeTableColumn` — Port of H.resizeTableColumn(columnId, moveX): mousedown the column's resize

## wave7-filters-admin.ts
- `OAUTH_REDIRECT_URI`
- `registerOauthClient` — Register a dynamic client via `POST /oauth/register`, creating a
- `approveOauthClient`
- `denyOauthClient`
- `caseSensitiveSubstring` — Case-sensitive substring matcher for `filter({ hasText })` — Cypress-style

## worker-backend.ts
- `startWorkerBackend`
