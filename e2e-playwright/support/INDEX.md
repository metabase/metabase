# Helper index (generated — do not edit; run scripts/build-helper-index.mjs)

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

## collections.ts
- `getPinnedSection` — Port of H.getPinnedSection. */
- `getUnpinnedSection` — Port of H.getUnpinnedSection. */
- `openPinnedItemMenu` — Port of H.openPinnedItemMenu: hover the pinned card, then open Actions. */
- `openUnpinnedItemMenu` — Port of H.openUnpinnedItemMenu: the row ellipsis is hover-gated. */
- `waitForPinnedItems` — Cypress intercept `GET /api/(**)/items?pinned_state*` — the collection
- `waitForCardQuery` — Cypress intercept `POST /api/card/(**)/query` — a pinned card's query run.
- `dragAndDrop` — Port of H.dragAndDrop (e2e-dragndrop-helpers.js): fires the HTML5 drag

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

## custom-column.ts
- `customExpressionEditor` — Port of H.CustomExpressionEditor.value()'s target: the CodeMirror content
- `openTableNotebookWithLimit` — Port of H.openTable({ mode: "notebook", limit, table }). */

## dashboard-cards.ts
- `icon` — Port of the cy.icon command: `.Icon-<name>` selector. */
- `showDashboardCardActions` — Port of H.showDashboardCardActions (realHover → native hover). */
- `getDashboardCardMenu` — Port of H.getDashboardCardMenu — waits for the card to finish loading. */
- `inputWithValue` — Port of cy.findByDisplayValue: find the input in `scope` whose current
- `moveDnDKitElement` — Port of H.moveDnDKitElementByAlias — but with real mouse input instead of
- `moveDnDKitElementOnto` — Deterministic dnd-kit sortable move: drag `element` so its center lands

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

## dashboard.ts
- `dashboardHeader`
- `editBar`
- `sidebar`
- `modal`
- `selectDropdown`
- `getDashboardCard`
- `filterWidget`
- `editDashboard`
- `saveDashboard` — Port of H.saveDashboard — the intercept-alias pattern inverted:
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

## filters.ts
- `clauseStepPopover`
- `containsText` — Port of cy.contains(text) inside a scope: case-sensitive substring match

## fixtures.ts
- `test`

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

## metrics.ts
- `MetricPage`
- `undoToast`
- `visitMetric` — Port of H.visitMetric: navigate and wait for the metric's query. */
- `filterInNotebook` — Port of H.filter({ mode: "notebook" }) from e2e-bi-basics-helpers.js. */
- `cartesianChartCircles`
- `changeBinningForDimension` — Port of H.changeBinningForDimension: hover the dimension row, click its

## models.ts
- `modal` — Port of H.modal(). */
- `tableInteractive` — Port of H.tableInteractive(). */
- `openQuestionActions` — Port of H.openQuestionActions: the ellipsis menu in the QB header. */
- `summarize` — Port of H.summarize({ mode }): the sum icon in the notebook action toolbar,
- `selectFromDropdown` — Port of selectFromDropdown (models helpers): clicks an option in the
- `waitForDataset` — POST /api/dataset response — the wait behind H's "@dataset" alias. */
- `visitModel` — Port of H.visitModel (hasDataAccess variant): visit the model page and wait
- `runNativeQuery` — Port of H.runNativeQuery: click the play button in the native editor, wait
- `createNativeModel` — Port of H.createNativeQuestion({ type: "model", ... }). Mirrors the Cypress

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
- `createSnippet` — Port of H.createSnippet (api/createSnippet.ts). */
- `clearNativeEditor` — Port of H.NativeEditor.clear(): focus, select all, backspace. Lives here
- `assertTableRowsCount` — Port of H.assertTableRowsCount: some rows rendered (virtualization makes

## native-filters-extras.ts
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
- `icon` — Port of cy.icon (e2e/support/commands/ui/icon.ts). */
- `adhocQuestionHash` — Port of adhocQuestionHash (e2e/support/helpers/e2e-ad-hoc-question-helpers.js).
- `visitQuestionAdhoc` — Port of H.visitQuestionAdhoc, minus the notebook mode and the native

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

## ui.ts
- `popover` — Matches all visible popovers (like the Cypress helper). With a single
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

## wave7-filters-admin.ts
- `OAUTH_REDIRECT_URI`
- `registerOauthClient` — Register a dynamic client via `POST /oauth/register`, creating a
- `approveOauthClient`
- `denyOauthClient`
- `caseSensitiveSubstring` — Case-sensitive substring matcher for `filter({ hasText })` — Cypress-style

## worker-backend.ts
- `startWorkerBackend`
