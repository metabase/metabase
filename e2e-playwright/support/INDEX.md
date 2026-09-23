# Helper index (generated — do not edit; run scripts/build-helper-index.mjs)

## actions-in-object-detail-view.ts
- `createModelFromTableName` — Port of H.createModelFromTableName (e2e-qa-databases-helpers.js).
- `isGetModelActions` — cy.intercept("GET", "/api/action?model-id=*") — never awaited upstream. */
- `isExecuteAction` — cy.intercept("POST", "/api/action/&ast;/execute"). */
- `isPrefetchValues` — cy.intercept("GET", "/api/action/&ast;/execute?parameters=*"). */
- `recordAlias` — `cy.wait("@alias")` pops the next UNCONSUMED response from a queue that
- `waitForAlias` — Port of `cy.wait("@alias")` — pops the next unconsumed response. */
- `actionForm` — cy.findByTestId("action-form"). */
- `objectDetailModal` — cy.findByTestId("object-detail"). */
- `actionExecuteModal` — cy.findByTestId("action-execute-modal"). */
- `deleteObjectModal` — cy.findByTestId("delete-object-modal"). */
- `actionsMenu` — cy.findByTestId("actions-menu"). */
- `tableInteractive` — Port of H.tableInteractive(): cy.findByTestId("table-root"). */
- `undoToastList` — Port of H.undoToastList(): cy.findAllByTestId("toast-undo"). */
- `openUpdateObjectModal` — Port of the spec-local openUpdateObjectModal. */
- `openDeleteObjectModal` — Port of the spec-local openDeleteObjectModal. */
- `assertActionsDropdownExists` — Port of the spec-local assertActionsDropdownExists.
- `assertActionsDropdownNotExists` — Port of the spec-local assertActionsDropdownNotExists. */
- `assertInputValue` — Port of the spec-local assertInputValue.
- `assertDateInputValue` — Port of the spec-local assertDateInputValue:
- `assertScoreFormPrefilled` — Port of the spec-local assertScoreFormPrefilled. */
- `assertToast` — Port of the spec-local assertSuccessfullUpdateToast /
- `closeObjectDetailModal` — Port of `objectDetailModal().icon("close").click()`. */

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

## actions-reproductions.ts
- `actionButtonContainer` — Port of the file-level `actionButtonContainer()`
- `dashCard` — Port of the file-level `dashCard()`:
- `scrollHeightOf` — `el.scrollHeight`, read inside the browser. */
- `setupBasicActionsInModel` — Port of the file-level `setupBasicActionsInModel()`:
- `getTable` — Port of H.getTable({ databaseId, name })
- `createModelFromTable` — Port of H.createModelFromTableName (e2e-qa-databases-helpers.js), returning
- `appendToInput` — Type into a text input the way Cypress's `.type()` does on a pre-filled

## ad-hoc-question.ts
- `openTable` — Port of H.openTable: open a table as an ad-hoc question in simple or notebook
- `openProductsTable` — Port of H.openProductsTable. */
- `openOrdersTable` — Port of H.openOrdersTable. */
- `openPeopleTable` — Port of H.openPeopleTable. */
- `openReviewsTable` — Port of H.openReviewsTable. */

## add-initial-data.ts
- `CSV_FILE` — The CSV payload every upload test in this spec uses. Upstream builds it
- `addDataModal` — Port of the spec-local `addDataModal()`. */
- `getTab` — Port of the spec-local `getTab(tab)`.
- `openTab` — Port of the spec-local `openTab(tab)`. */
- `openAddDataModalFromSidebar` — Port of the spec-local `openAddDataModalFromSidebar()`.
- `sidebarSectionButton` — `navigationSidebar().findByRole("section", { name }).findByLabelText(label)`.
- `frameNavigationSidebar` — Frame-scoped twin of `ui.ts navigationSidebar` / `sidebarSection`, for the
- `frameSidebarSection`
- `expectAnyContains` — Port of `cy.findAllByRole("option").should("contain", text)`.
- `expectNoneContains` — Port of `.and("not.contain", text)` on a multi-element subject: the
- `expectPathname` — Port of `cy.location("pathname").should("eq", …)` / `cy.location("search")`.
- `expectSearch`
- `dropFileOn` — Port of `cy.selectFile(payload, { action: "drag-drop" })` onto the

## admin-databases.ts
- `SAMPLE_DB_ID` — Mirrors e2e/support/cypress_data.js. */
- `WRITABLE_DB_ID`
- `QA_MYSQL_PORT`
- `QA_MONGO_PORT`
- `QA_POSTGRES_PORT`
- `button` — Port of `cy.button(name)` (e2e/support/commands/ui/button.ts):
- `typeAndBlurUsingLabel` — Deliberately NOT reusing `database-routing-admin.typeAndBlurUsingLabel`:
- `labeled` — `findByLabelText` semantics: exact for strings, regex passed through. */
- `toggleFieldWithDisplayName` — Port of the spec-local `toggleFieldWithDisplayName`:
- `selectFieldOption` — Port of the spec-local `selectFieldOption(fieldName, option)`:
- `chooseDatabase` — Port of the spec-local `chooseDatabase`. */
- `editDatabase` — Port of the module-level `editDatabase()` at the bottom of the spec. */
- `fieldInfoIcon` — The `info` tooltip icon inside a labelled field's input wrapper.
- `visitDatabase` — Port of `visitDatabase(id)` (e2e/test/scenarios/admin/helpers/e2e-database-helpers.js):
- `ResponseRecorder` — - `waitForDbSync` calls `cy.wait("@getDatabases")` in a loop, so a
- `waitForDbSync` — Port of `waitForDbSync(maxRetries = 10)`: consume `@getDatabases` responses
- `pathnameIs` — `(url) => url.pathname === path` — the common recorder/route matcher. */
- `pathnameMatches` — `(url) => regex.test(url.pathname)` — for the `/api/database/*` globs. */
- `patchJsonResponse` — Patch a JSON response in flight — the port of
- `expectConcatenatedTextToContain` — Port of `cy.findAllByTestId(x).should("contain.text", y)` on a MULTI-element

## admin-datamodel-reproductions.ts
- `getFieldNameInput` — Port of DataModel.FieldSection.getNameInput()
- `waitForFieldSyncToFinish` — Port of the spec-local `waitForFieldSyncToFinish`: poll `GET /api/field/:id`
- `isScrollableVertically` — Port of H.isScrollableVertically (e2e-ui-elements-overflow-helpers.js),
- `closestListSection` — `closest("[data-element-id=list-section]")` for the column-picker rows.
- `clickPickerOption` — Click an option inside a picker popover, scrolling the list until the row is

## admin-datamodel.ts
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js). */
- `tablePicker` — Port of H.DataModel.TablePicker.get(). */
- `getSyncOptionsButton` — Port of DataModel.TableSection.getSyncOptionsButton(). */
- `getSortDoneButton` — Port of DataModel.TableSection.getSortDoneButton(). */
- `waitForDataset` — POST /api/dataset — the spec's `@dataset` alias. */
- `waitForTablesUpdate` — PUT /api/table — the spec's `@updateTables` alias (bulk visibility). */
- `waitForUpdateFieldOrder` — PUT /api/table/:id/fields/order — the spec's `@updateFieldOrder` alias. */
- `waitForUpdateFieldDimension` — POST /api/field/:id/dimension — the spec's `@updateFieldDimension` alias. */
- `tableRowButton` — Port of `TablePicker.getTable(name).button(label)`. `cy.button` is
- `clickTableRowButton`
- `verifyToastAndUndo` — Port of the spec-local verifyToastAndUndo.
- `verifyTablesVisible` — Port of the spec-local verifyTablesVisible: each named table row carries a
- `verifyTablesHidden` — Port of the spec-local verifyTablesHidden. Upstream asserts
- `foreignWritableSchemas` — `Schema A`…`Schema Z` behind for everyone.
- `turnTableVisibilityOff` — Port of the spec-local turnTableVisibilityOff. */
- `setDataModelPermissions` — Port of the spec-local setDataModelPermissions. */

## admin-extras.ts
- `seedSecurityAdvisories` — Nuke all existing security advisories and insert the provided ones. */
- `deleteToken` — Port of H.deleteToken (e2e-token-helpers.ts). */
- `mockSessionProperty` — Port of H.mockSessionProperty: fetch the real /api/session/properties
- `configureSmtpSettings` — Stand-in for H.setupSMTP: the Cypress helper PUTs /api/email, which
- `pressDownloadDiagnosticsShortcut` — The "Download diagnostics" shortcut is tinykeys "$mod+f1"
- `downloadDiagnosticInfo` — Port of the error-reporting spec's getDiagnosticInfoFile: click Download in

## admin-people.ts
- `ALL_USERS` — Port of USERS (e2e/support/cypress_data.js). The Playwright
- `TOTAL_USERS` — `Object.entries(USERS).length` in the Cypress spec. */
- `USER_GROUPS` — Port of USER_GROUPS — `Object.entries(USER_GROUPS).length` is TOTAL_GROUPS. */
- `TOTAL_GROUPS`
- `getFullName` — Port of H.getFullName. */
- `userRow` — The `<tr>` containing the given full name. The `has:` text locator is built
- `showUserOptions` — Port of showUserOptions: open the row's ellipsis menu. */
- `clickButton` — Port of clickButton: `cy.button(name).should("not.be.disabled").click()`.
- `assertTableRowsCount` — Port of assertTableRowsCount.
- `generateUsers` — Port of generateUsers: `count` users created straight through the API. */
- `generateGroups` — Port of generateGroups. */
- `removeUserFromGroup` — Port of removeUserFromGroup: click the row's close icon. */
- `setupGoogleAuth` — Port of setupGoogleAuth. */
- `assertLinkMatchesUrl` — Port of assertLinkMatchesUrl. */
- `confirmLosingAbilityToManageGroup` — Port of the group-managers describe's confirmLosingAbilityToManageGroup.
- `toggleUserTypeInRow` — The membership-type toggle inside a `GroupMembersTable` row is wrapped in a

## admin-permissions.ts
- `ADMIN_GROUP` — Mirrors USER_GROUPS (e2e/support/cypress_data.js) — fixed ids baked into
- `COLLECTION_GROUP`
- `DATA_GROUP`
- `READONLY_GROUP`
- `NOSQL_GROUP`
- `modifyPermission` — Port of H.modifyPermission (e2e-permissions-helpers.js): open the row's
- `assertSidebarItems` — Port of H.assertSidebarItems: the sidebar's menuitems have exactly these
- `assertPermissionOptions` — Port of H.assertPermissionOptions: the open permission popover shows exactly
- `mockSessionPropertiesMerging` — Port of the split-permission tests' `cy.intercept("/api/session/properties",

## admin-reproductions.ts
- `SAMPLE_DB_ID` — Mirrors e2e/support/cypress_data.js */
- `WRITABLE_DB_ID`
- `segmentEditorPopover` — Port of H.segmentEditorPopover (e2e-ui-elements-helpers.js:605):
- `setPickerStartingFrom` — Port of H.relativeDatePicker.setStartingFrom (e2e-relative-date-picker-helpers.js).
- `scopeWritableDbToPublicSchema` — all of them (37 tables), which makes the data mini-picker insert a SCHEMA
- `waitForSyncToFinish` — reports `initial_sync_status === "complete"`, giving up after 40 iterations.

## admin-settings.ts
- `unpinSiteUrl` — validation under test (`metabase.system.settings/normalize-site-url`,
- `waitForSetting` — The `waitForResponse` side of a `cy.intercept(...).as(alias)` +
- `expectDisplayValue` — `cy.findByDisplayValue(value)` used as an ASSERTION (upstream calls it with
- `expectNoDisplayValue` — The retrying negative of expectDisplayValue. */
- `mockBillingTokenFeatures` — Port of the spec-local `mockBillingTokenFeatures`: stub the token-status
- `setFirstWeekDayTo` — Port of the spec-local setFirstWeekDayTo. */

## admin-tools-help.ts
- `mockSessionPropertiesTokenFeatures` — Port of H.mockSessionPropertiesTokenFeatures: intercept GET
- `executeCreateGrantAccessFlow` — Port of the spec-local executeCreateGrantAccessFlow: open the grant-access

## admin-tools.ts
- `createMockTask` — Port of createMockTask (metabase-types/api/mocks/task.ts). */
- `formatTimestamp` — The FE formats downloaded-log timestamps with `dayjs(ts).format()`
- `getFilterByRun`
- `getFilterByStartedAt`
- `getFilterByEntity`
- `getFilterByStatus`
- `selectStartedAt` — Port of the spec-local selectStartedAt. */
- `assertFilterByEntityTooltipText` — Port of the spec-local assertFilterByEntityTooltipText. The Cypress version
- `createErroringQuestion` — Port of `H.createNativeQuestion(details, { loadMetadata: true })` for a
- `fixQuestion` — Port of the erroring-questions describe's fixQuestion. */
- `selectQuestion` — Port of the erroring-questions describe's selectQuestion. */

## admin.ts
- `getSamlCertificate` — Port of getSamlCertificate() from e2e/test/scenarios/admin-2/sso/shared/helpers.js. */
- `setupSaml` — Port of setupSaml() from e2e/test/scenarios/admin-2/sso/shared/helpers.js. */
- `isOssBackend` — Whether the backend is an OSS build (version tags are v0.x for OSS, v1.x

## ai-controls.ts
- `TINY_PNG_BASE64`
- `TINY_PNG_DATA_URI`
- `MOCK_LLM_RESPONSE`
- `DEFAULT_QUOTA_MESSAGE`
- `ALL_USERS_GROUP_ID` — Port of ALL_USERS_GROUP / ADMIN_GROUP (e2e/support/cypress_data.js). */
- `ADMIN_GROUP_ID`
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
- `startMockLlmServer` — Start a mock server impersonating the Anthropic Messages API on an ephemeral
- `configureMockLlm` — Point the backend at the mock server (mirrors `llmMockServerSetup`). Setting
- `visitHomeAndWaitForXray` — Register the xray-candidates wait, navigate home, await it (PORTING rule 2). */
- `signInViaCookie` — `mb.api` call would silently run as this user, and `mb.signInAsAdmin()`
- `typeAndBlur` — Port of H.typeAndBlurUsingLabel for the admin settings text inputs: `fill`

## alert-permissions.ts
- `ADMIN_FULL_NAME`
- `NORMAL_FULL_NAME`
- `directTextContaining` — which testing-library's `getNodeText` does not — it reads only direct child
- `createBasicAlert` — - `cy.findByText("Done")` → `getByRole("button", …)`. Under Playwright the
- `createSetupHarness` — has to drive the UI needs its own context. `browser` and the custom

## alert-types.ts
- `multiSeriesQuestionWithGoal` — Port of the spec's module-level `multiSeriesQuestionWithGoal`.
- `waitForChannels` — `cy.wait("@channel")`.
- `waitForAlertSave` — Port of `cy.intercept("POST", "/api/notification").as("updateAlert")` +

## alert.ts
- `isWebhookTesterRunning` — Availability probe for the `@external` webhook describe. Same shape as the
- `addEmailRecipient` — - `cy.type()` clicks its subject first, so the click is explicit here, and
- `setAllowedDomains` — Port of the EE describe's spec-local `setAllowedDomains`. */

## api-keys.ts
- `ADMINISTRATORS_GROUP_ID` — Fixed group ids from the `default` snapshot — mirrors USER_GROUPS
- `ALL_USERS_GROUP_ID`
- `READONLY_GROUP_ID`
- `NOSQL_GROUP_ID`
- `waitForCreateKey`
- `waitForGetKeys`
- `waitForGetKeyCount`
- `waitForUpdateKey`
- `waitForRegenerateKey`
- `waitForDeleteKey`
- `createApiKey` — Port of H.createApiKey: POST /api/api-key as the current (admin) user.
- `visitApiKeySettings` — Port of the spec-local visitApiKeySettings: navigate to the API-keys admin
- `tryToCreateApiKeyViaModal` — Port of H.tryToCreateApiKeyViaModal. Fills the create modal, picks the group
- `apiKeyRow` — The row in the API-keys table that contains the given key name. */
- `createQuestionForApiKey` — Port of createQuestionForApiKey. */
- `createDashboardForApiKey` — Port of createDashboardForApiKey. */
- `editQuestionForApiKey` — Port of editQuestionForApiKey: GET the card, then PUT it back renamed. */
- `editDashboardForApiKey` — Port of editDashboardForApiKey: GET the dashboard, then PUT it back renamed. */

## api.ts
- `MetabaseApi` — HTTP client mirroring cy.request semantics: requests run as the currently
- `resolveToken`

## application-permissions.ts
- `SETTINGS_INDEX` — Column indices in the application-permissions table
- `MONITORING_INDEX`
- `SUBSCRIPTIONS_INDEX`
- `createSubscription` — Port of the spec-local createSubscription(user_id): create a question on a
- `notificationsList` — cy.findByTestId("notifications-list"). */

## bar-chart.ts
- `getValueLabels` — Port of H.getValueLabels (e2e-visual-tests-helpers.js): the ECharts data
- `otherSeriesChartPaths` — Port of H.otherSeriesChartPaths (e2e-visual-tests-helpers.js): the grouped
- `expectChartPathVisible` — Port of `H.chartPathWithFillColor(color).should("be.visible")`. `.should(

## binning-longitude.ts
- `LONGITUDE_OPTIONS` — Longitude slice of shared/constants.js LONGITUDE_OPTIONS. */
- `openPopoverFromDefaultBucketSize` — Port of openPopoverFromDefaultBucketSize (e2e-notebook-helpers.ts). The
- `assertAxisLabels` — Port of assertOnXYAxisLabels: the ECharts container renders `<text>` nodes
- `assertXAxisTicks` — Port of assertOnXAxisTicks: each representative value appears as an axis tick.

## binning-reproductions.ts
- `createNativeQuestionWithMetadata` — Port of `H.createNativeQuestion(details, { loadMetadata: true })`: the
- `pickSavedQuestion` — The exact "New question" flow these repros depend on: open the mini picker,
- `clickBreakoutOptionLeft` — Port of `H.popover().findByRole("option", { name }).click({ position: "left" })`:
- `openTemporalBucketFromGroupBy` — The temporal-bucket button revealed on hover inside the notebook group-by

## binning-time-series.ts
- `TIME_OPTIONS` — Port of TIME_OPTIONS (binning/correctness/shared/constants.js). */
- `openPopoverFromDefaultBucketSize` — Port of the spec-local openPopoverFromDefaultBucketSize: assert the
- `assertOnHeaderCells` — Port of the spec-local assertOnHeaderCells: the first two header cells are
- `assertOnTableValues` — Port of the spec-local assertOnTableValues: each representative value appears
- `assertOnTimeSeriesFooter` — Port of the spec-local assertOnTimeSeriesFooter: the footer filter button is

## binning.ts
- `chartPathWithFillColor` — Port of H.chartPathWithFillColor. */
- `getDimensionByName` — Port of getDimensionByName: dimension rows filtered by (optionally)
- `getBinningButtonForDimension` — Port of H.getBinningButtonForDimension: the binning button only renders on
- `changeBinningForDimension` — Port of H.changeBinningForDimension: open the dimension's binning popover

## bookmarks-extras.ts
- `openCollectionItemMenu` — Port of H.openCollectionItemMenu: `.findAllByText(item).eq(index)` — the

## boxplot.ts
- `getBoxes` — Port of H.BoxPlot.getBoxes(): the box <path>s (translucent fill + stroke). */
- `getPoints` — Port of H.BoxPlot.getPoints(): the outlier / all-points circle markers. */
- `getMeanMarkers` — Port of H.BoxPlot.getMeanMarkers(): the diamond mean markers. */
- `triggerMousemoveLeft` — Port of Cypress `.trigger("mousemove", "left")` on a box <path>: a synthetic
- `clickLeft` — Port of Cypress `.click("left")`: a real click on the left side of a box
- `hoverChartTop` — Port of `H.echartsContainer().realHover({ position: "top" })`: move the real

## browse.ts
- `verifiedFilterToggleButton` — Port of the spec-local verifiedFilterToggleButton:
- `recentsGrid` — Port of the EE describe's recentsGrid: findByRole("grid", { name: "Recents" }). */
- `modelsTable` — Port of the EE describe's modelsTable: findByRole("table", { name: "Table of models" }). */
- `modelHeading` — modelsTable().findByRole("heading", { name }). */
- `modelRow` — modelsTable().findByRole("row", { name: /Model N/i }). */
- `recentModel` — recentsGrid().findByText(name). */
- `verifyModel` — Port of the spec-local verifyModel: verify the currently-open model and wait
- `unverifyModel` — Port of the spec-local unverifyModel. */
- `toggleVerificationFilter` — Port of the spec-local toggleVerificationFilter: flip the header switch and
- `waitForUpdateVerification` — Port of the @updateVerification intercept: POST /api/moderation-review. */
- `waitForUpdateFilter` — Port of the @updateFilter intercept: PUT /api/setting/browse-filter-only-verified-models. */

## card-embed-node.ts
- `DOCUMENT_WITH_TWO_CARDS`
- `DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS`
- `flexContainers` — All flexContainers in the document body, in DOM order. */
- `flexContainer` — The (single) flexContainer in the document body. */
- `dragAndDropCardOnAnotherCard` — Port of H.dragAndDropCardOnAnotherCard → documentsDragAndDrop. Replays the
- `documentUndo` — Port of H.documentUndo: focus the editor and press cmd/ctrl+z. Assert the
- `assertFlexContainerCardsOrder` — Port of the spec-local assertFlexContainerCardsOrder. `scope` is the
- `addNewStandaloneCard` — no re-render races the interaction.
- `getCardWidths` — Port of the spec-local getCardWidths: the content-box widths of each named
- `expectCloseTo` — Chai's `closeTo(expected, delta)`: |actual - expected| <= delta. */
- `selectCardEmbedFromTop` — Port of `H.getDocumentCard(name).realClick({ position: "top" })`: click the
- `expectCapturedAnchor` — Assert the anchor captured by captureNextAnchorClick: href matches a regex,
- `createReviewsTextWrapModel` — Port of the text-wrapping test's inline H.createQuestion({ type: "model" })

## cc-boolean-functions.ts
- `EXPRESSION_NAME` — The custom-column expression name asserted throughout the spec. */
- `dashboardQuestionDetails` — Port of the dashboards describe's `questionDetails`: a People question with a
- `parameterDetails` — Port of the spec's `parameterDetails`. */
- `dashboardDetails` — Port of the spec's `dashboardDetails`. */
- `createDashboardWithQuestion` — Port of the spec-local createDashboardWithQuestion: create the dashboard

## cc-fields.ts
- `addCustomColumn` — Port of H.addCustomColumn (e2e-bi-basics-helpers.js → initiateAction):

## cc-literals.ts
- `addCustomColumns` — Port of the spec's module-level addCustomColumns: add each custom column
- `removeTableFields` — Port of the "literals in custom columns" test's local removeTableFields:
- `testFilterLiteral` — Port of the "literals in filters" test's local testFilterLiteral: add a

## cc-shortcuts-combine.ts
- `selectCombineColumns` — Port of the spec-local selectCombineColumns. findByText string is exact. */
- `selectColumn` — Port of the spec-local selectColumn(index, table, name?): click the index-th
- `addColumn` — Port of the spec-local addColumn. findByText string is exact. */

## cc-typing-suggestion.ts
- `addCustomColumn` — Port of the spec-local addCustomColumn:
- `typeExpression` — Escape-aware CodeMirror type() — the pieces of H.CustomExpressionEditor.type
- `enterCustomColumnDetails` — Port of H.enterCustomColumnDetails — but escape-aware (the shared notebook.ts
- `blurEditor` — Port of the CustomExpressionEditor.blur() from the codeMirror helper: click
- `helpText` — Port of H.CustomExpressionEditor.helpText() (testid "expression-helper"). */
- `helpTextHeader` — Port of H.CustomExpressionEditor.helpTextHeader()
- `acceptCompletion` — Port of H.CustomExpressionEditor.acceptCompletion(key): the completions popup
- `completionsListbox` — The ul[role=listbox] inside the completions popover — the target of
- `verifyHelptextPosition` — Port of the spec-local verifyHelptextPosition: the help-text popover's left

## chart-drill.ts
- `pieSliceWithColor` — Port of H.pieSliceWithColor (e2e-visual-tests-helpers.js): the pie/donut
- `brushChart` — Port of the spec's `cy.findByTestId("query-visualization-root")

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

## click-behavior-reproductions.ts
- `createMockActionParameter` — Port of createMockActionParameter (metabase-types/api/mocks/actions.ts),

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
- `createDashboardWithTabsLocal` — Port of the spec's createDashboardWithTabsLocal (also covers the one
- `tabSlugMap` — Build the `${tabId}-${tabName}` slug map keyed by tab name. */
- `captureNextAnchorClick` — Port of H.onNextAnchorClick: the frontend opens external URLs by creating
- `expectCapturedAnchor`
- `verifyNotebookQuery`
- `createMultiStageQuery`

## collection-picker-tenants.ts
- `createNewCollectionFromHeader` — Port of the repeated
- `selectSharedCollectionInPicker` — Navigate the open entity picker into the tenant root ("Shared collections"),

## collections-cleanup.ts
- `STATIC_ORDERS_ID` — The ORDERS table's static (snapshot-stable) id — mirrors
- `getCollectionActions` — Port of H.getCollectionActions (e2e-collection-helpers.ts). */
- `collectionMenu` — Port of the spec-local collectionMenu: the collection-actions ellipsis. */
- `cleanUpModal` — Port of the spec-local cleanUpModal (findAllByTestId — .first() as scope). */
- `closeCleanUpModal` — Port of the spec-local closeCleanUpModal. */
- `recursiveFilter` — Port of the spec-local recursiveFilter (the sub-collections switch). */
- `dateFilter` — Port of the spec-local dateFilter. */
- `pagination` — Port of the spec-local pagination. */
- `emptyState` — Port of the spec-local emptyState. */
- `errorState` — Port of the spec-local errorState. */
- `selectCleanThingsUpCollectionAction` — Port of the spec-local selectCleanThingsUpCollectionAction. */
- `setDateFilter` — Port of the spec-local setDateFilter. findByText is exact. */
- `selectAllItems` — Port of the spec-local selectAllItems: click every per-row select cell.
- `moveToTrash` — Port of the spec-local moveToTrash: the bulk-action toast's button. */
- `assertNoPagination` — Port of the spec-local assertNoPagination. */
- `assertStaleItemCount` — Port of the spec-local assertStaleItemCount. */
- `bulkCreateQuestions` — Port of the spec-local bulkCreateQuestions: `amount` model-type questions
- `bulkCreateDashboards` — Port of the spec-local bulkCreateDashboards: "Bulk dashboard N". */
- `makeItemStale` — Port of makeItemStale: POST /api/testing/mark-stale to set an entity's
- `makeItemsStale` — Port of makeItemsStale: mark each id stale in sequence. */
- `seedMainTestData` — Port of the spec-local seedMainTestData. Builds a "Clean up test" collection
- `createCollectionViaApi` — Port of H.createCollection (api/createCollection.ts), the subset used here. */

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

## collections-permissions.ts
- `USER_FULL_NAMES` — First/last names from e2e/support/cypress_data.js — that file is untyped JS
- `personalCollectionName` — `${first_name} ${last_name}'s Personal Collection` for a snapshot user. */
- `clickButton` — Port of the spec-local clickButton: assert the button is enabled, then click.
- `pinItem` — Port of the spec-local pinItem: open the row menu, click the pin icon. */
- `move` — Port of the spec-local move(item): trash-free move of a root item into
- `duplicate` — Port of the spec-local duplicate(item). */
- `archiveUnarchive` — Port of the spec-local archiveUnarchive(item, expectedEntityName): trash a
- `waitForCollectionGraph` — GET /api/collection/graph — the Cypress "@permissionsGraph" alias. */
- `waitForPermissionsGroups` — GET /api/permissions/group — the Cypress "@permissionsGroups" alias. */
- `collectionRow` — The row whose exact-text cell equals `item` (for hover/checkbox probes). */

## collections-reproductions.ts
- `ORDERS_COUNT_QUESTION_ID` — Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */

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

## collections-uploads.ts
- `FIXTURE_DIR` — Port of FIXTURE_PATH from e2e-upload-helpers.js. Cypress resolves it through
- `VALID_CSV_FILES` — Port of VALID_CSV_FILES (e2e/support/helpers/e2e-upload-helpers.js). */
- `INVALID_CSV_FILES` — Port of INVALID_CSV_FILES. */
- `enableUploads` — Port of H.enableUploads(dialect). Note it points uploads at WRITABLE_DB_ID
- `fixturePayload` — The bytes + metadata Playwright's `setInputFiles` wants for a fixture. */
- `waitForUpload` — Port of rule 2 for the upload endpoints: registered BEFORE the triggering
- `statusRoot`
- `uploadFile` — Port of H.uploadFile(inputId, collectionName, testFile, uploadMode).
- `uploadFileToCollection` — Port of the spec-local `uploadFileToCollection(testFile, viewModel = true)`.
- `uploadToExisting` — Port of the spec-local `uploadToExisting({...})`. */
- `headlessUpload` — Port of H.headlessUpload(collectionId, file).
- `expectCsvUploadEvent` — `csvupload` events are **backend-emitted** (`src/metabase/upload/impl.clj`
- `queryQaDB`
- `foreignWritableSchemasWithTables` — `writable_db` has only an empty `public` (never synced, no tables) plus
- `listUploadTables` — Tables this spec's uploads created, in one schema of one database. */
- `dropUploadTables`

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

## column-extract-drill.ts
- `extractColumnAndCheck` — - `H.tableHeaderClick(column)` opens the column click-actions popover.

## column-shortcuts.ts
- `extractColumnAndCheck` — Port of the spec-local extractColumnAndCheck. */
- `combineColumns` — Port of the spec-local combineColumns. */

## combine-column-drill.ts
- `peopleIdEmailQuestionDetails` — The shared question both tests visit: PEOPLE limited to ID + Email, so the
- `openCombineColumnsFromHeader` — Open the Combine-columns editor from a table column header: click the header

## command-palette.ts
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
- `mockDashboardCard` — Local stand-in for createMockDashboardCard (metabase-types/api/mocks):
- `createDocument` — Local stand-in for createMockDocument + cy.request("POST", "/api/document"):
- `modifyPermission` — Port of H.modifyPermission (e2e-permissions-helpers.js): click the
- `saveChangesToPermissions` — Port of H.saveChangesToPermissions. */

## content-translation-dashboards.ts
- `waitForEmbedDashboard` — The `@dashboard` alias: GET /api/embed/dashboard/:token (top-level only). */
- `waitForEmbedCard` — The `@cardQuery` alias: GET /api/embed/dashboard/.../card/... */
- `waitForEmbedSearch` — The `@searchQuery` alias: GET /api/embed/dashboard/.../search/... */
- `getCSVWithHeaderRow` — Port of getCSVWithHeaderRow (e2e-content-translation-helpers.ts). */
- `uploadTranslationDictionaryViaAPI` — Port of H.uploadTranslationDictionaryViaAPI: sign in as admin and POST the
- `germanFieldNames`
- `germanFieldValues`
- `frenchNames`
- `frenchBooleanTranslations`
- `getDashboardTabDetails` — Port of H.getDashboardTabDetails. */
- `getHeadingCardDetails` — Port of H.getHeadingCardDetails (threads col + dashboard_tab_id). */
- `getTextCardDetails` — Port of H.getTextCardDetails (threads col + dashboard_tab_id). */

## content-translation-upload-and-download.ts
- `nonAsciiFieldNames`
- `portugueseFieldNames`
- `invalidLocaleXX`
- `multipleInvalidLocales`
- `stringTranslatedTwice`
- `selectDictionaryFile` — Drive the hidden CSV file input and confirm the replace-dictionary dialog,
- `uploadTranslationDictionary` — Port of the spec-local uploadTranslationDictionary: sign in as admin (the
- `assertOnlyTheseTranslationsAreStored` — Port of the spec-local assertOnlyTheseTranslationsAreStored: sign a guest JWT
- `generateLargeCSV` — Port of the spec-local generateLargeCSV. */

## create-queries.ts
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
- `NATIVE_QUERIES_PERMISSION_INDEX` — The spec's NATIVE_QUERIES_PERMISSION_INDEX (the create-queries column). */
- `permissionTable` — Port of cy.findByTestId("permission-table"). */
- `getPermissionRowPermissions` — Port of getPermissionRowPermissions: the `permissions-select` cells for the
- `selectPermissionRow` — Port of H.selectPermissionRow: click the row's permission-index-th cell. */
- `selectSidebarItem` — Port of H.selectSidebarItem: cy.findAllByRole("menuitem").contains(item) —
- `assertPermissionTable` — Port of H.assertPermissionTable: assert the tbody row count, then every
- `drillIntoDatabaseRow` — Port of cy.findByTextEnsureVisible("Sample Database").click() used to drill

## custom-column-1.ts
- `typeSnippet` — The subtlety this bridges: driving the arg text with `page.keyboard.type`
- `addCustomColumnByLabel` — Port of the repeated `cy.findByLabelText("Custom column").click()` (the
- `formatButton` — Port of H.CustomExpressionEditor.formatButton(): cy.findByLabelText(
- `pressFormatShortcut` — Port of the format keyboard shortcut (Shift + $mod + f) upstream fires with
- `removeNotebookClauseByText` — Port of `H.getNotebookStep(step).findByText(name).icon("close").click()`:

## custom-column-2.ts
- `helpTextHeader` — Port of H.CustomExpressionEditor.helpTextHeader(). */
- `helpText` — Port of H.CustomExpressionEditor.helpText(). */
- `completions` — Port of H.CustomExpressionEditor.completions(): the suggestion dropdown. */
- `completionOptions` — The `role="option"` rows inside the suggestion dropdown.
- `selectCompletion` — Port of H.CustomExpressionEditor.selectCompletion(name):
- `typeInExpressionEditor` — Port of H.CustomExpressionEditor.type()'s escape-sequence handling for the
- `blurExpressionEditor` — Port of H.CustomExpressionEditor.blur().
- `enterCustomColumnDetails` — Port of H.enterCustomColumnDetails, with the escape-sequence-aware type()

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

## custom-column-reproductions-1.ts
- `resetColorsTable` — Port of H.resetTestTable({ type: "postgres", table: "colors27745" })
- `syncWritableDbAndWaitForTable` — Upstream fires `POST /api/database/:id/sync_schema` and never waits for it —
- `pasteIntoExpressionEditor` — Port of H.CustomExpressionEditor.paste(content): the upstream builds a
- `typeInEditor` — set this spec uses ({end}/{home}/{leftarrow}/{rightarrow}/{uparrow}/
- `enterCustomColumnDetails` — Port of H.enterCustomColumnDetails — escape-aware (see typeInEditor) and
- `blurExpressionEditor` — Port of H.CustomExpressionEditor.blur(): the upstream clicks the
- `focusedElement` — The element `cy.focused()` would resolve to. */
- `previewExpressionStep` — Port of the spec-local previewCustomColumnNotebookStep (issue 21135): click
- `unselectFieldsPickerColumn` — Port of the spec-local unselectColumn (issue 20229):
- `acceptCompletionWith` — Port of H.CustomExpressionEditor.acceptCompletion(key): assert the popup is
- `selectedCompletion` — The `[role=option][aria-selected=true]` row of the completions popup. */

## custom-column-reproductions-2.ts
- `dispatchClick` — clicks whatever is topmost at those coordinates (PORTING).
- `focusEditor` — Port of `H.CustomExpressionEditor.focus()`. The upstream is
- `clearEditor` — Port of `H.CustomExpressionEditor.clear()` on top of focusEditor. */
- `typeExpression` — `H.CustomExpressionEditor.type(text)` with the default `focus: true`, using
- `enterExpressionDetails` — Port of `H.enterCustomColumnDetails` — same clear → type → blur → name
- `blurEditor` — Port of `H.CustomExpressionEditor.blur()`: the upstream clicks the
- `fastSetExpression` — helpers.focus();
- `clickCompletion` — rather than inventing a mechanism. It is the reverse of the usual
- `expectNotScrollableHorizontally` — Port of `H.isScrollableHorizontally(element)`
- `expectNotOverflowingHorizontally` — `H.isScrollableHorizontally` infers a scrollbar from the layout height it
- `stubDocsOrigin` — Cypress can only assert `cy.url()` after a same-tab navigation, so issue

## custom-column.ts
- `customExpressionEditor` — Port of H.CustomExpressionEditor.value()'s target: the CodeMirror content
- `openTableNotebookWithLimit` — Port of H.openTable({ mode: "notebook", limit, table }). */

## custom-viz.ts
- `STATIC_ORDERS_ID` — SAMPLE_DB_TABLES.STATIC_ORDERS_ID (e2e/support/cypress_data.js). */
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js). */
- `AGGREGATED_VALUE`
- `AGGREGATED_VALUE_FORMATTED`
- `mainAppLinkText` — "Main app" / "Admin" nav labels (e2e-ui-elements-helpers.js). */
- `adminAppLinkText`
- `CUSTOM_VIZ_FIXTURE_TGZ`
- `CUSTOM_VIZ_FIXTURE_TGZ_2`
- `CUSTOM_VIZ_FIXTURE_TGZ_3_SECURITY`
- `CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT`
- `CUSTOM_VIZ_IDENTIFIER`
- `CUSTOM_VIZ_IDENTIFIER_2`
- `CUSTOM_VIZ_IDENTIFIER_3_SECURITY`
- `CUSTOM_VIZ_IDENTIFIER_4_SECURITY_COMPONENT`
- `CUSTOM_VIZ_DISPLAY` — Frontend display type: "custom:{identifier}". */
- `addCustomVizPlugin` — Port of H.addCustomVizPlugin: upload a packaged .tgz bundle and register it
- `getCustomVizFixtureHash` — Port of H.getCustomVizFixtureHash: the SHA-256 of a .tgz on disk. The chip
- `visitCustomVizSettings`
- `visitCustomVizNewForm`
- `visitCustomVizDevelopment`
- `visitCustomVizEditForm`
- `getAddVisualizationLink` — Port of H.getAddVisualizationLink. */
- `getCustomVizPluginIcon` — Port of H.getCustomVizPluginIcon: EntityIcon renders as role="img". */
- `vizTypeSidebar` — Port of H.vizTypeSidebar (e2e-viz-settings-helpers.js). */
- `dropCustomVizBundle` — Port of H.dropCustomVizBundle: drive the hidden file input. Accepts a path
- `waitForPluginBundle` — GET /api/ee/custom-viz-plugin/:id/bundle — the "@pluginBundle" alias. */
- `waitForPluginCreate` — POST /api/ee/custom-viz-plugin — the "@pluginCreate" alias. */
- `waitForPluginBundleReplace` — PUT /api/ee/custom-viz-plugin/:id/bundle — the bundle-replace aliases. */
- `drillThroughDemoVizClick`
- `buildDocumentWithCustomVizCard`
- `updateAdvancedPermissionsGraph`
- `interceptInjectedBundle` — Register a route that rewrites the plugin bundle response body via
- `interceptFailingBundle` — Register a route that fails the bundle with the given status/body (the
- `collectConsole` — Wire a collector to `page.on("console")`. Each message's args are resolved in
- `expectConsoleErrorMatch` — Port of `should("have.been.calledWithMatch", sinon.match.has("message", regex))`. */
- `expectConsoleMatch` — Like the above but matches any console channel (some membrane logs use warn). */
- `expectConsoleCalledWith` — Port of `should("have.been.calledWith", ...args)` — exact joined text. */
- `countCanaryRequests` — Count requests to the sandbox canary URL. Port of

## dashboard-back-navigation.ts
- `PG_DB_ID` — Port of the spec's `PG_DB_ID = 2`.
- `QA_DB_SKIP_REASON`
- `InterceptAlias` — 2. `cy.get("@alias.all").should("have.length", n)` counts **interceptions**,
- `datasetAlias` — `cy.intercept("POST", "/api/dataset").as("dataset")` */
- `cardAlias` — `cy.intercept("GET", "/api/card/*").as("card")` */
- `cardQueryAlias` — `cy.intercept("POST", "/api/card/*&#47;query").as("cardQuery")` */
- `updateCardAlias` — `cy.intercept("PUT", "/api/card/*").as("updateCard")` */
- `dashboardAlias` — `cy.intercept("GET", "/api/dashboard/*").as("dashboard")` — single
- `dashcardQueryAlias` — `cy.intercept("POST", "/api/dashboard/*&#47;dashcard/*&#47;card/*&#47;query")` */
- `createDashboardWithCards` — Port of the spec-local createDashboardWithCards: a question card, a text
- `createDashboardWithNativeCard` — Port of the spec-local createDashboardWithNativeCard. */
- `createDashboardWithSlowCard` — Port of the spec-local createDashboardWithSlowCard: a native QA-Postgres
- `createDashboardWithPermissionError` — Port of the spec-local createDashboardWithPermissionError: two Orders

## dashboard-card-fetching.ts
- `ORDERS_COUNT_QUESTION_ID` — Ports of ORDERS_COUNT_QUESTION_ID / ORDERS_BY_YEAR_QUESTION_ID
- `CARDS` — Port of the spec's module-level `cards` layout. */
- `collectDashcardQueryBodies` — Port of `cy.wait(["@dashcardQuery", "@dashcardQuery"])` where the test then

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

## dashboard-card-resizing.ts
- `VISUALIZATION_SIZES`
- `getMinSize`
- `getDefaultSize`
- `getTestQuestions` — The module-level TEST_QUESTIONS list. A getter, not a shared const, so the
- `resizeDashboardCard` — Port of H.resizeDashboardCard({ card, x, y }): grab the card's
- `startResizeDrag` — Port of the metabase#70451 drag: press the handle at its center, move by
- `resizeHandleCenter` — The current center of a card's resize handle (viewport coords). */

## dashboard-cards.ts
- `showDashboardCardActions` — Port of H.showDashboardCardActions (realHover → native hover). */
- `getDashboardCardMenu` — Port of H.getDashboardCardMenu — waits for the card to finish loading. */
- `inputWithValue` — Port of cy.findByDisplayValue: find the input in `scope` whose current
- `moveDnDKitElement` — Port of H.moveDnDKitElementByAlias — but with real mouse input instead of
- `moveDnDKitElementOnto` — Deterministic dnd-kit sortable move: drag `element` so its center lands

## dashboard-chained-filters.ts
- `valuesWidget` — Port of the spec-local `valuesWidget()`:
- `WRITABLE_PG_SKIP_REASON` — The gate message for the `@external` test — the writable postgres QA

## dashboard-core.ts
- `ORDERS_DASHBOARD_ENTITY_ID`
- `ORDERS_DASHBOARD_DASHCARD_ID`
- `GRID_WIDTH` — metabase/utils/dashboard_grid GRID_WIDTH — the repo import is outside
- `cachedUserName` — The harness signIn is typed to the USERS credential map, but its login
- `updateDashboardCards` — Port of H.updateDashboardCards: replaces all the cards on a dashboard
- `createCollection` — Port of H.createCollection (api/createCollection.ts), the subset used here. */
- `createDashboardWithTabs` — Port of H.createDashboardWithTabs. Delegates to the canonical factory; this
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
- `dragOnXAxis` — Port of the spec-local dragOnXAxis (mousedown → mousemove(clientX) →
- `assertScrollBarExists` — Port of the spec-local assertScrollBarExists. */
- `checkOptionsForFilter` — Port of the spec-local checkOptionsForFilter. */
- `countDashboardUpdates` — Port of the cy.spy() intercept pattern: counts PUT /api/dashboard/:id

## dashboard-drill.ts
- `sidebar` — Port of H.sidebar (e2e-ui-elements-helpers.js): `cy.get("main aside")`. */
- `createDrillQuestion` — Port of the spec-local `createQuestion(options, callback)`: POST a native
- `createDrillDashboard` — Port of the spec-local `createDashboard(...)`: create a dashboard, add a
- `createDashboardWithQuestion` — Port of the spec-local `createDashboardWithQuestion`. */
- `setParamValue` — Port of the spec-local `setParamValue(paramName, text)`: wait to leave edit
- `drillThroughCardTitle` — Port of the spec-local `drillThroughCardTitle(title)`: click the card's

## dashboard-filter-data-permissions.ts
- `filterDashboard` — The `suggests` branch mirrors the original: when a user has data access the

## dashboard-filter-defaults.ts
- `clearDefaultFilterValue` — Port of the spec-local clearDefaultFilterValue:
- `setDefaultFilterValue` — Port of the spec-local setDefaultFilterValue: open the default-value picker

## dashboard-filters-2.ts
- `ORDERS_DATE_COLUMNS`
- `ORDERS_NUMBER_COLUMNS`
- `PRODUCTS_DATE_COLUMNS`
- `PRODUCTS_TEXT_COLUMNS`
- `PRODUCTS_NUMBER_COLUMNS`
- `PEOPLE_DATE_COLUMNS`
- `PEOPLE_TEXT_COLUMNS`
- `PEOPLE_NUMBER_COLUMNS`
- `REVIEWS_DATE_COLUMNS`
- `REVIEWS_TEXT_COLUMNS`
- `REVIEWS_NUMBER_COLUMNS`
- `QUESTION_BASED_QUESTION_INDEX`
- `MODEL_BASED_QUESTION_INDEX`
- `QUESTION_BASED_MODEL_INDEX`
- `MODEL_BASED_MODEL_INDEX`
- `createBaseQuestions`
- `createQ1Query`
- `createQ3Query`
- `createQ4Query`
- `createQ5Query`
- `createQ7Query`
- `createQ8Query`
- `createAndVisitDashboardWithCardMatrix`
- `waitForDashboardData` — Resolve after `count` POST dashcard-query responses (the @dashboardData
- `waitForPublicDashboardData` — Port of waitForPublicDashboardData: `count` GET /api/public/dashboard/…
- `waitForEmbeddedDashboardData` — Port of waitForEmbeddedDashboardData: `count` GET /api/embed/dashboard/…
- `getFilter`
- `setup1stStageExplicitJoinFilter`
- `apply1stStageExplicitJoinFilter`
- `setup1stStageImplicitJoinFromSourceFilter`
- `setup1stStageImplicitJoinFromJoinFilter`
- `setup1stStageCustomColumnFilter`
- `setup1stStageAggregationFilter`
- `setup1stStageBreakoutFilter`
- `setup2ndStageExplicitJoinFilter`
- `setup2ndStageCustomColumnFilter`
- `apply2ndStageCustomColumnFilter`
- `setup2ndStageAggregationFilter`
- `apply2ndStageAggregationFilter`
- `setup2ndStageBreakoutFilter`
- `apply2ndStageBreakoutFilter`
- `verifyDashcardMappingOptions`
- `verifyNoDashcardMappingOptions`
- `assertDashcardRowsCount` — Port of H.assertTableRowsCount scoped to a dashcard — for the public /
- `verifyDashcardRowsCount`
- `goBackToDashboard`

## dashboard-filters-auto-apply.ts
- `applyFilterToast` — Port of H.applyFilterToast (cy.findByTestId("filter-apply-toast")). */
- `applyFilterButton` — Port of H.applyFilterButton (applyFilterToast().button("Apply")). */
- `cancelFilterButton` — Port of H.cancelFilterButton (applyFilterToast().button("Cancel")). */
- `assertCardRowsCount` — Card-scoped port of H.assertTableRowsCount: some rows rendered (virtualization
- `waitForCardQuery` — Register a wait for the next app dashcard-query response
- `waitForPublicCardQuery` — The public-dashboard variant of the "@cardQuery" alias
- `waitForEmbedCardQuery` — The signed-embed variant of the "@cardQuery" alias

## dashboard-filters-auto-wiring.ts
- `createDashboardWithCards` — Port of the spec-local createDashboardWithCards: create a dashboard, then
- `addCardToDashboard` — Port of the spec-local addCardToDashboard: open the questions sidebar and
- `goToFilterMapping` — Port of the spec-local goToFilterMapping: click a filter's editing widget to
- `removeFilterFromDashboard` — Port of the spec-local removeFilterFromDashboard. */
- `removeFilterFromDashCard` — Port of the spec-local removeFilterFromDashCard (the close icon on a card). */
- `getTableCell` — Port of the spec-local getTableCell: find the column index by header text,
- `addQuestionFromQueryBuilder` — Port of the spec-local addQuestionFromQueryBuilder: from the QB, add a

## dashboard-filters-boolean.ts
- `DIALECT`
- `TABLE_NAME`
- `QUESTION_NAME`
- `QUESTION_2_NAME`
- `DASHBOARD_NAME`
- `DASHBOARD_2_NAME`
- `PARAMETER_NAME`
- `COLUMN_NAME`
- `FIELD_NAME`
- `createQuestionAndDashboard` — Port of the spec-local createQuestionAndDashboard(): an MBQL question over
- `createNativeQuestionWithFieldFilterAndDashboard` — Port of the spec-local createNativeQuestionWithFieldFilterAndDashboard():
- `createNativeQuestionWithVariableAndDashboard` — Port of the spec-local createNativeQuestionWithVariableAndDashboard(): a SQL
- `createAndMapParameter` — Port of the spec-local createAndMapParameter(): add a Boolean dashboard
- `setupDashboardClickBehavior` — Port of the spec-local setupDashboardClickBehavior(): build the destination
- `testParameterWidget` — Port of the spec-local testParameterWidget().

## dashboard-filters-clear-and-restore.ts
- `mapFilterToQuestion` — Port of the spec-local mapFilterToQuestion. findByText strings are exact. */
- `editFilter` — Port of the spec-local editFilter: click a filter pill by name in the
- `editFilterType` — Port of the spec-local editFilterType: change the "Filter or parameter type"
- `setFilterSourceFromConnectedFields` — Port of the spec-local setFilterSourceFromConnectedFields. */
- `checkFilterListSourceHasValue` — Port of H.checkFilterListSourceHasValue (e2e-filter-helpers.js): open the

## dashboard-filters-date.ts
- `DASHBOARD_DATE_FILTERS` — Port of DASHBOARD_DATE_FILTERS
- `setMonthAndYear` — Port of DateFilter.setMonthAndYear. */
- `setQuarterAndYear` — Port of DateFilter.setQuarterAndYear. */
- `setSingleDate` — Port of DateFilter.setSingleDate. */
- `setTime` — Port of DateFilter.setTime.
- `setDateRange` — Port of DateFilter.setDateRange. */
- `setRelativeDate` — Port of DateFilter.setRelativeDate. */
- `setAdHocFilter` — Port of DateFilter.setAdHocFilter. */
- `dateFilterSelector` — Port of the spec-local dateFilterSelector switch: apply a filter value in the

## dashboard-filters-location.ts
- `DASHBOARD_LOCATION_FILTERS`

## dashboard-filters-management.ts
- `selectFilter` — Port of the spec-local selectFilter: click a filter pill by name inside the
- `changeFilterType` — Port of the spec-local changeFilterType: open the "Filter or parameter type"
- `changeOperator` — Port of the spec-local changeOperator: open the "Filter operator" select and
- `verifyOperatorValue` — Port of the spec-local verifyOperatorValue: the "Filter operator" select's
- `expectSidebarHasDisplayValue` — Retried wrapper around findByDisplayValue for `should("exist")` — the sidebar
- `clickSidebarDisplayValue` — Retried wrapper around findByDisplayValue that clicks the matched control
- `createDashboardWithFilterAndQuestionMapped` — Port of the spec-local createDashboardWithFilterAndQuestionMapped: a People

## dashboard-filters-matrix.ts
- `runPage`
- `page`
- `runAll`
- `run`

## dashboard-filters-misc.ts
- `createPivotableQuery` — Port of the spec-local createPivotableQuery: Q1 (join + custom column) plus
- `createAndVisitPivotDashboard` — Port of the spec-local createAndVisitDashboard, specialised to a single
- `createPivotQuestion` — Port of the spec-local createPivotQuestion. */

## dashboard-filters-number.ts
- `DASHBOARD_NUMBER_FILTERS`
- `addWidgetNumberFilter` — Port of addWidgetNumberFilter (native-filters/helpers/e2e-field-filter-helpers.js):
- `setFilterWidgetValue` — Port of H.setFilterWidgetValue (e2e-ui-elements-helpers.js): open the first

## dashboard-filters-remapping.ts
- `findWidget` — Port of the spec-local findWidget: the parameter widget by exact label. */
- `clearWidget` — Port of the spec-local clearWidget: findWidget(name).icon("close").click().
- `testDefaultValuesRemapping` — Port of testDefaultValuesRemapping: each widget shows its remapped default. */
- `testWidgetsRemapping` — Port of testWidgetsRemapping: clear each widget, pick a new value in its

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

## dashboard-filters-source.ts
- `setFilterQuestionSource` — Full port of H.setFilterQuestionSource({ question, field, labelField }).
- `resetIpAddressesTable` — Port of the `ip_addresses` factory in e2e/support/test_tables.js.
- `fieldValuesValueIn` — Port of H.fieldValuesValue(index) scoped to a popover, as upstream's

## dashboard-filters-sql-management.ts
- `questionDetails`
- `setupSqlManagementDashboard` — Port of the number-filter describe's beforeEach: create the native question +

## dashboard-filters-sql-number.ts
- `questionDetails`
- `filterDetails`
- `parameterMapping`
- `dashboardDetails`
- `setupSqlNumberDashboard` — Port of the Cypress beforeEach body: create the native question + dashboard,

## dashboard-filters-sql-required-field-filter.ts
- `questionDetailsWithRequiredFilter` — The required variant of the Cypress `questionDetails` (immer `produce`
- `filter`
- `dashboardDetails`
- `setupRequiredFieldFilterDashboard` — Port of the Cypress `it` setup: create the native question + dashboard, then

## dashboard-filters-sql-required-simple-filter.ts
- `questionDetails`
- `filter`
- `dashboardDetails`
- `setupRequiredSimpleFilterDashboard` — Port of the Cypress beforeEach body: create the native question + dashboard,
- `removeDefaultFilterValue` — Port of the spec-local removeDefaultFilterValue:

## dashboard-filters-sql-text-category.ts
- `PG_DB_ID` — The spec's own `const PG_DB_ID = 2`. Under the `postgres-12` snapshot
- `QA_DB_SKIP_REASON`
- `queryQADB` — Port of H.queryQADB(query) — `cy.task("connectAndQueryDB", { connectionConfig:
- `getTableId` — Port of H.getTableId({ databaseId = WRITABLE_DB_ID, name, schema })
- `getFieldId` — Port of H.getFieldId({ tableId, name }). */
- `SQL_QUERY_DETAILS` — The spec's `sqlQueryDetails`, byte-for-byte (indentation included). */

## dashboard-filters-text-category.ts
- `DASHBOARD_TEXT_FILTERS`
- `dashboardSaveButton` — Port of H.dashboardSaveButton (e2e-dashboard-helpers.ts). */
- `selectFilterValueFromList` — Port of FieldFilter.selectFilterValueFromList: pick a value from the
- `addWidgetStringFilter` — Port of FieldFilter.addWidgetStringFilter: type the value into the first
- `applyFilterByType` — Port of FieldFilter.applyFilterByType: list picker for Is/Is not, else text. */
- `selectDefaultValueFromPopover` — Port of FieldFilter.selectDefaultValueFromPopover: open the "Default value"
- `clickDefaultValueToggle` — Port of the `cy.findByText("Default value").next().click()` idiom. The
- `waitForDashcardQuery` — Register BEFORE the triggering action; await after (PORTING rule 2). Matches

## dashboard-filters-with-question-revert.ts
- `updatedQuestionDetails` — Port of the spec's updatedQuestionDetails: rewrites the GUI question into a
- `connectFilterToColumn` — Port of the spec-local connectFilterToColumn: inside the dashcard's filter
- `assertFilterIsDisconnected` — Port of assertFilterIsDisconnected: the unfiltered first-two reviews are
- `assertFilterIsApplied` — Port of assertFilterIsApplied: only the rating-3 reviews are shown. */

## dashboard-management.ts
- `USER_NAMES` — First/last names from e2e/support/cypress_data.js — that file is untyped
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

## dashboard-questions.ts
- `DASHBOARD_ONE`
- `DASHBOARD_TWO`
- `QUESTION_ONE`
- `QUESTION_TWO`
- `QUESTION_THREE`
- `seedMigrationToolData` — Port of the spec-local seedMigrationToolData: three questions in First
- `selectCollectionItem` — Port of the spec-local selectCollectionItem:
- `commandPaletteSearch` — Port of H.commandPaletteSearch(query, viewAll = true): open the palette,
- `waitForCardUpdates` — Counting side of `cy.wait(new Array(count).fill("@updateCard"))` where

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

## dashboard-sections.ts
- `filterPanel` — Port of the spec-local filterPanel. */
- `addSection` — Port of the spec-local addSection. findByLabelText strings are exact
- `selectQuestion` — Port of the spec-local selectQuestion: click the first "Select question"
- `overwriteDashCardTitle` — Port of the spec-local overwriteDashCardTitle: open the dashcard's visualizer
- `mapDashCardToFilter` — Port of the spec-local mapDashCardToFilter. */
- `assertPlaceholderCardCanBeDragged` — Port of the spec-local assertPlaceholderCardCanBeDragged (metabase#UXW-3387):

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

## dashcard-replace-question.ts
- `ORDERS_COUNT_QUESTION_ID` — Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
- `PARAMETER`
- `DASHBOARD_CREATE_INFO`
- `MAPPED_QUESTION_CREATE_INFO`
- `NEXT_QUESTION_CREATE_INFO`
- `getDashboardCards`
- `visitDashboardAndEdit` — Port of visitDashboardAndEdit: visit the dashboard then enter edit mode.
- `findHeadingDashcard` — Port of findHeadingDashcard: cy.findAllByTestId("dashcard").eq(0). */
- `findTargetDashcard` — Port of findTargetDashcard: cy.findAllByTestId("dashcard").eq(2). */
- `replaceQuestion` — Port of replaceQuestion: hover the dashcard, click its "Replace" action,
- `assertDashCardTitle` — Port of assertDashCardTitle: the legend-caption-title has exactly `title`. */
- `overwriteDashCardTitle` — Port of overwriteDashCardTitle: open the target dashcard's viz options and
- `filterPanel` — Port of filterPanel: cy.findByTestId("edit-dashboard-parameters-widget-container"). */
- `connectDashboardFilter` — Port of connectDashboardFilter: open the filter's mapping, connect it to the
- `assertDashboardFilterMapping` — Port of assertDashboardFilterMapping: open the filter's mapping and assert
- `updateCollectionGraph` — Port of cy.updateCollectionGraph: GET the collection graph, shallow-merge the

## data-apps-sdk.ts
- `dataAppNumericField` — Port of `dataAppNumericField` (e2e/.../data-apps/helpers/index.ts). */
- `mockDataApp` — `mockDataApp` with the widened SDK `testEnv`. The base helper only

## data-apps.ts
- `DATA_APP_NAME` — The fixture data app `mockDataApp` builds and serves — dir name + URL slug. */
- `DATA_APP_DISPLAY_NAME`
- `DATA_APP_TEST_ENV` — The `testEnv` the fixture's Overview page reads (Orders count + question). */
- `buildDataAppBundle` — Port of the Cypress `buildDataApp` task: run the Vite build for a fixture and
- `mockDataApp` — Port of `H.mockDataApp`: build the fixture bundle and route the `/api/apps/*`
- `openDataApp` — Port of `H.openDataApp`: visit the host page route `/apps/:slug`. */
- `visitDataAppRoute` — Port of `visitDataAppRoute`: deep-link a nested route inside the fixture. */
- `dataAppIframe` — Port of `H.dataAppIframe`: the FrameLocator for the app's embed iframe. */
- `copySyncedDataAppsFixture` — Port of `H.copySyncedDataAppsFixture` (cy.task copyDirectory → fs.cpSync):

## data-model-permissions.ts
- `savePermissionsGraph` — Port of the spec-local savePermissionsGraph. */
- `waitForTableMetadata` — GET /api/table/:id/query_metadata — the Cypress @tableMetadataFetch alias. */

## data-model-shared-2.ts
- `getTriggeredFromArea` — Port of Shared.getTriggeredFromArea(area). */
- `button` — Port of `cy.button(name)` (e2e/support/commands/ui/button.ts):
- `FieldSection` — The FieldSection getters this spec needs on top of the shared ones.
- `clickCoercionToggle` — Upstream: `FieldSection.getCoercionToggle().parent().click(...)`.
- `clickAway` — Port of the spec-local `clickAway()` — `cy.get("body").click(0, 0)`. */
- `responseCounter`
- `queryMetadataCounter` — GET /api/table/:id/query_metadata — the spec's `@metadata` alias. */
- `requestRecorder` — A passive request recorder — the port of
- `fieldValuesRecorder` — GET /api/field/:id/values — the spec's `@fieldValues` alias. */
- `expectToastsContainText` — `cy.get("[data-testid=toast-undo]").should("contain.text", msg)` on a
- `verifyAndCloseToast` — VIOLATION whenever a previous toast is still exiting — measured on
- `scrollElementTo` — Port of `cy.get(el).scrollTo("top" | "bottom")` — Cypress sets `scrollTop`
- `clientRect` — `getBoundingClientRect()` read inside the browser — `boundingBox()` is a
- `backgroundColor` — Computed `background-color` of a single element. */

## data-model-shared-3.ts
- `FieldSection` — The FieldSection getters this spec needs on top of the shared-1 / shared-2
- `namePrefix` — The `Json:` style prefix chip rendered next to an unfolded field's name. */
- `tooltip` — Port of H.tooltip(). */
- `expectTooltipContainsText` — `tooltip().should("contain.text", x)` — chai-jquery CONCATENATES the text of
- `expectTooltipHasText` — `tooltip().should("have.text", x)` — also a concatenation (`$el.text()`). */
- `expectTooltipVisible` — `tooltip().should("be.visible")` — chai-jquery resolves this to
- `expectNoTooltip` — `tooltip().should("not.exist")`. */
- `expectNoToast` — `H.undoToast().should("not.exist")`. */
- `responseQueue`
- `fieldDimensionQueue` — POST /api/field/:id/dimension — the spec's `@updateFieldDimension`. */
- `fieldValuesQueue` — POST /api/field/:id/values — the spec's `@updateFieldValues`. */
- `waitForSyncSchema` — POST /api/database/:id/sync_schema — the spec's `@sync_schema`. */
- `fieldPutRecorder` — Passive recorder of `PUT /api/field/:id` — the port of the spec's
- `blurFocusedElement` — Blur whatever input/textarea currently holds focus.
- `remappingInputWithAttrValue` — jQuery's `.filter("[value=…]")` matches the ATTRIBUTE, and so does the CSS
- `getDatabaseTableIds` — Port of the `H.withDatabase` shape this spec uses: the shared
- `getDatabaseSchemas` — GET /api/database/:id/schemas — the spec reads `body[0]`. */
- `resetManyDataTypesTable` — Port of `H.resetTestTable({ type: "postgres", table: "many_data_types" })`
- `waitForUnfoldedJsonField` — `resyncDatabase({ tables })` alone is NOT enough here (PORTING): a stale

## data-model-shared-4.ts
- `TableSection` — The TableSection getters this spec needs on top of the shared-1 ones.
- `FieldSection` — The FieldSection getters this spec needs on top of the shared-1/2/3 ones.
- `clickMiniBarChartToggle` — Upstream: `FieldSection.getMiniBarChartToggle().parent().click(...)`.
- `fieldOrderOption` — Port of the SegmentedControl option click in the field-order picker.
- `fieldOrderRadio` — `getSortOrderInput().findByDisplayValue(v).should("be.checked")` — the
- `typeAppend` — Cypress `.type(text)` on a focused input appends at the END of the existing
- `verifyToastAndUndo` — chai-jquery CONCATENATION — ported as a join, never `.first()`.
- `stubServerErrors` — Install the 500 stubs. Must run before the navigation under test. */

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

## data-studio-bulk-table.ts
- `getDatabaseToggle` — Port of `DataModel.TablePicker.getDatabaseToggle(name)`:
- `selectHasValue` — Port of `H.selectHasValue(label, value)` (e2e/support/helpers/e2e-ui-select.ts):
- `selectDropdown` — Port of `H.selectDropdown()` — `popover().findByRole("listbox")`.
- `clickSelectOption` — Port of `H.selectDropdown().contains(label).click()`.
- `setBulkAttribute` — Open a bulk-attribute select (asserting it is unset) and pick an option —
- `undoToastList` — Port of `H.undoToastList()` — `cy.findAllByTestId("toast-undo")`. */
- `undoToastListContainer` — Port of `H.undoToastListContainer()` — `cy.findByTestId("undo-list")`. */
- `getTableInSchema` — unambiguous while only one schema is expanded, but NOT in the search view:
- `treeTableItems` — All rendered table rows in the picker tree (`data-type="table"` tree-items). */
- `waitForSchema` — The spec's `@getSchema`:
- `waitForSyncSchema` — `@syncSchema` — `POST /api/data-studio/table/sync-schema`. */
- `waitForRescanValues` — `@rescanValues` — `POST /api/data-studio/table/rescan-values`. */
- `waitForDiscardValues` — `@discardValues` — `POST /api/data-studio/table/discard-values`. */
- `waitForPublishTables` — `@publishTables` — `POST /api/ee/data-studio/table/publish-tables`. */
- `waitForUnpublishTables` — `@unpublishTables` — `POST /api/ee/data-studio/table/unpublish-tables`. */
- `expectTableAction` — Assert a bulk table action posted exactly `tableIds` and answered 204 — the
- `getTableId` — Port of the spec-local `getTableId(tables, tableName)`. */
- `resetTestTableManySchemas` — Port of `H.resetTestTable({ type: "postgres", table: "many_schemas" })`

## data-studio-library.ts
- `TRUSTED_ORDERS_METRIC` — Port of TRUSTED_ORDERS_METRIC (e2e/support/test-library-data.ts). */
- `dataStudioNav` — Port of H.DataStudio.nav(). */
- `dataStudioBreadcrumbs` — Port of H.DataStudio.breadcrumbs(). */
- `tableOverviewPage` — Port of H.DataStudio.Tables.overviewPage(). */
- `tableHeader` — Port of H.DataStudio.Tables.header(). */
- `metricMoreMenu` — Port of H.DataStudio.Metrics.moreMenu(): findByLabelText("More options"). */
- `libraryPage` — Port of H.DataStudio.Library.libraryPage(). */
- `collectionItem` — Port of H.DataStudio.Library.collectionItem(name):
- `tableItem` — Port of H.DataStudio.Library.tableItem(name):
- `libraryResult` — Port of H.DataStudio.Library.result(name):
- `libraryNewButton` — Port of H.DataStudio.Library.newButton(). */
- `emptyStateRow` — Port of H.DataStudio.Library.emptyStateRow(description):
- `librarySearchInput` — The library page's search box (placeholder "Search..."). */
- `visitLibrary` — Port of H.DataStudio.Library.visit(): navigate and assert the three root
- `openCollectionOptions` — Port of the spec-local openCollectionOptions. */
- `openTableOptions` — Port of the spec-local openTableOptions. */
- `expandLibraryCollection` — Port of the spec-local expandLibraryCollection. */
- `getLibraryRootCollections` — Port of the spec-local getLibraryRootCollections: GET /api/ee/library and
- `createLibraryCollection` — Port of the spec-local createLibraryCollection. */
- `createCollection` — Port of H.createCollection({ name }) — the subset this spec uses. */
- `createLibraryWithItems` — Port of createLibraryWithItems (e2e/support/test-library-data.ts): create the
- `createLibraryWithTable` — Port of createLibraryWithTable (e2e/support/test-library-data.ts). */

## data-studio-metrics.ts
- `MetricDetail` — The rest of Cypress's MetricPage (e2e-metric-page-helpers.ts). Header tabs
- `visitMetricPage` — Port of the spec-local visitMetricPage: navigate straight to the metric by
- `waitForCreateCard` — The `@createCard` alias: cy.intercept("POST", "/api/card"). */
- `waitForUpdateCard` — The `@updateCard` alias: cy.intercept("PUT", "/api/card/*"). */
- `waitForUpdateCacheConfig` — The `@updateCacheConfig` alias: cy.intercept("PUT", "/api/cache"). */
- `renameMetricTitle` — Rename the metric's EditableText title (the `aboutPage` header) and commit

## data-studio-single-table.ts
- `selectHasValue` — Port of `H.selectHasValue(label, value)`:
- `selectIsDisabled` — Port of `H.selectIsDisabled(label)`:
- `selectDropdown` — Port of `H.selectDropdown()` — `popover().findByRole("listbox")`. */
- `clickSelectOption` — Port of `H.selectDropdown().contains(label).click()`.
- `setSelectValue` — `selectHasValue(...).click()` + `selectDropdown().contains(...).click()` —
- `undoToast` — Port of `H.undoToast()` — `cy.findByTestId("toast-undo")` (SINGULAR). */
- `undoToastListContainer` — Port of `H.undoToastListContainer()` — `cy.findByTestId("undo-list")`. */
- `closeUndoToast` — for the length of its exit animation. A second toast arriving in that window
- `waitForPublishTables` — `@publishTables` — `POST /api/ee/data-studio/table/publish-tables`. */
- `waitForUnpublishTables` — `@unpublishTables` — `POST /api/ee/data-studio/table/unpublish-tables`. */
- `waitForTableMetadata` — `@metadata` — `GET /api/table/:id/query_metadata`. */
- `allLibraryTableItems` — Port of `H.DataStudio.Library.allTableItems()` —
- `resetTestTableManySchemas` — (cy.task("resetTable") -> e2e/support/test_tables.js `many_schemas`),
- `dropTransformTargetTable` — MEASURED, not assumed: before this was added, the transform test failed with

## data-studio-snippets.ts
- `newSnippetPage` — Port of H.DataStudio.Snippets.newPage(). */
- `editSnippetPage` — Port of H.DataStudio.Snippets.editPage(). */
- `archivedSnippetsPage` — Port of H.DataStudio.Snippets.archivedPage(). */
- `visitSnippet` — Port of H.DataStudio.Snippets.visitSnippet(id). */
- `snippetHeader` — The snippet header (`cy.findByTestId("snippet-header")`). */
- `newSnippetNameInput` — Port of H.DataStudio.Snippets.nameInput():
- `snippetNameInput` — The snippet name field addressed the way the spec's "editing" tests do:
- `snippetDescriptionInput` — Port of H.DataStudio.Snippets.descriptionInput():
- `snippetSaveButton` — Port of H.DataStudio.Snippets.saveButton(). */
- `snippetCancelButton` — Port of H.DataStudio.Snippets.cancelButton(). */
- `snippetEditor` — Port of `editor.get()`: wait out the loading indicator, then the content. */
- `focusSnippetEditor` — Port of `editor.focus()`: click the RIGHT edge of the content (the Cypress
- `typeInSnippetEditor` — Port of `editor.type(text)` for plain text (no `{…}` escape sequences). */
- `snippetEditorValue` — Port of `editor.value()`: join the `.cm-line` text nodes with newlines,
- `createSnippetFolder` — Port of H.createSnippetFolder (api/createSnippetFolder.ts). */
- `updateSnippet` — Port of H.updateSnippet (api/updateSnippet.ts). */
- `waitForCreateSnippet` — The `@createSnippet` alias: POST /api/native-query-snippet. */
- `waitForUpdateSnippet` — The `@updateSnippet` alias: PUT /api/native-query-snippet/*. */
- `waitForCreateCollection` — The `@createCollection` alias: POST /api/collection. */
- `waitForUpdateCollection` — The `@updateCollection` alias: PUT /api/collection/*. */
- `blurEditableText` — Blur the focused `EditableText` textarea. Never `keyboard.press("Tab")` —

## data-studio-tables.ts
- `tableFieldsPage` — Port of H.DataStudio.Tables.fieldsPage(). */
- `visitTableOverviewPage` — Port of H.DataStudio.Tables.visitOverviewPage(tableId). */
- `visitTableFieldsPage` — Port of H.DataStudio.Tables.visitFieldsPage(tableId). */
- `tableNameInput` — Port of H.DataStudio.Tables.nameInput(): cy.findByTestId("table-name-input").
- `tableMoreMenu` — Port of H.DataStudio.Tables.moreMenu(): header().icon("ellipsis").
- `tableOverviewTab` — Port of H.DataStudio.Tables.overviewTab(): header().findByText("Overview"). */
- `tableFieldsTab` — Port of H.DataStudio.Tables.fieldsTab(). */
- `tableDependenciesTab` — Port of H.DataStudio.Tables.dependenciesTab(). */
- `clickMoreMenuViewTable` — Port of H.DataStudio.Tables.moreMenuViewTable(): the popover's
- `tableDescriptionSidebar` — Port of H.DataStudio.Tables.Overview.descriptionSidebar(). */
- `tableDescriptionText` — Port of H.DataStudio.Tables.Overview.descriptionText(). */
- `tableDescriptionInput` — Port of H.DataStudio.Tables.Overview.descriptionInput(). */
- `allTableItems` — Port of H.DataStudio.Library.allTableItems(). */
- `fieldSectionNameInput` — Port of H.DataModel.FieldSection.getNameInput(). */
- `fieldSectionCloseButton` — Port of H.DataModel.FieldSection.getCloseButton():
- `replaceEditableText` — `.clear().type(text).blur()` on an EditableText textarea.

## database-connection-strings.ts
- `paste` — with `fill()` / `pressSequentially()`:
- `typeAppending` — `cy.findByLabelText(x).type(text)` on a field that ALREADY has a value:

## database-routing-admin.ts
- `SAMPLE_DB_ID` — Mirrors e2e/support/cypress_data.js SAMPLE_DB_ID / WRITABLE_DB_ID. */
- `WRITABLE_DB_ID`
- `ALL_USERS_GROUP` — Mirrors USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js). */
- `QA_POSTGRES_PORT` — Mirrors QA_POSTGRES_PORT (e2e/support/cypress_data.js). */
- `configureDbRoutingViaAPI` — Port of configureDbRoutingViaAPI. */
- `createDestinationDatabasesViaAPI` — Port of createDestinationDatabasesViaAPI. */
- `BASE_POSTGRES_DESTINATION_DB_INFO` — Port of BASE_POSTGRES_DESTINATION_DB_INFO. */
- `dbConnectionInfoSection` — Port of the spec-local dbConnectionInfoSection. */
- `dbRoutingSection` — Port of the spec-local dbRoutingSection. */
- `modelsSection` — Port of the spec-local modelsSection. */
- `tableEditingSection` — Port of the spec-local tableEditingSection. */
- `visitDatabaseAdminPage` — Port of the spec-local visitDatabaseAdminPage. */
- `visitUploadSettingsPage` — Port of the spec-local visitUploadSettingsPage. */
- `expandDbRouting` — Port of the spec-local expandDbRouting: click the section chevron. */
- `typeAndBlurUsingLabel` — Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
- `disableModelActionsViaApi` — Port of the spec-local disableModelActionsViaApi. */
- `enableModelActionsViaApi` — Port of the spec-local enableModelActionsViaApi. */
- `enableUploadsViaApi` — Port of H.enableUploads("postgres") (e2e-upload-helpers.js). */
- `setupModelPersistence` — Port of the spec-local setupModelPersistence. */
- `enableGlobalModelPersistence` — Port of the spec-local enableGlobalModelPersistence. */
- `assertDbRoutingNotDisabled` — Upstream calls `realHover()` directly on the `<input>` inside the Mantine
- `assertDbRoutingDisabled` — Chrome v122+ headless hit-tested CDP mouse events to the disabled <input>

## database-routing-usage.ts
- `QA_DB_CREDENTIALS` — Mirrors QA_DB_CREDENTIALS (e2e/support/cypress_data.js). */
- `DB_ROUTER_USERS`
- `queryWritableDB` — Port of H.queryWritableDB(sql) — the writable postgres is the connection the
- `routingDbName` — parallelIndex-not-workerIndex choice are the SAME ones the warehouse
- `createDbWithIdentifierTable` — Port of createDbWithIdentifierTable (e2e-database-routing-helpers.ts).
- `waitForDatabaseSyncToFinish` — true of a sync that is still sitting in the queue. Callers reach this only
- `addPostgresDatabase` — database, which after `restore("postgres-writable")` is the pre-existing
- `getDbIdentifierIds` — The `GET /api/database/:id/metadata?include_hidden=true` +

## database-writable-connection.ts
- `queryDB` — Port of `H.queryWritableDB(query, "mysql")` — the spec's `queryDB`. */
- `mainConnectionSection` — `cy.findByTestId("database-connection-info-section")` */
- `writableConnectionSection` — `cy.findByTestId("writable-connection-info-section")` */
- `connectionHealthInfo` — `cy.findByTestId("database-connection-health-info")`.
- `fillInCredentials` — NOT `fill()`. The form is `DatabaseForm` (Formik) and its submit button is
- `createWritableConnection` — Port of `createWritableConnection`. `getWritableConnectionInfoSection()
- `updateWritableConnection` — Port of `updateWritableConnection`. */
- `updateMainConnection` — Port of `updateMainConnection`. Note both sections render an "Edit connection
- `removeWritableConnection` — Port of `removeWritableConnection` (button + confirmation modal). */
- `runTransformAndWaitForFailure` — Port of `H.runTransformAndWaitForFailure` (e2e-transform-helpers.ts:58) —
- `refreshModelPersistenceAndAwaitStatus` — Port of `refreshModelPersistenceAndAwaitStatus` — POST the refresh, then
- `enablePersistenceForModel` — Port of `enablePersistenceForModel`. */
- `runAction` — Ports of `runAction` / `performTableEdit` / `performUpload`. Upstream sends
- `performTableEdit`
- `performUpload` — Port of `performUpload`.

## datamodel-data-studio-search.ts
- `getDatabaseCheckbox` — Port of `DataModel.TablePicker.getDatabaseCheckbox(name)` —
- `getSchemaCheckbox` — Port of `DataModel.TablePicker.getSchemaCheckbox(name)` —
- `getDatabaseToggle` — Port of `DataModel.TablePicker.getDatabaseToggle(name)` —
- `getSchemaToggle` — Port of `DataModel.TablePicker.getSchemaToggle(name)` —
- `selectedTablesHeading` — The spec's repeated `cy.findByRole("heading", { name: /N tables selected/i })`.
- `noTablesFound` — The picker's "No tables found" empty state (`SearchNew.tsx`). */
- `waitForTableSearch` — table-picker search returned. The picker is backed by
- `typeSearch` — instead of appending, and it sets the value in one shot without per-character
- `selectFilterOptionInForm` — The shared port in `support/datamodel-data-studio.ts` looks the field's
- `setBulkVisibilityLayer` — closed itself — `FilterPopover`'s `onSubmit` calls `close()`), `table-section`
- `waitForBulkTableUpdate` — `useUpdateTableListMutation` endpoint) was WRONG and timed out: that hook
- `clearAndTypeSearch`

## datamodel-data-studio.ts
- `getFilterForm` — Port of DataModel.TablePicker.getFilterForm(). */
- `openFilterPopover` — Port of DataModel.TablePicker.openFilterPopover(). */
- `selectFilterOption` — Port of DataModel.TablePicker.selectFilterOption(fieldLabel, optionLabel).
- `clickPopoverOption` — Click an option in the open Mantine `Select` dropdown.
- `applyFilters` — Port of DataModel.TablePicker.applyFilters(): click Apply and wait on the
- `waitForListTables` — The spec's `cy.intercept("GET", "/api/table?*").as("listTables")`. */
- `clickDetailsTab` — Port of DataModel.TableSection.clickDetailsTab(). */
- `getDependencyGraphLink` — Port of DataModel.TableSection.getDependencyGraphLink(). */
- `getSortOrderInput` — Port of DataModel.TableSection.getSortOrderInput() (a SegmentedControl with
- `getSortOrderRadio` — Port of `TableSection.getSortOrderInput().findByDisplayValue(value)` — the
- `getSortOrderOption` — Port of `TableSection.getSortOrderInput().findByLabelText(label)`. The label
- `getActionsMenuButton` — Port of DataModel.TableSection.getActionsMenuButton(). */
- `getSortableField` — Port of DataModel.TableSection.getSortableField(name) — same locator as
- `getSortableFields` — Port of DataModel.TableSection.getSortableFields(). */
- `getVisibilityTypeInput` — Port of DataModel.TableSection.getVisibilityTypeInput(). */
- `getTableSectionCloseButton` — Port of DataModel.TableSection.getCloseButton(). */
- `getFieldSectionCloseButton` — Port of DataModel.FieldSection.getCloseButton(). */
- `getFieldValuesButton` — Port of DataModel.FieldSection.getFieldValuesButton(). */
- `getFilteringInput` — Port of DataModel.FieldSection.getFilteringInput(). */
- `getDisplayValuesInput` — Port of DataModel.FieldSection.getDisplayValuesInput(). */
- `getDisplayValuesFkTargetInput` — Port of DataModel.FieldSection.getDisplayValuesFkTargetInput(). */
- `getTableId` — Port of the spec-local getTableId (matches on display_name OR name). */
- `updateTableAttributes` — Port of the spec-local updateTableAttributes. */
- `setUserAsAnalyst` — Port of H.setUserAsAnalyst (e2e-users-helpers.ts). */
- `findSearchResultByTableId` — Port of the spec-local findSearchResultByTableId. */
- `expectTableVisible` — Port of the spec-local expectTableVisible (upstream asserts existence). */
- `expectTableNotVisible` — Port of the spec-local expectTableNotVisible. */
- `selectOwnerByName` — Port of the spec-local selectOwnerByName. */
- `selectOwnerByEmail` — Port of the spec-local selectOwnerByEmail. `cy.type()` clicks its subject
- `toggleUnusedFilter` — Port of the spec-local toggleUnusedFilter. */
- `openWritableDomesticSchema` — Port of the spec-local openWritableDomesticSchema. */
- `stubEstimatedRowCount` — Port of the spec's `cy.intercept` that rewrites `estimated_row_count` on the
- `getDatabaseCheckbox` — The tree-item checkbox helpers the select/deselect test defines inline. */
- `getSchemaCheckbox`
- `getTableCheckbox`
- `escapeRegExp`
- `verifyAndCloseToastFirst` — Local variant of `Shared.verifyAndCloseToast` (support/data-model.ts).
- `closeToast` — Close the newest undo toast.
- `blurFocused` — Blur whatever currently holds focus. `cy.type()` targets

## datamodel-segments.ts
- `segmentListApp`
- `segmentRow` — The <tr> in the segment list containing the given segment name. Cypress
- `segmentRowMenuTrigger` — The hover-independent row ellipsis (`.Icon-ellipsis`, a stable Icon class). */
- `openSegmentRowMenu`
- `assertRevisionHistory` — Port of the spec-local assertRevisionHistory. `scope` is the segment-revisions
- `trackMetadataRequests` — Attach a counter for GET /api/table/:id/query_metadata responses — the

## dependency-broken-list.ts
- `visitBrokenDependencies` — Port of H.DependencyDiagnostics.visitBrokenDependencies
- `BrokenSidebar` — Port of the two H.DependencyDiagnostics.Sidebar regions the unreferenced-list
- `waitForBreakingDependencies` — Port of H.waitForBreakingDependencies (e2e-dependency-helpers.ts): poll
- `runTransform` — Port of H.runTransform (e2e-transform-helpers.ts). */
- `waitForTransformRuns` — Port of H.waitForTransformRuns (e2e-transform-helpers.ts): poll
- `deleteTransformTable` — Port of the spec-local dropTransformTable: DELETE /api/transform/:id/table. */

## dependency-checks.ts
- `FIXTURE_SCHEMA` — On this shared box it is not: the `many_schemas` fixture creates
- `resetSpecTargetTables`
- `createMbqlQuestionWithDependentMbqlQuestions` — Port of the spec-local createMbqlQuestionWithDependentMbqlQuestions.
- `createMetricWithDependentMbqlQuestionsAndTransforms` — Port of the spec-local createMetricWithDependentMbqlQuestionsAndTransforms.
- `createSqlTransformWithDependentMbqlQuestions` — Port of the spec-local createSqlTransformWithDependentMbqlQuestions.
- `createMbqlTransformWithDependentMbqlTransforms` — Port of the spec-local createMbqlTransformWithDependentMbqlTransforms.
- `visitTransform` — Port of H.visitTransform (e2e-transform-helpers.ts). `support/transforms.ts`
- `expectNoBadSnowplowEvents` — `Access-Control-Allow-Credentials`, so the tracker's `credentials:"include"`

## dependency-graph.ts
- `DependencyGraph` — Port of H.DependencyGraph (e2e-dependency-helpers.ts) — the graph screen's
- `waitForBackfillComplete` — Port of H.waitForBackfillComplete (e2e-dependency-helpers.ts): poll
- `createTransform` — Port of H.createTransform (api/createTransform.ts). */
- `runTransformAndWaitForSuccess` — Port of H.runTransformAndWaitForSuccess (e2e-transform-helpers.ts):
- `createMockCard` — Minimal stand-in for createMockCard (metabase-types/api/mocks/card.ts): the
- `createDocument` — Port of H.createDocument (api/createDocument.ts) — the `cards`-carrying

## dependency-unreferenced-list.ts
- `DependencyDiagnostics` — Port of H.DependencyDiagnostics (e2e-dependency-helpers.ts) — the
- `getNodeName` — Port of getNodeName (spec-local): tables report display_name, everything
- `waitForUnreferencedEntities` — Port of H.waitForUnreferencedEntities (e2e-dependency-helpers.ts): poll

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

## dnd.ts
- `moveDnDKitPointer` — Drive dnd-kit's PointerSensor with synthetic pointer events at element-relative
- `moveDnDKitElementSynthetic` — Synthetic-event port of H.moveDnDKitElementByAlias({ useMouseEvents }) for drag

## document-links.ts
- `documentMentionItem` — Port of H.documentMentionItem (findByRole name strings are exact). */
- `openLinkSuggestionBrowseAllPicker` — Port of the spec-local openLinkSuggestionBrowseAllPicker: focus the editor,
- `openLinkMentionMenuBrowseAllPicker` — Port of the spec-local openLinkMentionMenuBrowseAllPicker: focus the editor,

## document-metabot.ts
- `GENERATED_CARD_NAME` — The name the mocked tool call gives the generated chart. */
- `buildSqlChartResponse` — Build the { draft_card, description, error } the endpoint returns for a
- `mockDocumentGenerateContent` — Fulfil POST /api/metabot/document/generate-content with a canned JSON body.

## document-permissions.ts
- `ALL_USERS_GROUP` — Mirrors USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed
- `newDocumentFromNewMenu` — Port of H.newButton("Document").click(): open the app-bar "New" menu and

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

## downgrade-ee-to-oss.ts
- `EE_DATA_ACCESS_PERMISSION_INDEX` — The spec's EE_DATA_ACCESS_PERMISSION_INDEX (the view-data column in EE). */
- `OSS_NATIVE_QUERIES_PERMISSION_INDEX` — The spec's OSS_NATIVE_QUERIES_PERMISSION_INDEX. Same numeric index as the EE
- `isPermissionDisabled` — Port of H.isPermissionDisabled (e2e-permissions-helpers.js):
- `saveAndConfirmPermissions` — cy.button("Yes").click();
- `configureSandboxPolicy` — Port of the spec's sandboxing-modal block: after picking "Row and column

## download-permissions.ts
- `DATA_ACCESS_PERMISSION_INDEX`
- `DOWNLOAD_PERMISSION_INDEX`
- `sidebar` — Port of H.sidebar (e2e-ui-elements-helpers.js): cy.get("main aside"). */
- `assertPermissionForItem` — Port of H.assertPermissionForItem (e2e-permissions-helpers.js): the row's
- `setDownloadPermissionsForProductsTable` — Port of the spec-local setDownloadPermissionsForProductsTable: grant All

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

## duplicate-dashcards-tabs.ts
- `PARAMETER`
- `DASHBOARD_CREATE_INFO`
- `MAPPED_QUESTION_CREATE_INFO`
- `createMappedDashcard` — Port of the spec-local createMappedDashcard: a Products dashcard mapped to
- `EVENTS`

## email-alert.ts
- `ALERT_BRANDING_HREF` — The href the "Made with Metabase" anchor carries in
- `directText` — Local copy of the `directText` matcher (support/transforms-template-tags.ts
- `escapeRegExp` — Escape a string for embedding in a RegExp. */
- `countPosts` — Counts POSTs to an exact pathname, the way `cy.intercept("POST", "/api/card")
- `openAlertForQuestion` — Port of the spec-local openAlertForQuestion(id).
- `saveAlert` — Port of the spec-local saveAlert().
- `sendAlertAndVisitIt` — Port of H.sendAlertAndVisitIt (e2e-email-helpers.js): press "Send now" in the
- `waitForInbox` — Poll maildev until at least one email is stored. */
- `linksContaining` — `cy.findAllByRole("link").filter(":contains(text)")`.

## embed-resource-downloads.ts
- `deleteDownloadsFolder` — Port of cy.deleteDownloadsFolder — a no-op here: Playwright downloads land in
- `waitLoading` — Port of `H.main().findByText("Loading...").should("not.exist")`. */
- `getEmbeddedDashboardCardMenu` — Port of H.getEmbeddedDashboardCardMenu (e2e-dashboard-helpers.ts): the
- `downloadEmbedQuestion` — Drive the "Download results" popover on an embedded QUESTION and return the
- `downloadAndAssertEmbedQuestion` — Port of the last two tests' `H.downloadAndAssert({ isEmbed: true, fileType,

## embedding-dashboard.ts
- `questionDetails`
- `questionDetailsWithDefaults`
- `dashboardDetails`
- `mapParameters` — Port of mapParameters (shared/embedding-dashboard.js). */
- `addOrUpdateDashboardCard` — Port of H.addOrUpdateDashboardCard: PUT a single dashcard, return it. */
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

## embedding-hub.ts
- `ALL_EXTERNAL_USERS_GROUP_ID` — Mirrors ALL_EXTERNAL_USERS_GROUP_ID (cypress_sample_instance_data.js):
- `STATIC_ORDERS_ID` — Mirrors SAMPLE_DB_TABLES.STATIC_ORDERS_ID (cypress_data.js). */
- `QA_DB_SKIP_MESSAGE`
- `adminLayoutContent` — Port of cy.findByTestId("admin-layout-content"). */
- `closestButton` — Port of Cypress's `.closest("button")` on a setup-guide card title.
- `addPostgresDatabase` — Port of H.addPostgresDatabase (e2e-qa-databases-helpers.js) INCLUDING its
- `resetMultiSchemaTable` — Port of H.resetTestTable({ type: "postgres", table: "multi_schema" })

## embedding-linked-filters.ts
- `nativeQuestionDetails`
- `nativeDashboardDetails`
- `mapNativeDashboardParameters` — Port of mapNativeDashboardParameters (shared/embedding-linked-filters.js). */
- `guiQuestion`
- `guiDashboard`
- `mapGUIDashboardParameters` — Port of mapGUIDashboardParameters (shared/embedding-linked-filters.js). */
- `applyFilterToast` — Port of H.applyFilterToast: cy.findByTestId("filter-apply-toast"). */
- `openFilterOptions` — Port of the spec-local openFilterOptions: click the filter widget by name. */
- `assertOnXYAxisLabels` — Port of the spec-local assertOnXYAxisLabels: the chart's axis <text> elements
- `echartsTextContaining` — The chart's <text> elements whose content contains `text` (case-sensitive
- `expectEchartsTextContains` — Port of `H.echartsContainer().get("text").should("contain", value)`: at least
- `expectEchartsTextNotContains` — Port of `H.echartsContainer().get("text").and("not.contain", value)`: no axis
- `searchFieldValuesFilter` — Port of the spec-local searchFieldValuesFilter: type "An" into the City field
- `removeValueForFilter` — Port of the spec-local removeValueForFilter: click the filter widget's close icon. */

## embedding-native.ts
- `questionDetails` — Port of questionDetails (shared/embedding-native.js). */
- `assertRequiredEnabledForName` — Port of the spec-local assertRequiredEnabledForName: inside the native

## embedding-questions.ts
- `regularQuestion`
- `questionWithAggregation`
- `joinedQuestion`
- `downloadsQuestionDetails` — Port of the downloads describe's module-level `questionDetails`. */
- `echartsContainer` — Scope-aware port of H.echartsContainer (testid "chart-container"). */
- `cartesianChartCircles`
- `echartsTooltip` — Scope-aware port of H.echartsTooltip (may keep two DOM instances). */
- `assertOnXYAxisLabels` — Port of the spec-local assertOnXYAxisLabels: the ECharts SVG renders the axis
- `assertEChartsTooltip` — Scope-aware port of H.assertEChartsTooltip ({ header, rows }) — only the
- `triggerMousemove` — Port of Cypress `.trigger("mousemove")` on an ECharts element (wave-13:
- `tooltip` — Scope-aware Mantine tooltip locator (port of H.tooltip against the embed

## embedding-repros.ts
- `getIframeBody` — Port of H.getIframeBody: the (single) iframe on the page as a FrameLocator.
- `tableInteractiveHeader` — Port of H.tableInteractiveHeader (`cy.findByTestId("table-header")`). */
- `setDefaultValueForLockedFilter` — Port of the spec-local setDefaultValueForLockedFilter (issue 15860): in the
- `createModelFromTableName` — Port of H.createModelFromTableName (e2e-qa-databases-helpers.js) returning
- `moveCardToCollection` — Port of the spec-local moveToCollection (issue 51934): PUT the card's
- `getFieldIdByName` — Port of H.withDatabase's field-id lookup (e2e-database-metadata-helpers.ts),
- `holdEmbedRoute` — Playwright equivalent of the spec's `cy.intercept(..., () => deferred)` /

## embedding-snippets.ts
- `getEmbeddingJsCode` — Port of getEmbeddingJsCode: the server-side signed-URL snippet, as a
- `IFRAME_CODE` — Port of IFRAME_CODE: the frontend (Pug / Jade) iframe snippet, newlines
- `codeBlock` — Port of the spec-local codeBlock(): cy.get(".cm-content"). Scoped to the
- `highlightedTexts` — Port of the spec-local highlightedTexts(): findAllByTestId("highlighted-text"). */
- `backendSelectButton` — The language <select> input for the server-side snippet. */
- `frontendSelectButton` — The language <select> input for the client-side snippet. */
- `toggleAppearanceControl` — The static-embedding appearance controls (background / download Switches)

## embedding-theme-editor.ts
- `createThemeViaApi` — Port of the spec-local createThemeViaApi: POST /api/embed-theme with a full
- `visitThemeEditor` — Port of the spec-local visitThemeEditor: navigate to the editor and wait for
- `changeColor` — Port of the spec-local changeColor. Opens a ColorSwatchCard's popover by

## embedding-theme-listing.ts
- `getThemeCard` — Port of the spec-local getThemeCard: the theme card is the parent element of
- `openThemeActionMenu` — Port of the spec-local openThemeActionMenu: open a theme card's
- `clickThemeMenuItem` — Port of the spec-local clickThemeMenuItem: open the card's action menu, then
- `deleteAllThemes` — Port of the spec-local deleteAllThemes: GET every theme and DELETE it.

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

## entity-picker-shared-tenant-collection.ts
- `TENANT_ROOT_NAME` — The virtual root under which shared-tenant-collection namespace collections live. */
- `TENANT_NAMESPACE`
- `selectTenantSubCollectionInPicker` — Navigate the open entity picker into the tenant root, then into
- `createTenantCollection` — Port of the spec-local createTenantCollection: a collection in the
- `setupTenantCollections` — Port of the spec-local setupTenantCollections: a tenant collection + sub-collection.

## entity-picker.ts
- `ADMIN_PERSONAL_COLLECTION_ID` — Ports of the *_PERSONAL_COLLECTION_ID exports (cypress_sample_instance_data.js). */
- `NORMAL_PERSONAL_COLLECTION_ID`
- `NO_COLLECTION_PERSONAL_COLLECTION_ID`
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
- `WRITABLE_DB_ID` — WRITABLE_DB_ID (e2e/support/cypress_data.js). */
- `cardDetails` — The spec's module-level `cardDetails`. */
- `entityPickerModal`
- `entityPickerModalLevel`
- `dashboardOnTheGoModal` — Port of H.dashboardOnTheGoModal(). */
- `collectionOnTheGoModal` — Port of H.collectionOnTheGoModal(). */
- `entityPickerModalItem` — Port of H.entityPickerModalItem(level, name):
- `clickPickerItem` — A single, PACED picker click. The column re-renders as children load, so a
- `pickEntity` — Port of H.pickEntity — but paced (see clickPickerItem).
- `enterSearchText` — Port of the spec-local enterSearchText:
- `enterSearchTextDeferred` — `enterSearchText` split in two, for the handful of upstream assertions that
- `globalSearchTab` — Port of the spec-local globalSearchTab: cy.findByLabelText("Everywhere"). */
- `selectGlobalSearchTab` — Port of the spec-local selectGlobalSearchTab. The SegmentedControl inputs are
- `localSearchTab` — Port of the spec-local localSearchTab: cy.findByLabelText(selectedItem).
- `selectLocalSearchTab` — Port of the spec-local selectLocalSearchTab. findByText is exact. */
- `findSearchItem` — Port of the spec-local findSearchItem: scoped to level 1's scroll container
- `assertSearchResults` — Port of the spec-local assertSearchResults. */
- `createTestCards` — Port of the spec-local createTestCards. Also polls the search index: the
- `createTestCollections` — Port of the spec-local createTestCollections. Returns the "Another collection" id. */
- `createTestDashboards` — Port of the spec-local createTestDashboards. */
- `waitForSearchable` — Poll `/api/search` until a just-created entity is indexed. Search-backed
- `createTestDashboardWithEmptyCard` — Port of the spec-local createTestDashboardWithEmptyCard. */
- `testCardSearchForNormalUser` — Port of the spec-local testCardSearchForNormalUser. */
- `testCardSearchForInaccessibleRootCollection` — Port of the spec-local testCardSearchForInaccessibleRootCollection. */
- `testCardSearchForAllPersonalCollections` — Port of the spec-local testCardSearchForAllPersonalCollections. */
- `assertNoSearchScopeSelectorYet` — resolves to **0** here and to **1** the moment the search returns — the

## env.ts
- `BASE_URL`

## factories.ts
- `createQuestion` — Port of H.createQuestion (api/createQuestion.ts). Structured by default;
- `createNativeQuestion` — Port of H.createNativeQuestion (api/createNativeQuestion.ts). */
- `createDashboard` — Port of H.createDashboard (api/createDashboard.ts). POST /api/dashboard
- `createQuestionAndDashboard` — Port of H.createQuestionAndDashboard. */
- `createNativeQuestionAndDashboard` — Port of H.createNativeQuestionAndDashboard. Threads `tabs` +
- `createDashboardWithQuestions` — Port of H.createDashboardWithQuestions (api/createDashboardWithQuestions.ts):
- `createDashboardWithTabs` — Port of H.createDashboardWithTabs (api/createDashboardWithTabs.ts): create the

## filter-bigint.ts
- `BIGINT_PK_TABLE_NAME`
- `DECIMAL_PK_TABLE_NAME`
- `resetTestTable` — Port of H.resetTestTable({ type: "postgres", table }) for the two tables
- `setupTables` — Port of the spec's module-level setupTables(): restore the postgres-writable

## filter-bulk.ts
- `hovercard` — Port of H.hovercard: the visible Mantine HoverCard dropdown. */
- `queryBuilderFooter` — Port of H.queryBuilderFooter. */
- `createSegment` — Port of H.createSegment (POST /api/segment). */
- `trackDatasetRequests` — Counter for POST /api/dataset responses — the wait-free side of the
- `setupBooleanQuery` — Port of H.setupBooleanQuery: create + visit a native question with a

## filter.ts
- `filterSimple` — Port of H.filter() simple-mode branch (initiateAction, e2e-bi-basics-helpers.js):
- `customExpressionType` — Port of H.CustomExpressionEditor.type() for formulas containing the `→`
- `expectVisibleInPopover` — Port of the isVisibleInPopover custom command (metabase#14307): the element
- `expectChartCirclesWithColors` — Port of `H.cartesianChartCircleWithColors(colors)`: each color's data-point
- `expectFocusedRole` — Port of `cy.focused().should("have.attr", "role", role)`. */

## filters-reproductions.ts
- `pickMiniPickerTable` — skips the schema level entirely). Our container is shared across five slots
- `assertDescendantsNotOverflowContainer` — Port of H.assertDescendantNotOverflowsContainer
- `rectOf` — `getBoundingClientRect()` read inside the page — `boundingBox()` is a second

## filters-repros-2.ts
- `dashboardParametersDoneButton` — Port of H.dashboardParametersDoneButton: the "Done" button inside the
- `getManyDataTypesBooleanFieldId` — Port of the issue-45670 spec-local getField(): locate the `boolean` field of

## filters-repros.ts
- `ORDERS_DASHBOARD_DASHCARD_ID` — Port of ORDERS_DASHBOARD_DASHCARD_ID (cypress_sample_instance_data.js). */
- `createNativeQuestion` — Port of H.createNativeQuestion — accepts `parameters` and `type`. Delegates to
- `updateDashboardCards` — Port of H.updateDashboardCards: replaces all dashcards with `cards`. */
- `editDashboardCard` — Port of H.editDashboardCard (api/editDashboardCard.ts). */
- `setModelMetadata` — Port of H.setModelMetadata (e2e-models-metadata-helpers.js). */
- `dashboardParametersPopover` — Port of H.dashboardParametersPopover (popover with a dedicated testid). */
- `dashboardParameterSidebar` — Port of H.dashboardParameterSidebar. */
- `dashboardParametersContainer` — Port of H.dashboardParametersContainer. */
- `editingParametersContainer` — Port of H.editingDashboardParametersContainer. */
- `editingFilterWidget` — Port of H.filterWidget({ isEditing: true, name }): the editing-mode widgets,
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

## filters-view.ts
- `grantRootCollectionViewAccess` — Port of the describe's beforeEach permission grant: upgrade All Users to
- `applyVendorSearchFilter` — Apply the VENDOR field filter by searching for a single value. Mirrors the
- `applyCategoryWidgetFilter` — Apply the CATEGORY field filter by picking a value from the widget list.
- `expectWrittenInSql` — Assert the QB reflects a saved native (SQL) question. */

## filters.ts
- `clauseStepPopover`
- `containsText` — Port of cy.contains(text) inside a scope: case-sensitive substring match

## fixtures.ts
- `test`

## forgot-password.ts
- `emailAddressInput` — `findByLabelText("Email address")` → exact (PORTING rule 1). The input is a
- `sendResetEmailButton` — `findByText("Send password reset email")` → exact (PORTING rule 1).
- `resetEmailSentMessage` — The ForgotPasswordSuccess message. Upstream is a bare
- `forgotPasswordTitle` — `ForgotPasswordForm`'s `PasswordFormTitle`. Positive anchor for the
- `createPasswordInput` — `findByLabelText("Create a password")` → exact (PORTING rule 1). */
- `confirmPasswordInput` — `findByLabelText("Confirm your password")` → exact (PORTING rule 1). */
- `saveNewPasswordButton` — `findByText("Save new password")` → exact (PORTING rule 1). */
- `passwordUpdatedToast` — `findByText("You've updated your password.")` → exact (PORTING rule 1).
- `getResetLink` — Port of the spec-local `getResetLink()`: the href of the email's first
- `inboxIds` — The ids currently in the shared inbox — snapshot this immediately before
- `waitForOwnResetEmail` — 3. **the body links at our own site URL.** `forgot-password-impl`

## funnel-title-navigation.ts
- `createFunnelVisualizerDashboard` — Port of the UXW-2692 setup: a native funnel question, a dashboard, and one

## homepage.ts
- `waitForXrayDashboard` — Register a wait for the automagic-dashboards GET the x-ray drill fires
- `waitForXrayCandidates` — Register a wait for the x-ray candidates GET (Cypress `@getXrayCandidates`
- `waitForRecentItems`
- `waitForPopularItems`
- `waitForDashboardGet`
- `waitForCollectionItems`
- `waitForCardQuery`
- `addSqliteDatabase` — Port of H.addSqliteDatabase / cy.addSQLiteDatabase: POST /api/database with
- `getDatabaseFields` — Port of H.withDatabase: fetch a database's metadata and build the
- `getXrayCandidatesFixture` — Port of the spec-local getXrayCandidates() fixture. */
- `stubXrayCandidates` — Port of `cy.intercept("/api/automagic-*​/database/**", getXrayCandidates())`:
- `pinItem` — Port of the spec-local pinItem(name): open the unpinned row's ellipsis menu

## i18n.ts
- `selectLocale` — Port of the spec-local `selectLocale`: open the profile page, pick a locale
- `visitPath` — Tolerant navigation, mirroring cy.visit's resilience: the homepage fires a

## iglu-validate.ts
- `validateIgluPayloads` — Validate decoded self-describing payloads against their declared Iglu

## impersonated.ts
- `PG_DB_ID` — The spec's own `const PG_DB_ID = 2`. Under the `postgres-12` snapshot the QA
- `PG_DB_NAME` — The QA Postgres12 database's display name, as the data picker labels it. */
- `IMPERSONATED_USER_EMAIL` — The `impersonated` fixture user (e2e/support/cypress_data.js:158-170):
- `IMPERSONATED_ROLE`
- `signInAsImpersonatedUser`
- `assertRunsAs` — Proves which user an API client is actually bound to. This is the guard
- `assertGroupIds` — Run-time re-check of the two group ids, resolved BY NAME from the live
- `assertPgDbId` — Verifies the spec's `PG_DB_ID = 2` literal against the live instance. */
- `setImpersonatedPermission` — Port of the spec-local `setImpersonatedPermission()`.
- `warmSqlParsingPool` — boot — that path never reaches `is-single-stmt-of-type?`, so it does not warm
- `getImpersonations` — Reads back the impersonation policy the graph write installed. Used as the

## instance-analytics.ts
- `ANALYTICS_COLLECTION_NAME`
- `CUSTOM_REPORTS_COLLECTION_NAME`
- `PEOPLE_MODEL_NAME`
- `METRICS_DASHBOARD_NAME`
- `getCollectionId` — Port of the spec-local getCollectionId: GET /api/collection, match by name. */
- `visitCollection` — Port of the spec-local visitCollection: look the collection up by name,
- `getItemId` — Port of the spec-local getItemId: the id of the named item inside the named
- `openQuestionInfoSidesheet` — Port of H.openQuestionInfoSidesheet (e2e-ui-elements-helpers.js): click the
- `openCollectionEntryMenu` — Port of the spec-local `cy.findAllByTestId("collection-entry").each(...)`

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

## invite-to-view.ts
- `PASSWORD` — Port of the spec-local PASSWORD. */
- `inviteEmail` — Port of the spec-local inviteEmail(). */
- `inviteFromShareMenu` — Port of the spec-local inviteFromShareMenu: open the Share menu on the
- `joinUrlFromEmail` — Port of the spec-local joinUrlFromEmail: pull the Join link out of a sent
- `completeSignup` — Port of the spec-local completeSignup: set a password on the new-user
- `enableGoogleSSO` — Port of the spec-local enableGoogleSSO(). Requires an admin session. */
- `revokeCollectionAccess` — Revoke a group's access to a collection through the collection graph

## joins-custom-expressions.ts
- `addJoinConditionCustomExpression` — Add one side of a join condition through the Custom Expression editor: the

## joins-reproductions.ts
- `MYSQL_SKIP_REASON`
- `POSTGRES_SKIP_REASON`
- `waitForDataset` — POST /api/dataset — the "@dataset" / "@postDataset" alias. */
- `waitForXray` — GET /api/automagic-dashboards/adhoc/** — the "@xray" alias. */
- `countDatasetResponses` — Port of `cy.wait("@postDataset")` repeated N times.
- `modifyColumn` — Port of the spec-local modifyColumn(columnName, action). `findByLabelText`
- `assertTableHeader` — Port of the spec-local assertTableHeader(index, name):
- `containsText` — Port of `cy.contains(text)` inside a scope: a case-sensitive SUBSTRING match

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

## legend.ts
- `echartsContainer` — ECharts SVG chart container, scoped to `scope`. */
- `chartPathWithFillColor` — Port of H.chartPathWithFillColor, scoped: the chart paths of a fill color. */
- `scatterBubbleWithColor` — Port of H.scatterBubbleWithColor (e2e-visual-tests-helpers.js), scoped. */
- `pieSlices` — Port of H.pieSlices (e2e-visual-tests-helpers.js), scoped. */
- `trendLine` — Port of H.trendLine (e2e-visual-tests-helpers.js), scoped. */
- `echartsText` — The `cy.findByText(...)` axis-label lookups the spec runs inside
- `hideSeries` — Port of the spec-local hideSeries(legendItemIndex): click the (visible-on-
- `showSeries` — Port of the spec-local showSeries(legendItemIndex). */
- `pieChartLegendItemPercentage` — Port of the spec-local getPieChartLegendItemPercentage(sliceName):

## line-bar-tooltips.ts
- `showTooltipForCircleInSeries` — Port of the spec-local showTooltipForCircleInSeries. `.trigger("mousemove")`
- `showTooltipForBarInSeries` — Port of the spec-local showTooltipForBarInSeries. Upstream uses `.realHover()`
- `testTooltipExcludesText` — Port of the spec-local testTooltipExcludesText: `cy.contains(text)` is a
- `updateColumnTitle` — Port of the spec-local updateColumnTitle: find the chart-settings input with
- `setup` — Port of the spec-local setup + setupDashboard: create the question (and an
- `testSumTotalChange`
- `testAvgTotalChange`
- `testCumSumChange`
- `testAvgDiscountChange`
- `testSumDiscountChange`

## line-chart.ts
- `visitLineChartAdhoc`
- `visitNativeLineChartAdhoc`
- `echartsExactText` — ECharts SVG `<text>` carries leading/trailing spaces, and Playwright's
- `openSeriesSettings` — Port of H.openSeriesSettings(field, isBreakout): open a series' settings
- `chartSettingSelectValues` — The current values of every chart-setting-select, in DOM order. */
- `expectFieldPickerHasGrabber` — Assert the field-picker for `value` renders a grabber (drag) icon. */
- `getXYTransform` — Port of getXYTransform: read the {x, y} translation of an SVG element from
- `triggerMousemove` — Port of Cypress's `.trigger("mousemove")` on a chart element: dispatch a
- `brushChart` — Port of the spec's `cy.findByTestId("query-visualization-root").trigger(

## maildev.ts
- `maildevSlot` — This process's slot, or `null` when per-worker isolation is off.
- `maildevWebUrl` — The maildev web API/UI origin THIS worker owns. */
- `maildevSmtpPort` — The SMTP port THIS worker's backend must be configured to deliver to. */
- `maildevEndpoint` — Human-readable endpoint pair, for the per-worker log line. */
- `ensureMaildev` — Bring up this worker's maildev if it isn't already up, then report whether a
- `removeSlotMaildevContainers` — Remove per-slot maildev containers. Called from global teardown, and safe to

## maps.ts
- `toggleFieldSelectElement` — Port of the spec-local toggleFieldSelectElement: open a chart-setting select
- `zoomIn` — Port of the spec-local zoomIn: click the leaflet zoom-in control `times`
- `getSettledMarkerPosition` — Port of the spec-local getSettledMarkerPosition (metabase#11211): read the
- `pinMapSelectRegion` — Port of the spec-local pinMapSelectRegion: visit a People pin map, arm the

## mcp-analytics.ts
- `MCP_ANALYTICS_PATH`
- `SEED_TOOL_NAME`
- `SEED_ERROR_TOOL`
- `SEED_ERROR_CODE`
- `SEED_ERROR_TYPE`
- `SEED_ERROR_MESSAGE`
- `seedMcpToolCall` — Port of the spec-local seedMcpToolCall: POST /api/testing/mcp/seed-tool-call
- `visitMcpAnalyticsPage` — Port of the spec-local visitMcpAnalyticsPage: register the audit-metadata
- `openToolCallsTab` — Click the "Tool calls" tab and wait for the events-table dataset query.

## mcp-apps-settings.ts
- `pointerReachesLink` — Faithful port of the spec's `realHover` + `mouseenter` probe: move the REAL
- `clickLinkWithoutFollowing` — Port of the spec's "click but preventDefault so the cursor:// deeplink is not

## measures-data-studio.ts
- `getMeasuresBaseUrl`
- `waitForMetadata` — GET /api/table/:id/query_metadata — the `@metadata` alias predicate. */
- `waitForCreateMeasure` — POST /api/measure — the `@createMeasure` alias predicate. */
- `waitForUpdateMeasure` — PUT /api/measure/:id — the `@updateMeasure` alias predicate. */
- `visitDataStudioMeasures` — Port of H.DataModel.visitDataStudioMeasures — navigate to a table's measures
- `visitDataStudioTable` — Port of the spec-local visitDataStudioTable → H.DataModel.visitDataStudio
- `visitDataModelMeasure` — Port of the spec-local visitDataModelMeasure: navigate straight to a
- `MeasureList`
- `MeasureEditor`
- `MeasureRevisionHistory`
- `createMeasure` — Port of H.createMeasure (e2e-table-metadata-helpers.js): POST /api/measure. */

## measures-published-tables.ts
- `publishedTableMeasuresUrl` — The published-table measures list route. */
- `visitPublishedTableMeasuresPage` — Port of H.DataStudio.Tables.visitMeasuresPage(tableId). */
- `visitPublishedTableMeasurePage` — Port of H.DataStudio.Tables.visitMeasurePage(tableId, measureId). */
- `tableMeasuresTab` — Port of H.DataStudio.Tables.measuresTab(): header().findByText("Measures"). */

## measures-queries.ts
- `MeasureEditor`
- `visitNewMeasurePage` — Port of H.DataStudio.Tables.visitNewMeasurePage(tableId):
- `clearCustomExpression` — Port of H.CustomExpressionEditor.clear(): focus, select all, backspace. */
- `typeCustomExpression` — Port of H.CustomExpressionEditor.type(): real keystrokes. `focus:false`
- `blurCustomExpression` — Port of H.CustomExpressionEditor.blur(): the upstream clicks the widget's
- `customExpressionName` — Port of H.CustomExpressionEditor.nameInput(): testid "expression-name". */
- `updateMeasure` — Port of H.updateMeasure: PUT /api/measure/:id. */
- `startNewMeasure` — Port of the spec's startNewMeasure. */
- `saveMeasure` — Port of the spec's saveMeasure: click Save, wait for POST /api/measure, and
- `expectUndoToast` — Assert an undo toast containing `text` is visible. Toasts stack and a
- `useMeasureInAdhocQuestion` — Port of the spec's useMeasureInAdhocQuestion. */
- `breakout` — Port of the spec's breakout(columnName). */
- `verifyScalarValue` — Port of the spec's verifyScalarValue. */
- `verifyRowValues` — Port of the spec's verifyRowValues (a custom H.assertTableData that allows

## metabot-query-builder.ts
- `allOrdersQuestion` — Port of the spec's module-level `allOrdersQuestion`. */
- `AGENT_STREAMING_PATH`
- `waitForAgentRequest` — The Cypress spec waits on the `@metabotAgent` alias set by mockMetabotResponse
- `mockNavigateToResponse` — Port of mockNavigateToResponse. */
- `mockTextOnlyResponse` — Port of mockTextOnlyResponse. */
- `mockGeneratedEntityResponse` — Port of mockGeneratedEntityResponse. */
- `mockErrorResponse` — Port of mockErrorResponse. */
- `mockPromptSuggestions` — Port of `cy.intercept("GET", "/api/metabot/metabot/*​/prompt-suggestions*", …)`.

## metabot-usage-auditing.ts
- `ADMIN_USER_ID` — Port of ADMIN_USER_ID (cypress_sample_instance_data.js). */
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
- `ADMINISTRATORS_GROUP_ID` — Port of ADMINISTRATORS_GROUP_ID (cypress_sample_instance_data.js). */
- `METRIC_TAB_NAMES`
- `BOBBY_TENANT`
- `ROBERT_TENANT`
- `TENANT_CONVERSATIONS_CHART_TITLE`
- `CHART_RENDER_TIMEOUT`
- `METRIC_CHART_TITLES`
- `DATE_FILTER_CASES`
- `MAIN_PROFILE_LABELS`
- `seedUsageAuditingData`
- `setupUsageAuditingTenants`
- `visitUsageStatsPage`
- `visitConversationsPage`
- `getChartCard` — Port of getChartCard: the parent of the chart's title text. */
- `assertChartRendered` — Port of assertChartRendered: the chart card mounts its container + <svg>. */
- `assertMetricChartsRendered`
- `assertMetricChartsRenderedForDate`
- `selectMetricTab`
- `selectGroupFilter`
- `selectUserFilter`
- `selectTenantFilter`
- `selectDateFilter`
- `assertConversationTableContains`
- `assertConversationTableDoesNotContain`
- `assertTodayConversationTable`
- `assertLatestHourConversationTable`
- `assertHourDateFilterInUrl`
- `clickLastTimeseriesChartDot` — Port of clickLastTimeseriesChartDot: drill by clicking the last symbol circle
- `clickRowChartBarForLabel` — Port of clickRowChartBarForLabel: drill by clicking the row-chart bar whose
- `openConversationFromProfile`
- `assertConversationDetailProfile`
- `waitForConversationsResponse` — Register a wait for the conversations-list GET before a drill click. */
- `waitForConversationsRequest` — Register a wait for a table-sort conversations GET before the sort click. */

## metabot.ts
- `metabotChatSidebar`
- `assertChatVisibility`
- `openMetabotViaShortcutKey`
- `closeMetabotViaShortcutKey`
- `openMetabotViaSearchButton`
- `closeMetabotViaCloseButton`
- `metabotChatInput`
- `sendMetabotMessage`
- `chatMessages`
- `lastChatMessage`
- `createMetabotSSEBody` — Arguments are flattened one level, so parts compose without spreading:
- `metabotTextPart` — A streamed assistant text message, emitted as start/delta/end events. */
- `metabotDataPart` — A `data-{subtype}` part, e.g. `metabotDataPart("state", { queries: {} })`. */
- `metabotErrorPart` — A streamed error message. */
- `metabotFinishPart` — The trailing finish event; carries the finish reason and usage metadata. */
- `mockMetabotResponse` — Port of H.mockMetabotResponse. Fulfils POST /api/metabot/agent-streaming with

## metric-page.ts
- `MetricPageExtras` — The remaining MetricPage locators (e2e-metric-page-helpers.ts). Header tabs
- `setupNotificationChannel` — Port of H.setupNotificationChannel (e2e-notification-helpers.ts): register an
- `editMetricDescription` — sidebar.within(() => cy.findByText(old).click());

## metrics-browse.ts
- `metricsTable` — Port of the spec-local metricsTable: cy.findByLabelText("Table of metrics"). */
- `findMetric` — Port of the spec-local findMetric: metricsTable().findByText(name) (exact). */
- `getMetricsTableItem` — Port of the spec-local getMetricsTableItem: the index-th metric-name cell. */
- `shouldHaveBookmark` — Port of the spec-local shouldHaveBookmark. */
- `shouldNotHaveBookmark` — Port of the spec-local shouldNotHaveBookmark. */
- `verifyMetric` — Port of the spec-local verifyMetric: open the metric, verify it from the more
- `unverifyMetric` — Port of the spec-local unverifyMetric. */
- `waitForMetricVerified` — Poll until the metric's search-index verified status settles. */
- `waitForMetricSearchable` — Poll until the metric is present in the search-backed browse list. */
- `toggleVerifiedMetricsFilter` — Port of the spec-local toggleVerifiedMetricsFilter. */
- `spyOnWindowOpen` — Port of the Cypress `cy.on("window:before:load", win => cy.stub(win, "open"))`
- `getWindowOpenCalls` — The window.open calls recorded by spyOnWindowOpen, as [url, target, ...]. */
- `forceVerifiedMetricsSessionProperty` — Port of the Cypress `cy.intercept("GET", "/api/session/properties", …)` that
- `assertMetricDescriptionEllipsified` — Assert the ellipsified markdown cell truncates (metricsTable helper). */

## metrics-editing.ts
- `MetricEditor` — The metric query-editor surface (e2e-metric-page-helpers.ts MetricPage) not
- `runButtonInOverlay` — Port of H.runButtonInOverlay: the run button inside the run-button-overlay. */
- `getActionButton` — Port of the spec-local getActionButton: the notebook action button by title,
- `startNewMetric` — Port of startNewMetric (e2e-ad-hoc-question-helpers.js): visit /metric/new. */
- `startNewMetricWithTable` — Port of the spec-local startNewMetricWithTable. */
- `startNewMetricWithSavedItem` — Port of the spec-local startNewMetricWithSavedItem. */
- `saveNewMetric` — Port of the spec-local saveNewMetric: click Save, confirm the modal, wait for
- `startNewJoin` — Port of the spec-local startNewJoin. */
- `startNewCustomColumn` — Port of the spec-local startNewCustomColumn. */
- `startNewFilter` — Port of the spec-local startNewFilter. */
- `startNewAggregation` — Port of the spec-local startNewAggregation. */
- `startNewBreakout` — Port of the spec-local startNewBreakout. */
- `addStringCategoryFilter` — Port of the spec-local addStringCategoryFilter. */
- `addBreakout` — Port of the spec-local addBreakout. */
- `verifyScalarValue` — Port of the spec-local verifyScalarValue. */
- `verifyLineAreaBarChart` — Port of the spec-local verifyLineAreaBarChart. */

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

## metrics-reproductions.ts
- `delayQueryMetadata` — Port of the issue-47058 intercept: hold every GET /api/card/:id/query_metadata
- `waitForQueryMetadata` — Await the next GET /api/card/:id/query_metadata response (the delayed one). */

## metrics-search.ts
- `waitForSearch` — Register a wait for the next /api/search response (PORTING rule 2 —
- `commandPaletteSearch` — Port of H.commandPaletteSearch(query, viewAll = true): open the palette,

## metrics.ts
- `MetricPage`
- `undoToast`
- `visitMetric` — Port of H.visitMetric: navigate and wait for the metric's query. */
- `filterInNotebook` — Port of H.filter({ mode: "notebook" }) from e2e-bi-basics-helpers.js. */
- `cartesianChartCircles`
- `changeBinningForDimension` — Port of H.changeBinningForDimension: hover the dimension row, click its

## mid-stream-download-failure.ts
- `FAILS_MID_STREAM_QUERY` — A native query that streams fine for the capped preview (the query builder
- `triggerDownload` — Open the download popover, pick the file type, and trigger the export.
- `expectDownloadError` — Port of the final assertion: the aborted stream surfaces as a download error,

## model-actions.ts
- `IMPERSONATED_USER_ID` — Port of IMPERSONATED_USER_ID (e2e/support/cypress_sample_instance_data.js) —
- `USER_GROUPS` — Mirrors USER_GROUPS (e2e/support/cypress_data.js:42) — fixed ids baked into
- `getCreatePostgresRoleIfNotExistSql` — Port of getCreatePostgresRoleIfNotExistSql (e2e/support/test_roles.js). */
- `updatePermissionsGraph` — Port of cy.updatePermissionsGraph (e2e/support/commands/permissions/
- `createImplicitActions` — Port of H.createImplicitActions (e2e-action-helpers.js). */
- `isGetModel` — cy.intercept("GET", "/api/card/*") — the Cypress glob stops at "/". */
- `isGetAction` — cy.intercept("GET", "/api/action/*"). */
- `isUpdateAction` — cy.intercept("PUT", "/api/action/*"). */
- `isCreateAction` — cy.intercept("POST", "/api/action"). */
- `isExecuteAction` — cy.intercept("POST", "/api/action/:id/execute") (glob "/api/action/&ast;/execute"). */
- `isEnableActionSharing` — cy.intercept("POST", "/api/action/:id/public_link"). */
- `isDisableActionSharing` — cy.intercept("DELETE", "/api/action/:id/public_link"). */
- `actionList` — cy.findByLabelText("Action list") — the <ul aria-label="Action list">. */
- `actionListItem` — cy.findByRole("listitem", { name }) — <li aria-label={action.name}>. */
- `fillActionQuery` — Port of H.fillActionQuery — NativeEditor.type(query) (append at caret end). */
- `recordGetAction` — Port of `cy.intercept("GET", "/api/action/*").as("getAction")`.
- `waitForGetAction` — Port of cy.wait("@getAction") — pops the next unconsumed response. */
- `runActionFor` — Port of the spec-local runActionFor: click the row's play icon, then
- `openActionMenuFor` — Port of the spec-local openActionMenuFor. */
- `openActionEditorFor` — Port of the spec-local openActionEditorFor. */
- `assertQueryEditorDisabled` — Port of the spec-local assertQueryEditorDisabled.
- `createBasicActions` — Port of the spec-local createBasicActions.
- `enableSharingFor` — Port of the spec-local enableSharingFor. Returns the public URL rather than
- `disableSharingFor` — Port of the spec-local disableSharingFor. */
- `verifyScoreValue` — Port of the spec-local verifyScoreValue. */
- `resetAndVerifyScoreValue` — Port of the spec-local resetAndVerifyScoreValue. */
- `formFieldContainer` — cy.findAllByTestId("form-field-container").filter(":contains('X')") — the

## model-indexes.ts
- `selectModelColumn` — Select a column in the model metadata editor. The shared
- `createModelIndex` — Port of H.createModelIndex({ modelId, pkName, valueName }): field ids are
- `waitForIndexedValueSearchable` — Wait until a freshly indexed value is searchable. Creating a model index
- `trackCardGets` — Port of the spec's `@cardGet` intercept + `expectCardQueries` assertion:

## model-to-transform.ts
- `QA_DB_SKIP_REASON`
- `SOURCE_TABLE`
- `OUTPUT_TABLE_SLUG`
- `OUTPUT_TABLE_LABEL`
- `SOURCE_TABLE_LABEL`
- `MIGRATE_MODELS_PATH`
- `SOURCE_ROW_NAME`
- `SOURCE_ROW_NAME_2`
- `CATEGORY_FILTER_ID`
- `dropAllTestTables` — Port of the spec-local dropAllTestTables. */
- `createTestTables` — Port of the spec-local createTestTables.
- `getWritableTableId` — Port of the spec-local getTableId (which pins databaseId to WRITABLE_DB_ID). */
- `createSourceModel` — Port of the spec-local createSourceModel. */
- `createQuestionOnModel` — Port of the spec-local createQuestionOnModel. */
- `createQuestionOnCard` — Port of the spec-local createQuestionOnCard. Byte-identical in body to
- `createQuestionJoiningModel` — Port of the spec-local createQuestionJoiningModel. */
- `createFilteredDashboardOnModel` — Port of the spec-local createFilteredDashboardOnModel. */
- `waitForModelInSearch` — `MigrateModelsPage` reads its model list from
- `waitForDependencyBackfill` — `waitForReplacementToComplete` is happy and the failure surfaces much later
- `openMigrateModelsPage` — Port of the spec-local openMigrateModelsPage. */
- `selectModelInTable` — Port of the spec-local selectModelInTable. */
- `convertTriggerButton` — The sidebar's "Convert to a transform" trigger. */
- `openReplaceWithTransformModal` — Port of the spec-local openReplaceWithTransformModal. */
- `tableNameInput` — `findByLabelText` is EXACT; Playwright's `getByLabel` is a SUBSTRING match
- `getSubmitButton` — Port of the spec-local getSubmitButton. */
- `submitReplaceWithTransformForm` — Port of the spec-local submitReplaceWithTransformForm.
- `waitForReplacementToComplete` — Port of the spec-local waitForReplacementToComplete.
- `convertModelToTransform` — Port of the spec-local convertModelToTransform. */
- `assertSourceRowsVisible` — Port of the spec-local assertSourceRowsVisible. `findAllByText(string)` is an
- `assertDataSourceIs` — Port of the spec-local assertDataSourceIs.

## models-core.ts
- `turnIntoModel` — Port of turnIntoModel (e2e-models-helpers.js): open the question actions,
- `waitForCardUpdate` — Register a wait for the next PUT /api/card/:id (the `@cardUpdate` alias). */
- `assertIsModel` — Port of assertIsModel (requires the question-actions popover to be open):
- `assertIsQuestion` — Port of assertIsQuestion (requires the question-actions popover to be open):
- `assertQuestionIsBasedOnModel` — Port of assertQuestionIsBasedOnModel: the QB shows the model + its
- `saveQuestionBasedOnModel` — Port of saveQuestionBasedOnModel: open the save modal, optionally rename,
- `selectDimensionOptionFromSidebar` — Port of selectDimensionOptionFromSidebar: click a dimension-list row by name
- `closeQuestionActions` — Port of closeQuestionActions: click the QB header to dismiss the menu. */
- `getCollectionItemRow` — Port of getCollectionItemRow: findByText(name).closest("tr"). */
- `getCollectionItemCard` — Port of getCollectionItemCard: findByText(name).closest("a"). */
- `getResults` — Port of getResults: cy.findAllByTestId("result-item"). */
- `waitForSearch` — Register a wait for the next GET /api/search* (the `@search` alias). */

## models-create.ts
- `navigateToNewModelPage` — Port of the spec-local navigateToNewModelPage(queryType): visit /model/new
- `waitForCreateModel` — Register the wait behind the spec's `cy.intercept("POST", "/api/card")`
- `checkIfPinned` — Port of the spec-local checkIfPinned(modelName): navigate to the root

## models-list-view.ts
- `ACCENT1_RGB` — The Cypress spec asserts `Color(colors["accent1"]).rgb().toString()`.
- `tableHeaderClick` — Port of H.tableHeaderClick(/Subtotal/i): the notebook.ts tableHeaderClick
- `saveChangesAndWaitForDataset` — Port of the spec's Save-changes flow in the model-metadata editor:
- `dragColumnOnto` — Port of H.dragAndDropByElement(subject, target, { dragend: false }) — the
- `expectFirstImgAriaLabel` — Port of the repeated `cy.findAllByRole("img").first().should("have.attr",

## models-metadata.ts
- `openColumnOptions` — Port of H.openColumnOptions: click a column's header cell in the model
- `renameColumn` — Port of H.renameColumn: set the "Display name" field in the right sidebar,
- `setColumnType` — Port of H.setColumnType: the right sidebar's "Column type" select. Assert the
- `mapColumnTo` — Port of H.mapColumnTo: for a native-model column, map it to a real database
- `startQuestionFromModel` — Port of startQuestionFromModel (e2e-models-helpers.js): New -> Question ->

## models-reproductions-1.ts
- `getHeaderCell` — Port of the issue-29943 spec-local getHeaderCell: assert the columnIndex-th
- `assertColumnSelected` — Port of the issue-29943 spec-local assertColumnSelected: the header cell's
- `expectNoDisplayValue` — Port of the issue-35840 `cy.findByDisplayValue("Category, Category")
- `countDatasetRequests` — Port of the `cy.intercept("POST", "/api/dataset").as("dataset")` +

## models-reproductions-2.ts
- `openQuestionActionsItem` — Open the question-actions ellipsis menu and click a menu item by accessible
- `waitForLoaderToBeRemoved` — Port of H.waitForLoaderToBeRemoved: the loading-indicator is gone. */
- `datasetEditBar` — Port of H.datasetEditBar (e2e-models-metadata-helpers.js). */
- `runButtonInOverlay` — Port of H.runButtonInOverlay: the run button inside the run-button-overlay. */
- `saveMetadataChanges` — Port of H.saveMetadataChanges: click "Save changes" in the dataset edit bar,
- `startNewModel` — Port of H.startNewModel: visit the ad-hoc URL that clicking "New" > "Model" >
- `startNewNativeModel` — Port of H.startNewNativeModel: visit the ad-hoc URL that clicking "New" >
- `visitModelNoDataAccess` — Port of H.visitModel(id, { hasDataAccess: false }): visit a model whose

## models-reproductions-3.ts
- `countCardRequests` — Port of the `cy.intercept("GET", "/api/card/*").as("card")` +

## models-reproductions.ts
- `mapModelColumnToDatabase` — Port of the spec-local mapModelColumnToDatabase: open the "Database column
- `selectModelColumn` — Port of the spec-local selectModelColumn: click the metadata-editor header

## models-revision-history.ts
- `openRevisionHistory` — Port of the spec-local openRevisionHistory: open the question-info sidesheet,
- `revertTo` — Port of the spec-local revertTo(history): find the revision-history-event

## models.ts
- `tableInteractive` — Port of H.tableInteractive(). */
- `openQuestionActions` — Port of H.openQuestionActions: the ellipsis menu in the QB header. */
- `summarize` — Port of H.summarize({ mode }): the sum icon in the notebook action toolbar,
- `selectFromDropdown` — Port of selectFromDropdown (models helpers): clicks an option in the
- `waitForDataset` — POST /api/dataset response — the wait behind H's "@dataset" alias. */
- `visitModel` — Port of H.visitModel (hasDataAccess variant): visit the model page and wait
- `runNativeQuery` — Port of H.runNativeQuery: click the play button in the native editor, wait
- `createNativeModel` — Port of H.createNativeQuestion({ type: "model", ... }). Mirrors the Cypress

## multi-factor-auth.ts
- `mfaSetting` — Port of the spec-local mfaSetting(). */
- `mfaToggle` — Port of the spec-local mfaToggle() — `findByLabelText(/Enabled|Disabled/)`.
- `loginPage` — The auth page shell (`cy.findByTestId("login-page")`). */
- `authenticatorCodeInput` — `findByLabelText("Authenticator code")` → exact (PORTING rule 1). */
- `recoveryCodeInput` — `findByLabelText("Recovery code")` → exact. */
- `confirmCodeInput` — `findByLabelText("Confirm with an authenticator code or a recovery code")`
- `button` — Port of `cy.button(name)` — findByRole("button", { name }), exact for
- `waitForEnforcement` — Port of `cy.intercept("PUT", "/api/setting/mfa-enforcement")`. */
- `waitForEnroll` — Port of `cy.intercept("POST", "/api/ee/mfa/enroll")`. */
- `waitForRecoveryCodes` — Port of `cy.intercept("POST", "/api/ee/mfa/recovery-codes")`. */
- `enableMfa` — Port of the spec-local enableMfa(). Requires an admin session. */
- `enrollNormalUser` — Port of the spec-local enrollNormalUser(): sign in as the normal user and
- `clickAuthTextButton` — These sit inside the same `<Form>` as the autofocused code input, so the
- `enrollViaUI` — Port of the spec-local enrollViaUI(): drive the whole setup modal from the
- `signInWithPassword` — Port of the spec-local signInWithPassword(): sign out, then log the normal
- `getResetLink` — Port of the spec-local getResetLink(): the href of the email's first anchor. */
- `generateTotpCode` — Port of the spec-local generateTotpCode(). SHA1 / 6 digits / 30s, matching

## multiple-column-breakouts.ts
- `createAndVisitQuestion` — Port of H.createQuestion(details, { visitQuestion: true }). */
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

## native-database-source.ts
- `QA_DB_SKIP_REASON`
- `nativeQueryTopBar` — cy.findByTestId("native-query-top-bar"). */
- `selectedDatabase` — cy.findByTestId("selected-database"). */
- `startNativeQuestion` — Port of the spec-local `startNativeQuestion()`.
- `startNativeModel` — Port of the spec-local `startNativeModel()`.
- `assertNoDatabaseSelected` — Port of the spec-local `assertNoDatabaseSelected()`.
- `selectDatabase` — Port of the spec-local `selectDatabase(database)`. */
- `assertSelectedDatabase` — Port of the spec-local `assertSelectedDatabase(name)`. Returns the
- `enableModelActionsForDatabase` — Port of the spec-local `enableModelActionsForDatabase(id)`. */
- `PersistDatabaseRecorder` — The `@persistDatabase` alias:

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

## native-filters-reproductions.ts
- `expectLocationSearch` — Port of `cy.location("search").should("eq", value)`. Cypress RETRIES this
- `nextSibling` — Port of a Cypress `.next()`: the element's immediately following sibling. */
- `variableNameFields` — Port of `cy.findAllByText("Variable name").parent()` — the tag-editor blocks,
- `variableNameLabels` — Port of `cy.findAllByText("Variable name").next()` — the input that follows
- `addDefaultStringFilter` — cy.findByText("Enter a default value…").click();
- `visitQuestionUrlAwaitingCardQuery` — `cy.visit(url)` for a saved question, waiting on the same

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

## native-query-drill.ts
- `ensureEchartsContainerHasSvg` — Port of H.ensureEchartsContainerHasSvg (e2e-visual-tests-helpers.js): the
- `applyBrushFilter` — Port of the spec-local applyBrushFilter: wait for the chart svg to exist,
- `applyBoxFilter` — .realMouseDown({ x: left, y: top })

## native-reproductions-js.ts
- `clearBrowserCache` — Port of H.clearBrowserCache: `Cypress.automation("remote:debugger:protocol",
- `recordRequests` — Passive request recorder — the Playwright shape for
- `isAutocompleteRequest` — Matcher for the autocomplete endpoint of a given database. */

## native-reproductions.ts
- `startNewNativeModel` — Port of H.startNewNativeModel: the hash clicking "New" > "Model" >
- `startNewNativeQuestionWithoutDatabase` — Port of H.startNewNativeQuestion({ database: null, query: "" }) — the
- `fastSetNativeEditor` — Port of H.NativeEditor.type(text, { allowFastSet: true }).
- `blurNativeEditor` — Port of H.NativeEditor.blur(): jQuery `.blur()` on `.cm-content`. */
- `selectAllInNativeEditor` — Port of H.NativeEditor.selectAll(): focus, then cmd/ctrl+A. */
- `pressNextCompletion` — Port of `{nextcompletion}` in H.NativeEditor.type: a 50ms settle, then
- `createTestNativeQuery` — Port of H.createTestNativeQuery (api/createTestQuery.ts). */
- `createCard` — Port of H.createCard (api/createCard.ts) including its DEFAULT_CARD_DETAILS. */
- `findOverflowingDescendants` — Port of H.assertDescendantNotOverflowsContainer applied to every descendant
- `outerSize` — jQuery `.outerWidth()` / `.outerHeight()` — the element's border box. */
- `triggerMouseEvent` — Port of Cypress `.trigger("mousedown"|"mousemove"|"mouseup", ...)`: a
- `clientRect` — The viewport rect of an element, read page-side in one round trip. */
- `repeatAssertion` — Port of H.repeatAssertion(assertFn, timeout = 4000, interval = 400): run the
- `getRunQueryButton` — Port of `cy.findByTestId("native-query-editor-container").findByTestId("run-button")`. */
- `nativeEditorDataSource` — Port of H.nativeEditorDataSource(): `findAllByTestId("gui-builder-data").first()`. */
- `expectNotDirty` — Assert the play icon is gone — the tail of H.runNativeQuery, which runs

## native-sql-generation.ts
- `inlinePrompt`
- `inlinePromptInput` — inlinePrompt().find(".ProseMirror[contenteditable=true]") */
- `generateButton`
- `cancelButton`
- `errorMessage`
- `acceptButton`
- `rejectButton`
- `generatingLoader`
- `toggleInlineSQLPrompt` — Port of the spec-local toggleInlineSQLPrompt: focus the native editor, let it
- `openInlineSQLPrompt` — /api/metabot/permissions/user-permissions) resolving. On a cold or
- `typeInlinePrompt` — Click the ProseMirror prompt input, assert it took focus (PORTING rule 5),
- `mockCodeEditResponse` — Port of the spec-local mockCodeEditResponse. */
- `mockTextOnlyResponse` — Port of the spec-local mockTextOnlyResponse. */
- `mockMetabotResponseWithDelay` — Like support/metabot.ts mockMetabotResponse, but holds the response for
- `isAgentStreamingRequest` — POST /api/metabot/agent-streaming — path predicate for waitForResponse. */

## native-table-tags.ts
- `variableTypeSelect` — Port of `cy.findByTestId("variable-type-select")`. */
- `mapTableTag` — Assign the currently-shown template tag the "Table" variable type and map it

## native.ts
- `MONGO_SKIP_REASON`
- `waitForDataset` — POST /api/dataset — the spec's "@dataset" alias. */
- `waitForDatasetNative` — POST /api/dataset/native — the spec's "@datasetNative" alias. */
- `waitForCardPost` — POST /api/card — the spec's "@card" alias. */
- `waitForCardGet` — GET /api/card/:id — the spec's "@cardQuestion" alias. */
- `runQuery` — Port of the spec-local `runQuery()`:
- `sidebarHeaderTitle` — Port of the spec-local `sidebarHeaderTitle()`. */
- `dataReferenceSidebar` — Port of the spec-local `dataReferenceSidebar()`. */
- `expectEditorTextContent` — The exact `textContent` of the editor, i.e. what chai-jquery's
- `expectLineTextContent` — Same, for a single `.cm-line`. */
- `nativeEditorValue` — Port of H.NativeEditor.value(): join the editor's `.cm-line` text nodes
- `setViewport` — Port of `cy.viewport(w, h)` + the spec's `cy.wait(100)` "wait for UI to
- `pressRepeatedly` — Press a key `times` times, paced.
- `clickAndType` — Port of `cy.type()` onto an input whose placeholder is its only handle.

## nested-questions.ts
- `waitForDataset` — Register a wait for the next POST /api/dataset response. Must be called
- `summarize` — Port of H.summarize (default, non-notebook mode). */
- `filter` — Port of H.filter (default, non-notebook mode). */
- `getDimensions`
- `getDimensionByName` — Port of H.getDimensionByName: substring, case-sensitive (cy :contains). */
- `selectFilterOperator`
- `saveQuestionToCollection`

## new-menu.ts
- `openNewMenu` — Port of the spec beforeEach's `cy.visit("/")` + `cy.findByText("New").click()`:

## notebook-data-source.ts
- `QA_DB_SKIP_REASON`
- `TOKEN_SKIP_REASON`
- `ORDERS_MODEL_ID` — Ports of cypress_sample_instance_data.js lookups. */
- `ORDERS_COUNT_QUESTION_ID`
- `SECOND_COLLECTION_ID`
- `openDataSelector` — Port of the spec-local openDataSelector(). */
- `dataStepCell`
- `clickMiniPickerItem` — The mini picker's item list is a `VirtualizedList` (@tanstack/react-virtual,
- `assertDataPickerEntitySelected` — Port of assertDataPickerEntitySelected(level, name):
- `assertDataPickerEntityNotSelected` — Port of assertDataPickerEntityNotSelected(level, name):
- `moveToCollection` — Port of the spec-local moveToCollection(collection).
- `recordCollectionTree` — Records GET /api/collection/tree* responses from the point of the call. */
- `recordResponses` — A minimal port of Cypress's alias queue: responses matching `predicate` are
- `saveQuestionToCollection` — Port of H.saveQuestionToCollection(name) → H.saveQuestion(name, undefined,

## notebook-link-to-data-source.ts
- `METAKEY` — Port of METAKEY (frontend/src/metabase/utils/browser.ts): "⌘" on macOS, else
- `SANDBOXED_ATTR_UID` — USERS.sandboxed.login_attributes.attr_uid === "1" (cypress_data.js). The port's
- `metaClick` — Port of H.click(H.holdMetaKey): ctrl/cmd-click. "ControlOrMeta" maps to Meta on
- `openDataSourceInSameTab` — Port of the beforeEach window.open stub. The app opens a data source in a new
- `assertDatasetReqIsSandboxed` — Port of H.assertDatasetReqIsSandboxed (e2e-permissions-helpers.js): the

## notebook-native-preview-sidebar.ts
- `MONGO_SKIP_REASON`
- `ORDERS_COUNT_QUESTION_ID` — Port of ORDERS_COUNT_QUESTION_ID (e2e/support/cypress_sample_instance_data.js:26).
- `openReviewsTableNotebook` — builds ONE query object (`{"source-table", limit}`) and `mode` only picks the
- `previewSidebar`
- `openSidebar` — Port of the spec-local `openSidebar(variant)`.
- `closeSidebar` — Port of the spec-local `closeSidebar(variant)`. */
- `previewEditor` — The preview's CodeMirror content, scoped to the sidebar.
- `previewSql` — The generated SQL as RAW text.
- `expectPreviewSql` — Poll the preview's raw text until `assertion` holds. Cypress's
- `waitForNativeDataset` — POST /api/dataset/native — the spec's "@nativeDataset" alias. */
- `waitForDataset` — POST /api/dataset — the spec's "@dataset" alias (convertToSql). */
- `waitForSessionProperties` — GET /api/session/properties — the spec's "@sessionProperties" alias. */
- `waitForUpdateSidebarWidth` — PUT /api/setting/notebook-native-preview-sidebar-width — "@updateSidebarWidth". */
- `sidebarWidth` — The sidebar's rendered width, i.e. `$sidebar[0].getBoundingClientRect().width`. */
- `resizeSidebar` — attaches `mousedown` through React's delegated listener on the handle and then
- `scrollResultsToCell` — container's documents, not of Metabase. Measured on this box's
- `convertToSql` — Port of the spec-local `convertToSql()`. */

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
- `startNewQuestion` — Port of the CURRENT H.startNewQuestion (e2e-ad-hoc-question-helpers.js): a
- `assertQueryBuilderRowCount` — Port of H.assertQueryBuilderRowCount. */
- `tableHeaderColumn`
- `tableHeaderClick`
- `expressionEditorWidget`
- `enterCustomColumnDetails` — Minimal port of H.enterCustomColumnDetails: CodeMirror expression input via

## nulls.ts
- `findGridcell` — Port of the spec-local `findGridcell(text)`:
- `nextCell` — Port of jQuery `.next()` on a gridcell: the immediately-following sibling

## object-detail.ts
- `QA_DB_SKIP`
- `COMPOSITE_PK_TABLE`
- `NO_PK_TABLE`
- `resetTestTable` — Port of H.resetTestTable({ type, table }) (cy.task("resetTable") →
- `listWritableTables` — Diagnostic used to record what the shared writable container actually holds
- `getRow` — Port of the spec-local `getRow(rowIndex)` — `cy.get('[data-index=N]')`.
- `getShortcutRow` — The frozen-quadrant copy of a row — the one carrying `detail-shortcut`. */
- `getObjectDetailShortcut` — Port of the spec-local `getObjectDetailShortcut(rowIndex)`:
- `drillPK` — Port of the spec-local `drillPK({ id })`:
- `drillFK` — Port of the spec-local `drillFK({ id })`. */
- `assertDetailView` — Port of the spec-local `assertDetailView({ id, heading, subtitle, byFK })`.
- `assertOrderDetailView`
- `assertUserDetailView`
- `getPreviousObjectDetailButton` — Port of the spec-local getPreviousObjectDetailButton. */
- `getNextObjectDetailButton` — Port of the spec-local getNextObjectDetailButton. */
- `objectDetail` — `cy.findByTestId("object-detail")`. */
- `waitForDataset` — Register BEFORE the triggering action; await after (rule 2). */

## official-collections.ts
- `COLLECTION_NAME`
- `TEST_QUESTION_QUERY`
- `getPartialPremiumFeatureError` — Port of H.getPartialPremiumFeatureError (e2e-enterprise-helpers.js): the
- `createOfficialCollection` — Port of H.createCollection({ authority_level }): POST /api/collection. */
- `openCollection` — Port of the spec-local openCollection. findByText is exact. */
- `createAndOpenOfficialCollection` — Port of the spec-local createAndOpenOfficialCollection: create an official
- `changeCollectionTypeTo` — Port of the spec-local changeCollectionTypeTo. */
- `assertNoCollectionTypeInput` — Port of the spec-local assertNoCollectionTypeInput. */
- `assertHasCollectionTypeInput` — Port of the spec-local assertHasCollectionTypeInput. */
- `assertNoCollectionTypeOption` — Port of the spec-local assertNoCollectionTypeOption. `scope` mirrors the two
- `assertSidebarIcon` — Port of the spec-local assertSidebarIcon: the collection's sidebar row (the
- `assertSearchResultBadge` — Port of the spec-local assertSearchResultBadge: within the search-app, the
- `assertHasCollectionBadgeInNavbar` — Port of the spec-local assertHasCollectionBadgeInNavbar. */
- `testOfficialBadgeInSearch` — Port of testOfficialBadgeInSearch: one search query, then assert the badge
- `testOfficialBadgePresence` — Port of the module-level testOfficialBadgePresence. */
- `testOfficialQuestionBadgeInRegularDashboard` — Port of the module-level testOfficialQuestionBadgeInRegularDashboard. */

## offset.ts
- `addCustomAggregation` — Port of the spec-local addCustomAggregation. */
- `addBreakout` — Port of the spec-local addBreakout. */
- `saveQuestion` — Port of the spec-local saveQuestion. Registers the POST /api/card wait
- `verifyLineChart` — Port of the spec-local verifyLineChart. */
- `verifyTableContent` — Port of the spec-local verifyTableContent. */
- `verifyNoQuestionError` — Port of the spec-local verifyNoQuestionError. */
- `verifyInvalidColumnName` — Port of the spec-local verifyInvalidColumnName. */
- `createOffsetOptions` — Port of the spec-local createOffsetOptions. */

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

## onboarding-setup.ts
- `restoreBlank` — pass `failOnStatusCode: false` there — **throws**.
- `setupForms` — `cy.findByTestId("setup-forms")`. */
- `typeInto` — `cy.type()` fires a real key event per character and re-resolves its subject
- `clearAndType` — `.clear().type(text)` */
- `skipWelcomePage` — Port of the spec's `skipWelcomePage`. */
- `fillUserAndContinue` — Port of the spec's `fillUserAndContinue`. Call with `setupForms(page)`. */
- `skipLicenseStepOnEE` — Port of the spec's `skipLicenseStepOnEE`. Call with `setupForms(page)`. */
- `typeToken` — Port of the spec's `typeToken`. Upstream flips the input to `type=password`
- `navigateToDatabaseStep` — Port of the spec's `navigateToDatabaseStep`: visit /setup with the user
- `selectLanguage` — Port of the spec's `selectLanguage`. The translations request is registered
- `expectSetupCardNotVisible` — after a DB is selected  (shown):   y = 574  -> within the fold, fails
- `expectPathname` — `cy.location("pathname").should("eq", expected)` — retried, per PORTING. */
- `lastSection` — The last `<section>` on the page — upstream's `cy.get("section").last()`. */

## onboarding-sso.ts
- `setupFakeGoogleAuth` — Port of the spec's beforeEach block: set a fake Google client ID and enable
- `signInWithEmailLink` — The "Sign in with email" link on the SSO card screen (PasswordButton renders

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

## performance-caching.ts
- `ORDERS_COUNT_QUESTION_ID` — Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). Derived
- `cacheStrategySidesheet` — Port of H.cacheStrategySidesheet: the caching-settings dialog. Returned as a
- `cacheStrategySelect` — Port of H.cacheStrategySelect: the strategy dropdown inside the invalidation
- `cacheStrategyForm` — The strategy invalidation form. findByRole name string → exact (rule 1). */
- `selectCacheStrategy` — Port of H.selectCacheStrategy: open the strategy dropdown and pick an option
- `saveCacheStrategyForm` — Port of the spec-local saveCacheStrategyForm: click Save in the invalidation
- `openSidebarCacheStrategyForm` — Port of the spec-local openSidebarCacheStrategyForm: open the settings
- `cancelConfirmationModal` — Port of the spec-local cancelConfirmationModal. The confirm-modal test id is
- `preemptiveCachingSwitch` — Port of the spec-local preemptiveCachingSwitch. */
- `preemptiveCachingSwitchInput` — The role="switch" input inside the preemptive-caching switch. Toggled by

## permissions-reproductions-js.ts
- `NODATA_USER_ID` — Port of NODATA_USER_ID (cypress_sample_instance_data.js). DERIVED, not
- `PG_DB_ID` — The spec's own `const PG_DB_ID = 2`. Under the `postgres-12` snapshot
- `POSTGRES_SKIP_REASON`
- `TOKEN_SKIP_REASON`
- `MAILDEV_SKIP_REASON`
- `withDatabase` — Port of H.withDatabase(dbId, callback): the Cypress helper hands its
- `isDatasetResponse` — POST /api/dataset — the "@dataset" alias. */
- `isPermissionsGraphPut` — PUT /api/permissions/graph — the "@updatePermissions" alias. */
- `isCreateCardResponse` — POST /api/card — the "@createCard" alias. */
- `hideTables` — Port of the spec-local hideTables(). */
- `changePermissions` — Port of the spec-local changePermissions(from, to).
- `saveChanges` — Port of the spec-local saveChanges(): "Save changes" then the "Yes"
- `assertSearchResultsExcludeSampleDatabase` — Port of the spec-local assert(): search for "S" from the home page and

## permissions.ts
- `ADMIN_PERSONAL_COLLECTION_ID` — Port of ADMIN_PERSONAL_COLLECTION_ID from
- `signInWithCachedSession` — Sign in as any user with a cached session (e.g. "none"), mirroring the
- `adhocQuestionHash` — Port of adhocQuestionHash (e2e/support/helpers/e2e-ad-hoc-question-helpers.js).
- `visitQuestionAdhoc` — Port of H.visitQuestionAdhoc, minus the notebook mode and the native

## personal-collections.ts
- `NO_DATA_PERSONAL_COLLECTION_ID` — Port of NO_DATA_PERSONAL_COLLECTION_ID (cypress_sample_instance_data.js). */
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
- `ALL_TEST_USERS` — Mirrors USERS (e2e/support/cypress_data.js) — the map the spec iterates with
- `addNewCollection` — Port of the spec-local addNewCollection(name): open the new-collection modal
- `appendToPlaceholderField` — Port of `cy.findByPlaceholderText(placeholder).type(text).blur()` on the

## pie-chart.ts
- `ensurePieChartRendered` — Port of the spec-local ensurePieChartRendered(rows, middleRows, outerRows,
- `checkLegendItemAriaCurrent` — Port of the spec-local checkLegendItemAriaCurrent. aria-current is an
- `getLimitedQuery` — Port of the spec-local getLimitedQuery. */
- `changeRowLimit` — Port of the spec-local changeRowLimit: edit the notebook limit step and
- `renameSlice` — Port of the slice-settings rename: click the slice's settings button, then
- `confirmSliceClickBehavior` — Port of the spec-local confirmSliceClickBehavior: click the slice (by label,

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
- `cellContentWidth` — jQuery-style .width() (content-box width) of the pivot-table cell wrapping a
- `findDisplayValue` — Port of cy.findByDisplayValue: the form control in `scope` whose current
- `updatePermissionsGraph` — Port of cy.updatePermissionsGraph: GET the graph, shallow-merge the given
- `saveAdhocQuestion` — Port of the column-resizing test's H.saveQuestion(undefined, undefined, {

## progress-bar.ts
- `goalColumnDropdown` — The chevron dropdown toggle inside the "Goal" setting row. Cypress:

## public-dashboard.ts
- `PUBLIC_DASHBOARD_REGEX`
- `COUNT_ALL`
- `COUNT_DOOHICKEY`
- `TEXT_FILTER`
- `UNUSED_FILTER`
- `TAB_1`
- `TAB_2`
- `prepareDashboard` — Port of the spec's `prepareDashboard`: enable public sharing, create the
- `spyOnAppendedAnchor` — Port of the spec's `cy.spy(win.document.body, "appendChild")`: the "link"
- `getCapturedAnchor` — Read the anchor captured by spyOnAppendedAnchor. */

## public-documents.ts
- `createPublicDocumentLink` — Port of H.createPublicDocumentLink: mint a public link for a document and
- `visitPublicDocument` — Port of the spec-local visitPublicDocument: navigate to the public route. */
- `verifyDocumentIsReadOnly` — Port of the spec-local verifyDocumentIsReadOnly: the editor textbox is
- `verifyCommentsAreHidden` — Port of the spec-local verifyCommentsAreHidden: no per-node comment buttons,
- `verifyErrorMessage` — Port of the spec-local verifyErrorMessage: PublicError / PublicNotFound

## public-resource-downloads.ts
- `downloadPublicDashcardCsv` — Port of `H.downloadAndAssert({ publicUuid, isDashboard: true, isEmbed: true,
- `downloadPublicQuestionCsv` — Port of `H.downloadAndAssert({ publicUuid, isDashboard: false, isEmbed: true,

## public-sharing-embed-button-behavior.ts
- `createResource` — Port of the spec-local `createResource`. Question: a native PRODUCTS query
- `createPublicResourceLink` — Port of the spec-local `createPublicResourceLink`. */
- `visitResource` — Port of the spec-local `visitResource`. */
- `assertNonAdminCannotCreatePublicLink` — Port of the spec-local `assertNonAdminCannotCreatePublicLink`. */
- `assertValidPublicLink` — Port of the spec-local `assertValidPublicLink`. */
- `publishChanges` — Port of H.publishChanges (e2e-embedding-helpers.js). Upstream waits for TWO
- `unpublishChanges` — Port of H.unpublishChanges: the PUT whose body flips `enable_embedding` off. */

## public-sharing.ts
- `PUBLIC_SHARING_SETTINGS_URL`
- `createPublicLink` — Port of the spec's `cy.request("POST", "/api/<type>/:id/public_link", {})`:
- `waitForPublicListings` — The public-sharing page fires three list requests on load
- `revokePublicLink` — Port of the spec's revoke flow: click a listing's "Revoke link" icon, confirm

## published-tables-segments.ts
- `publishedTableSegmentsUrl` — The published-table segments list route. */
- `visitPublishedTableSegmentsPage` — Port of H.DataStudio.Tables.visitSegmentsPage(tableId). */
- `visitPublishedTableSegmentPage` — Port of H.DataStudio.Tables.visitSegmentPage(tableId, segmentId). */
- `tableSegmentsTab` — Port of H.DataStudio.Tables.segmentsTab(): header().findByText("Segments"). */

## query-external.ts
- `QA_DB_SKIP_REASON`
- `getTableIdByName` — Note the trailing slash: the endpoint is `/api/database/:id/schema/:schema`

## question-management.ts
- `ORDERS_COUNT_QUESTION_ID`
- `getPersonalCollectionName`
- `waitForCardUpdate` — Register the wait behind the spec's `cy.intercept("PUT", "/api/card/:id")`
- `assertNot403` — Port of assertRequestNot403: the PUT must not have been rejected as 403. */
- `assertNoPermissionsError` — Port of assertNoPermissionsError (note the curly apostrophe in the copy). */
- `turnIntoModel` — Port of the spec-local turnIntoModel: open the actions menu, click "Turn into
- `findPickerItem` — Port of findPickerItem: the entity-picker row for `name`, walked up to its
- `assertActivePickerItem` — Port of findActivePickerItem: the row must carry data-active="true". */
- `assertInactivePickerItem` — Port of findInactivePickerItem: the row must NOT carry data-active="true". */
- `moveQuestionTo` — Port of moveQuestionTo: open the actions menu, click Move, pick the
- `assertSidebarItemSelected` — Port of the repeated navigationSidebar aria-selected checks:
- `addToDashboardPopoverItem` — The click-behavior "Add to dashboard" action item inside the actions popover. */

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

## question-notebook.ts
- `openTableNotebookInDb` — Port of H.openTable({ database, table, mode: "notebook" }) for a NON-sample
- `assertTableRowCount` — Port of the spec-local assertTableRowCount: the preview table's non-FK ID
- `addSimpleCustomColumn` — Port of the spec-local addSimpleCustomColumn: type `[Category]`, then click
- `moveNotebookElement` — Port of the drag-and-drop spec's `moveElement`: drag the notebook clause
- `pickMiniPickerTable` — Pick a database + table in the mini picker (the repeated beforeEach shape). */

## question-reproductions-1.ts
- `QA_DB_SKIP_REASON`
- `waitForDataset` — POST /api/dataset — the "@dataset" alias. */
- `waitForCreateCard` — POST /api/card — the "@card" alias (issue 17910). */
- `waitForUpdateCard` — PUT /api/card/:id — the description edit in issue 17910. */
- `waitForCardQuery` — POST /api/card/:id/query — the "@cardQuery" alias (issue 19341). */
- `waitForDashcardQuery` — POST /api/dashboard/:dashboardId/dashcard/*\/card/:cardId/query — the
- `waitForSearch` — GET /api/search — gate for the entity-picker search box (issue 19341). */
- `waitForUpdateTable` — PUT /api/table/:id — the "Hide table" toggle (issue 19742). */
- `focusCustomExpressionEditorForced` — LOAD-BEARING — the editor's own portalled overlays sit on top of
- `clearCustomExpressionEditorForced` — Port of H.CustomExpressionEditor.clear(): focus, select all, backspace. */
- `typeCustomExpressionForced` — Port of H.CustomExpressionEditor.type() for the plain-text formulas this
- `blurCustomExpressionEditor` — Port of H.CustomExpressionEditor.blur(). */
- `enterCustomColumnDetailsForced` — Port of H.enterCustomColumnDetails({ formula, format }) — the shared
- `typeExpressionName` — Port of `H.CustomExpressionEditor.nameInput().type(name)`. Cypress's
- `POPOVER_ELEMENT` — H.POPOVER_ELEMENT (e2e-ui-elements-helpers.js:4). Deliberately NOT the
- `assertNoOpenPopover` — Port of the spec-local assertNoOpenPopover.
- `setAdHocFilterTimeBucket` — Port of setAdHocFilter (e2e-date-filter-helpers.js), `timeBucket` branch —
- `openTableNotebookInDatabase` — than the H2 sample.
- `openEllipsisMenuFor` — Port of the spec-local openEllipsisMenuFor:

## question-reproductions-2.ts
- `EXPRESSION_NAME` — The custom-column expression the "Custom columns visualization settings"
- `goToExpressionSidebarVisualizationSettings` — Port of the spec-local goToExpressionSidebarVisualizationSettings: open the
- `saveModifiedQuestion` — Port of the spec-local saveModifiedQuestion: save an overwrite of the
- `countResponses` — Counter for a class of responses over the whole test — the Playwright
- `isDatasetResponse` — Matcher for POST /api/dataset (the "@dataset" alias). */
- `isCardQueryResponse` — Matcher for POST /api/card/:id/query (the "@cardQuery" alias). */
- `waitForCardQueryMetadata` — Register a wait for the next GET /api/card/:id/query_metadata (the
- `waitForSearchContaining` — Register a wait for the next GET /api/search whose query string contains

## question-reproductions-3.ts
- `QA_DB_SKIP_REASON`
- `MONGO_SKIP_REASON`
- `waitForDataset` — The "@dataset" alias: POST /api/dataset. */
- `waitForCardQuery` — The "@cardQuery" alias H.visitQuestion registers: POST /api/card/:id/query. */
- `waitForCardPivotQuery` — POST /api/card/pivot/:id/query — the "@cardPivotQuery" alias. */
- `waitForUpdateCard` — The "@updateCard" / "@updateQuestion" aliases: PUT /api/card/:id. */
- `visualizeEitherEndpoint` — `H.visualize()` for a question that may already be SAVED. The shared
- `setCurrentUserLocale` — Port of the beforeEach that switches the current user's locale (issue 33079). */
- `moveColumnDown` — Port of H.moveColumnDown (e2e-ui-elements-helpers.js): a raw 4-event mouse
- `assertPlanFieldValues` — Port of the spec's module-level assertPlanFieldValues (issue 34414). */
- `removeFilter` — Port of the spec's module-level removeFilter (issue 42010). */
- `saveQuestionWithDefaults` — Port of `H.saveQuestion()` called with NO name and no pickEntity options:
- `searchMiniPickerAndSelect` — Pick an entry in the notebook's mini picker by typing into its search box.
- `resetUuidPkTable` — Port of `H.resetTestTable({ type: "postgres", table: "uuid_pk_table" })`
- `writableTableRelfilenode` — The `relfilenode` of a table in the writable postgres container — changes
- `currentUserPersonalCollectionId` — NO_COLLECTION_PERSONAL_COLLECTION_ID (cypress_sample_instance_data.js),

## question-reproductions-4.ts
- `QA_DB_SKIP_REASON`
- `waitForDataset` — POST /api/dataset — the "@dataset" alias. */
- `waitForCardQuery` — POST /api/card/:id/query — the "@cardQuery" alias. */
- `waitForUpdateCard` — PUT /api/card/:id — the "@updateCard" alias. */
- `waitForCreateCard` — POST /api/card — the "@createQuestion" alias. */
- `visualizeEitherEndpoint` — `H.visualize()` for a question that may already be SAVED. The shared
- `responseCounter` — `cy.intercept(...).as(x)` + `cy.wait("@x")` counts responses that arrived
- `withDatabase`
- `enterCustomColumnDetailsFormatted` — Port of `H.enterCustomColumnDetails({ formula, name, format: true })`.
- `expectNoScrollbarContainer` — Port of the spec-local `expectNoScrollbarContainer(element)`:
- `assertEqualHeight` — Port of the spec-local `assertEqualHeight` (jQuery `.outerHeight()`). */
- `expectCypressHidden` — Cypress's `should("not.be.visible")` requires the element to EXIST and be
- `zIndexOf` — Computed `z-index` of an element, as a number (NaN when `auto`). */

## question-reproductions.ts
- `QA_DB_SKIP_REASON`
- `MONGO_SKIP_REASON`
- `waitForDataset` — POST /api/dataset — the "@dataset" alias. */
- `waitForUpdateCard` — PUT /api/card/:id — the "@updateCard" alias. */
- `waitForCreateCard` — POST /api/card — the "@cardCreate" alias. */
- `createMockParameter` — Port of createMockParameter (metabase-types/api/mocks/parameters.ts). The
- `updateSetting` — Port of H.updateSetting (api/updateSetting.ts): PUT /api/setting/:key. */
- `runButtonOverlay` — Port of H.runButtonOverlay (e2e-misc-helpers.js). */
- `mainAside` — Port of H.sidebar (e2e-ui-elements-helpers.js) — `cy.get("main aside")`. */
- `miniPickerOurAnalytics` — Port of H.miniPickerOurAnalytics (e2e-ui-elements-helpers.js). */
- `ensureParameterColumnValue` — Port of H.ensureParameterColumnValue (e2e-ui-elements-helpers.js): EVERY
- `countDisplayValue` — against a subtree that is unmounting `count()` can observe the container and
- `findByDisplayValue` — Retrying variant of the above, for the steady-state title lookups. */
- `expectCypressHidden` — the element is hidden when `document.elementFromPoint` at its centre is
- `getSyncedFieldId` — Why this is not over-engineering: the `postgres-writable` snapshot's APP DB
- `datePickerNextButton` — `nextButton()` / `previousButton()` upstream are
- `datePickerPreviousButton`
- `measureInitialValues` — Port of the spec-local measureInitialValues. `H.popover().then(([$el]) =>
- `assertNoLayoutShift` — choice: upstream's two rect assertions are
- `checkSingleDateFilter` — Port of the spec-local checkSingleDateFilter (4 "next" clicks). */
- `checkDateRangeFilter` — Port of the spec-local checkDateRangeFilter (1 "next" click). */
- `clearAndType` — `cy.clear().type(text)` on a text input: Cypress's `type` clicks the subject

## question-saved.ts
- `SECOND_COLLECTION_ID`
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
- `setupSMTP` — Requires a maildev instance. Endpoints resolve through support/maildev.ts:
- `removeNotificationHandlerChannel` — Port of H.removeNotificationHandlerChannel. */
- `addNotificationHandlerChannel` — Port of H.addNotificationHandlerChannel. */

## question-settings.ts
- `browseDatabases` — Port of H.browseDatabases. */
- `getSidebarColumns` — Port of the spec's getSidebarColumns: all column rows (visible and
- `getVisibleSidebarColumns` — Port of the spec's getVisibleSidebarColumns. */
- `findColumnAtIndex` — Port of the spec's findColumnAtIndex (negative indices count from the
- `hideColumn` — Port of the spec's hideColumn. Like the Cypress original, no force —

## recently-viewed.ts
- `advanceServerClockBy` — Port of the spec-local advanceServerClockBy: POST /api/testing/set-time
- `assertRecentlyViewedItem` — Port of the spec-local assertRecentlyViewedItem: the index-th

## reference-databases.ts
- `startEditingReferenceDetails` — Port of `cy.button(/Edit/).trigger("click")` on the reference Details header.
- `referenceSidebarItem` — Port of `cy.findAllByRole("listitem").filter(":contains(<name>)")` against the

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

## remote-sync.ts
- `REMOTE_QUESTION_NAME`
- `setupGitSync` — CI-robustness (support/snippets.ts's git-sync just failed CI): the branch is
- `teardownGitSync` — Remove a repo created by setupGitSync. */
- `copySyncedCollectionFixture` — Port of H.copySyncedCollectionFixture (cy.task copyDirectory → fs.cpSync). */
- `copySyncedTransformsCollectionFixture` — Port of H.copySyncedTransformsCollectionFixture. */
- `commitToRepo` — Port of H.commitToRepo: `git add . && git commit -am <message>`. */
- `checkoutSyncedCollectionBranch` — Port of H.checkoutSyncedCollectionBranch: `git checkout -b <branch>`. */
- `stashChanges` — Port of H.stashChanges. When Metabase pushes it writes directly to the .git,
- `updateRemoteQuestion` — Port of H.updateRemoteQuestion: reset the working tree to the pushed HEAD,
- `configureGit` — Port of H.configureGit: PUT the remote-sync settings pointing at the repo. */
- `configureGitAndPullChanges` — Port of H.configureGitAndPullChanges: configure, then wait for the initial
- `configureGitWithNewSyncedCollection` — Port of H.configureGitWithNewSyncedCollection. Returns the collection. */
- `wrapSyncedCollection` — Port of H.wrapSyncedCollection: resolve the root-level synced collection
- `pollForTask` — Port of H.pollForTask: actively GET current-task until the given task
- `waitForTask` — Port of H.waitForTask: wait for a UI-triggered sync to finish by observing
- `closeSyncResultModal` — Port of H.closeSyncResultModal: a UI-triggered sync leaves its confirmation
- `getGitSyncControls` — Port of H.getGitSyncControls (findByTestId "git-sync-controls"). */
- `getPullOption` — Port of H.getPullOption: open the menu, return the Pull option. */
- `getPushOption` — Port of H.getPushOption: open the menu, return the Push option. */
- `clickPullOption`
- `clickPushOption`
- `visitRemoteSyncSettings` — Port of H.visitRemoteSyncSettings. */
- `getSettingsBranchSwitcher` — Port of H.getSettingsBranchSwitcher. */
- `createBranchViaSettings` — Port of H.createBranchViaSettings: fork+switch to a new branch. */
- `switchBranchViaSettings` — Port of H.switchBranchViaSettings: select an existing branch. With unsaved
- `getSyncStatusIndicators` — Port of H.getSyncStatusIndicators. */
- `goToSyncedCollection` — Port of H.goToSyncedCollection: click the synced-collection sidebar item. */
- `moveCollectionItemToSyncedCollection` — Port of H.moveCollectionItemToSyncedCollection: from Our analytics, move an
- `enableTenants` — Port of H.enableTenants. */
- `createSharedTenantCollection` — Port of H.createSharedTenantCollection. namespace must be

## reset-writable-db.ts
- `resetWritableDb` — Drops all non-`public` schemas and all `public` tables (postgres), or every
- `writableDialectFor` — Upstream's dialect rule from e2e-setup-helpers.js:46 — the snapshot name

## revisions.ts
- `sidesheet`
- `questionInfoButton`
- `openQuestionsSidebar` — Port of H.openQuestionsSidebar. */
- `saveDashboardWithoutAwaitingRequests` — Port of H.saveDashboard({ awaitRequest: false }): the shared
- `openRevisionHistory` — Port of the spec-local openRevisionHistory: open the dashboard info
- `clickRevert` — Port of the spec-local clickRevert. The revert buttons carry the event
- `waitForRevert` — Playwright equivalent of the spec's cy.intercept("POST",
- `expectRevertSuccess` — Port of the repeated cy.wait("@revert") status/cause assertions. */

## rows.ts
- `queryVisualizationRoot` — Port of `cy.findByTestId("query-visualization-root")`. */
- `rowChartBars` — The row-chart bars — `cy.findAllByRole("graphics-symbol")`. */
- `visxColumns` — The plotted-bars group — `cy.get(".visx-columns")`. */
- `visxAxisLeft` — The left (category) axis group — `cy.get(".visx-axis-left")`. */
- `boxWidth` — jQuery `.invoke("width")` equivalent: the element's rendered box width. */

## sample-data.ts
- `SAMPLE_DB_ID`
- `ORDERS_QUESTION_ID`
- `ORDERS_BY_YEAR_QUESTION_ID` — Port of ORDERS_BY_YEAR_QUESTION_ID (cypress_sample_instance_data.js). Derived
- `ORDERS_QUESTION_ENTITY_ID` — Port of ORDERS_QUESTION_ENTITY_ID (cypress_sample_instance_data.js): the
- `ORDERS_DASHBOARD_ID`
- `FIRST_COLLECTION_ID`
- `THIRD_COLLECTION_ID`
- `LOGIN_CACHE` — Session ids cached at snapshot-creation time. The sessions live in the
- `USERS` — Credentials fallback for users without a cached session. */

## sandboxing-misconfiguration.ts
- `preparePermissions` — Port of the `before` hook's three `H.blockUserGroupPermissions(group,
- `setUpProductsTable` — Port of the `before` hook's "Create a simple editable products table".
- `dropCategoryColumn` — Port of `H.queryWritableDB("ALTER TABLE products DROP COLUMN category")`. */
- `resyncProductsTable` — `tableName` gates on "a table called products has initial_sync_status
- `waitForSyncedField` — Poll until `products` has a field named `name`, and return its table id. */
- `getProductsTableId` — Port of H.getTableId({ name: "products" }) for this spec. */
- `configureSandboxPolicyOnColumn` — (`resetWritableDb` is unported), so it accumulates debris schemas from
- `assertResponseFailsClosed` — Port of `assertResponseFailsClosed` (e2e-sandboxing-helpers.ts:646-649).

## sandboxing-via-api.ts
- `ALL_USERS_GROUP` — USER_GROUPS (e2e/support/cypress_data.js) — fixed ids baked into the
- `COLLECTION_GROUP`
- `DATA_GROUP`
- `READONLY_GROUP`
- `SANDBOXED_USER` — USERS.sandboxed.login_attributes (e2e/support/cypress_data.js). */
- `SANDBOXED_ATTR_UID` — `Number(USERS.sandboxed.login_attributes.attr_uid)` — the value every
- `VIEW_DATA_PERMISSION_INDEX` — The spec's VIEW_DATA_PERMISSION_INDEX. */
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
- `ORDERS_DASHBOARD_DASHCARD_ID` — Port of ORDERS_DASHBOARD_DASHCARD_ID (cypress_sample_instance_data.js):
- `preparePermissions` — Port of the spec-local preparePermissions(). */
- `createJoinedQuestion` — Port of the spec-local createJoinedQuestion(name, { visitQuestion }).
- `isCardQueryResponse` — POST /api/card/**\/:id/query — the `cardQuery` / `cardQuery<id>` aliases.
- `visitQuestionCapturingCardQuery` — H.visitQuestion(id) with the card-query response handed back. Mirrors the
- `isDatasetResponse` — POST /api/dataset — the `dataset` / `datasetQuery` aliases. */
- `isDashcardQueryResponse` — POST /api/dashboard/:dash/dashcard/:dashcard/card/:card/query — the
- `openTableCapturingDataset` — Port of H.openTable / H.openOrdersTable etc. with the `callback` option:
- `savePermissions` — Port of H.savePermissions (e2e-permissions-helpers.js). Distinct from
- `dashboardCards` — Port of H.dashboardCards (e2e-ui-elements-helpers.js). */
- `tableInteractive` — Port of H.tableInteractive (cy.findByTestId("table-root")). */
- `firstColumnCells` — `cy.get(".test-TableInteractive-cellWrapper--firstColumn")` — the spec's
- `createUserFromRawData` — Port of cy.createUserFromRawData: POST /api/user, then dismiss the
- `signInWithCredentials` — Port of `cy.request("POST", "/api/session", { username, password })` for a

## sandboxing-via-ui.ts
- `ALL_USERS_GROUP` — Port of USER_GROUPS (e2e/support/cypress_data.js:42-49). These are literals
- `ADMIN_GROUP`
- `COLLECTION_GROUP`
- `DATA_GROUP`
- `READONLY_GROUP`
- `assertUserGroupIds` — Cross-check the mirrored group ids against the running instance. */
- `questionCustomView`
- `modelCustomView`
- `adhocQuestionData`
- `gizmoViewer` — Non-admin who should only see Gizmos once sandboxing is applied. */
- `widgetViewer` — Non-admin who should only see Widgets once sandboxing is applied. */
- `createUserFromRawData` — Port of cy.createUserFromRawData. Inlined rather than imported from
- `signInAs` — Port of the helper `signInAs` — see the module header for why the session
- `assertRunningAs` — ADDED BY THE PORT (not upstream), and deliberately so: this is the assertion
- `assignAttributeToUser`
- `preparePermissions`
- `createSandboxingDashboardAndQuestions` — Port of createSandboxingDashboardAndQuestions: creates all questions and
- `configureSandboxPolicy`
- `getDashcardResponses` — Port of getDashcardResponses: visit the dashboard and take the first
- `getCardResponses` — Port of getCardResponses — MUST run as the sandboxed user. */
- `visitAdhocQuestionCapturingDataset` — H.visitQuestionAdhoc(adhocQuestionData) with the /api/dataset response kept. */
- `getFieldValuesForProductCategories`
- `getParameterValuesForProductCategories`
- `rowsShouldContainGizmosAndWidgets`
- `rowsShouldContainOnlyOneCategory`
- `valuesShouldContainGizmosAndWidgets`
- `valuesShouldContainOnlyOneCategory`
- `assertNoResultsOrValuesAreSandboxed`
- `assertAllResultsAndValuesAreSandboxed`

## sankey.ts
- `sankeyEdge` — Port of H.sankeyEdge(color): the sankey link paths, which render with the
- `mockDevelopmentMode` — Port of the spec's `cy.intercept("/api/session/properties", ...)` that flips

## scatter.ts
- `triggerPopoverForBubble` — The Cypress original toggles data view → visualization view to work around

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
- `resyncDatabase` — `writable_db_w0`, holding a table the spec had already created, that no sync

## sdk-embed-setup-guest-embed-ee.ts
- `capturePreviewEmbedRequests` — Port of `cy.intercept("GET", "api/preview_embed/card/*").as("previewEmbed")`

## sdk-embed-setup-select-embed-entity.ts
- `captureWizardDashboardResponses` — the preview), and `cy.wait` consumes a past response. An armed
- `waitForDashboardResponse`
- `capturePreviewEmbedDashboardRequests` — Port of `cy.intercept("GET", "api/preview_embed/dashboard/*").as("previewEmbed")`

## sdk-embed-setup-select-embed-experience.ts
- `waitForRecentSelections` — Port of `cy.intercept("GET", "/api/activity/recents?context=selections*")
- `throttleRecents` — req.on("response", (res) => res.setThrottle(0.3));
- `patchExampleDashboardId` — });

## sdk-embed-setup-select-embed-options.ts
- `embedPreview` — IMPORTANT — the Cypress helper is not just an accessor: before scoping into
- `tooltipWarningInfoIcon` — `getEmbedSidebar().findByLabelText(label).closest("[data-testid=tooltip-warning]").icon("info")`.
- `optionSwitch` — Port of `getEmbedSidebar().findByLabelText(label)` for the wizard's Mantine
- `toggleOptionSwitch` — Click a Mantine switch and assert its resulting state, mirroring upstream's

## sdk-embed-setup.ts
- `getEmbedSidebar` — modal scope, use `modal(page).first()` directly rather than widening this.
- `getResourceSelectorButton` — Port of `getResourceSelectorButton`. Upstream takes a Cypress
- `codeBlock` — Port of `codeBlock`: the CodeMirror content of the generated snippet. */
- `embedModalContent` — Port of H.embedModalContent. */
- `embedModalEnableEmbeddingCard` — Port of H.embedModalEnableEmbeddingCard. */
- `loadedPreviewIframe` — The wizard preview's loaded-iframe marker — `visitNewEmbedPage` gates on it,
- `embedModalEnableEmbedding` — freezes via `useState`) but ALSO appears transiently on the *stale*
- `waitForWizardDashboard` — Arms a wait for the wizard's dashboard fetch. Exported because several
- `waitForRecentActivity` — Arms a wait for `GET /api/activity/recents?…` (upstream's `@recentActivity`
- `visitNewEmbedPage` — Port of `visitNewEmbedPage`.
- `navigateToEntitySelectionStep` — already accepted by `visitNewEmbedPage`'s `embedModalEnableEmbedding()` — so
- `navigateToEmbedOptionsStep` — Port of `navigateToEmbedOptionsStep`. */
- `navigateToGetCodeStep` — Port of `navigateToGetCodeStep`. */
- `completeWizard` — Port of `completeWizard`.
- `assertRecentItemName` — Port of `assertRecentItemName`. Upstream reads the `@recentActivity` alias;
- `assertDashboard` — Port of `assertDashboard`. Same alias→awaited-body inversion. */
- `logRecent` — Port of the `logRecent` helper duplicated in select-embed-entity /

## sdk-iframe-custom-elements-api.ts
- `ORDERS_COUNT_QUESTION_ID` — Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
- `loadedEmbedFrame` — Port of `H.getSimpleEmbedIframeContent(index)`.
- `pasteText` — Port of the `cy.paste(text)` custom command

## sdk-iframe-eajs-internal-navigation.ts
- `TARGET_DASHBOARD_FILTER` — Port of the spec's `TARGET_DASHBOARD_FILTER`, which upstream builds with
- `getSignedJwtForResource` — Port of H.getSignedJwtForResource (e2e-embedding-helpers.js). Upstream signs
- `waitForDashboardGet` — Port of the `@getDashboard` alias registered by
- `setupClickBehaviorNavigation` — Port of the `click behavior navigation` describe's `beforeEach` body (minus
- `setupBrowserBreadcrumbs` — Port of the `<metabase-browser> breadcrumbs` describe's `beforeEach` body

## sdk-iframe-embedding.ts
- `ORDERS_COUNT_QUESTION_ID` — Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
- `ORDERS_DASHBOARD_ENTITY_ID` — Port of ORDERS_DASHBOARD_ENTITY_ID (cypress_sample_instance_data.js). */
- `HTTPS_AUTH_PROVIDER_URL` — findings-inbox/sdk-iframe-harness.md §3b) — and an https document may not
- `useHttpsMockJwtProvider` — Points the instance's JWT provider at `HTTPS_AUTH_PROVIDER_URL` and mocks it.
- `getEmbedFrame` — The embed iframe's `Frame` (not `FrameLocator`), for the two tests that need
- `countDashCardQueries`
- `waitForDashCardQuery` — Port of the `@getDashCardQuery` alias used as a wait. */
- `waitForCardQuery` — Port of the `@getCardQuery` alias used as a wait. */
- `assertTableRowsCount` — Port of H.assertTableRowsCount, scoped to the embed frame. */
- `tableInteractive` — Port of H.tableInteractive(), scoped. */
- `assertOrdersDashboardVisible` — Port of the repeated "dashboard rendered" block:
- `assertSdkInteractiveQuestionOrdersUsable` — Port of H.assertSdkInteractiveQuestionOrdersUsable
- `assertSdkNotebookEditorUsable` — Port of H.assertSdkNotebookEditorUsable

## sdk-iframe-guest-embed.ts
- `createGuestEmbedQuestion` — Port of the spec's `createQuestion({ name: "47563", ... })`.
- `EMBED_CARD_QUERY_RE` — The alias `prepareGuestEmbedSdkIframeEmbedTest` registers as
- `waitForEmbedCardQuery` — Port of `cy.wait("@getCardQuery")`. Arm before the page load, await after
- `downloadEmbedCsvFromFrame` — Two deliberate differences from the Cypress helper, both strengthenings of

## sdk-iframe-guest-token-refresh.ts
- `PROVIDER_PATH` — Port of the spec's PROVIDER_PATH. */
- `mockGuestTokenProvider` — Port of `cy.intercept({ method: "POST", pathname: PROVIDER_PATH }, req =>
- `waitForGuestTokenProvider` — Port of `cy.wait("@guestTokenProvider")`.
- `forceGuestTokenRefresh` — Port of
- `signGuestJwt` — Port of the spec-local `signJwt` (which calls the `signJwt` cy.task →
- `prepareGuestEmbedSdkIframeEmbedTest` — (e2e/support/helpers/e2e-embedding-iframe-sdk-helpers.ts:235).
- `PRICE_DASHBOARD_PARAMETER`
- `CATEGORY_DASHBOARD_PARAMETER`
- `createDashboardWithQuestion` — Port of the spec-local createDashboardWithQuestion. */
- `createDashboardWithPriceFilter` — Port of the spec-local createDashboardWithPriceFilter. */
- `createDashboardWithCategoryFilter` — Port of the spec-local createDashboardWithCategoryFilter. */
- `createStandaloneQuestion` — Port of the spec-local createStandaloneQuestion.
- `createQuestionWithPriceFilter` — Port of the spec-local createQuestionWithPriceFilter. Same
- `createQuestionWithCategoryFilter` — Port of the spec-local createQuestionWithCategoryFilter. Same
- `assertTableData` — Port of H.assertTableData scoped to the embed frame. Upstream calls it inside

## sdk-iframe.ts
- `AUTH_PROVIDER_URL` — Port of e2e/support/helpers/embedding-sdk-helpers/constants.ts. */
- `JWT_SHARED_SECRET` — Port of e2e-jwt-helpers.ts. */
- `getSignedJwtForUser` — Port of H.getSignedJwtForUser. Upstream uses `jose`; that package lives in
- `prepareSdkIframeEmbedTest` — Port of H.prepareSdkIframeEmbedTest.
- `enableJwtAuth` — Port of H.enableJwtAuth. */
- `enableSamlAuth` — Port of H.enableSamlAuth. Upstream reads the cert with `cy.readFile`; here
- `mockAuthProviderAndJwtSignIn` — Port of H.mockAuthProviderAndJwtSignIn.
- `mockAuthSsoEndpointForSamlAuthProvider` — Port of H.mockAuthSsoEndpointForSamlAuthProvider. Upstream's relative
- `stubWindowOpenForSamlPopup` — Port of H.stubWindowOpenForSamlPopup.
- `stubWindowOpenInert` — Stub `window.open` into an inert popup — for the "we only care which auth
- `loadSdkIframeEmbedTestPage` — Port of H.loadSdkIframeEmbedTestPage.
- `visitCustomHtmlPage` — Port of H.visitCustomHtmlPage. */
- `getSdkIframeEmbedHtml` — Port of getSdkIframeEmbedHtml. Every URL comes from `mb.baseUrl`. */
- `getNewEmbedScriptTag`
- `getNewEmbedConfigurationScript`
- `SIMPLE_EMBED_IFRAME_SELECTOR`
- `getSimpleEmbedIframe` — Port of H.getSimpleEmbedIframeContent (as a FrameLocator). */
- `waitForSimpleEmbedIframesToLoad` — Port of H.waitForSimpleEmbedIframesToLoad. */
- `sdkErrorContainer`
- `assertEmbedTargetsThisSlot` — 1. STRUCTURAL — the embed iframe's own `src` origin must equal
- `writeSlotMarker` — Writes a slot-unique marker into the app DB and returns it. Read it back
- `readApplicationNameFromEmbed` — Reads `application-name` from inside the embed iframe's own session

## search-filters.ts
- `ADMIN_USER_ID`
- `NORMAL_USER_ID`
- `ADMIN_PERSONAL_COLLECTION_ID`
- `NORMAL_PERSONAL_COLLECTION_ID`
- `ORDERS_COUNT_QUESTION_ID`
- `createModerationReview` — Port of H.createModerationReview (api/createModerationReview.ts). */
- `expectSearchResultItemNameContent` — Port of the spec-local expectSearchResultItemNameContent: the
- `waitForModelIndexed` — The type-filter describe seeds a model, an action, a model-index
- `waitForLastEditors` — The last_edited_by / last_edited_at describes edit questions AFTER restore,
- `editQuestionByAddingSummarize` — Doing it via the API (rather than the summarize sidebar) also dodges a UI

## search-pagination.ts
- `waitForSearch` — Register a wait for the next /api/search response (PORTING rule 2 —
- `waitForCardsIndexed` — The seeded `generated_question` cards are indexed asynchronously after a
- `commandPaletteSearch` — Port of H.commandPaletteSearch(query) with its default viewAll = true:

## search-snowplow.ts
- `SnowplowCapture`
- `installSnowplowCapture` — Install the capture on a page. Must run before the first navigation, since
- `isDeepMatch` — with ONE deliberate deviation: arrays must match in length as well as
- `expectUnstructuredSnowplowEvent` — Port of H.expectUnstructuredSnowplowEvent(eventData, count). Upstream polls
- `assertNoUnstructuredSnowplowEvent` — Port of H.assertNoUnstructuredSnowplowEvent. */
- `expectNoBadSnowplowEvents` — Structural stand-in for H.expectNoBadSnowplowEvents. Upstream asks
- `commandPaletteSearch` — Port of H.commandPaletteSearch(query, viewAll). The shared ports of this

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

## segments-data-studio.ts
- `getSegmentsBaseUrl`
- `visitDataStudioSegments` — Port of H.DataModel.visitDataStudioSegments — navigate to a table's segments
- `visitDataStudioTable` — Port of the spec-local visitDataStudioTable → H.DataModel.visitDataStudio
- `visitDataModelSegment` — Port of the spec-local visitDataModelSegment: navigate straight to a
- `SegmentList`
- `SegmentEditor`
- `SegmentRevisionHistory`

## sharing-download-reproductions.ts
- `remapProductIdToProductTitle` — Port of the repeated
- `saveAndOverwrite` — Port of the spec-local `saveAndOverwrite`: click the QB header Save, then
- `openNativeEditor` — Port of `cy.contains(/open editor/i).click()` /
- `reorderColumnAPastColumnB` — The Cypress original fired raw `.trigger("mousedown"/"mousemove"/"mouseup")`

## sharing-reproductions.ts
- `ADMIN_USER_ID` — Port of ADMIN_USER_ID (cypress_sample_instance_data.js). */
- `ADMIN` — USERS.admin (e2e/support/cypress_data.js) — the harness USERS map carries
- `ADMIN_FULL_NAME` — Port of H.getFullName (e2e-users-helpers.ts) for the admin fixture. */
- `clickSend` — Port of H.clickSend: click "Send email now" and wait for POST
- `openAndAddEmailsToSubscriptions` — Port of H.openAndAddEmailsToSubscriptions. */
- `sendEmailAndGetFirst` — Port of H.sendEmailAndAssert's inbox read: send, then resolve with the
- `sendEmailAndVisitIt` — Port of H.sendEmailAndVisitIt: send, then navigate the browser to maildev's
- `fetchEmailAttachment` — maildev exposes an email's attachment bytes at this path. */
- `emailAttachments` — maildev's attachment metadata — not modelled by the shared MaildevEmail. */
- `mockSlackConfigured` — Port of H.mockSlackConfigured: read the real /api/pulse/form_input (so the
- `mockDashboardCard` — Local stand-in for createMockDashboardCard (metabase-types/api/mocks) — the
- `sidebar` — Port of H.sidebar (e2e-ui-elements-helpers.js): `cy.get("main aside")`. */
- `openDashboardSubscriptionsMenu` — Port of H.openDashboardMenu("Subscriptions"). Inlined rather than imported
- `iframeBodyFontFamily` — The computed font-family of the embed preview iframe's body.

## sharing.ts
- `sharingMenuButton`
- `sharingMenu`
- `openSharingMenu`
- `openNewPublicLinkDropdown` — Port of H.openNewPublicLinkDropdown: opens the sharing menu's public-link
- `createPublicQuestionLink`
- `visitPublicQuestion`
- `signInWithCachedSession` — Port of cy.signIn for users outside the fixture's UserName union (e.g.
- `startNewNativeQuestion` — Port of H.startNewNativeQuestion — the query generated by "New" > "SQL query". */
- `nativeEditor`
- `focusNativeEditor`
- `typeInNativeEditor` — Port of H.NativeEditor.type. Only the escape sequences this spec needs are
- `saveQuestion`
- `downloadViaUi` — Drives the question download UI and resolves with the resulting Download.

## signin.ts
- `emailInput` — The email field. `findByLabelText("Email address")` → exact (PORTING rule 1). */
- `passwordInput` — The password field. `findByLabelText("Password")` → exact. */
- `signInButton` — Port of `cy.button("Sign in")` — findByRole button, exact name. */
- `rememberMeCheckbox` — The "Remember me" checkbox (`cy.findByRole("checkbox")`). */
- `submitLoginForm` — Fill the real login form and submit. */
- `clickAuthLinkExpectUrl` — Click an auth-page link (by exact name) and wait for the URL to match.

## smartscalar-trend.ts
- `menu` — Port of H.menu() (e2e-ui-elements-helpers.js): the open Mantine menu. */
- `comparisonLabel` — The comparison label ("vs. previous month:", "vs. Mar:", …) is a MIXED
- `button` — Port of the `cy.button(name)` command (e2e/support/commands/ui/button.ts):
- `typeClampedValue` — The Cypress spec's `cy.get("input").click().type(text)` inside the periods-ago
- `cssColorToRgb` — Resolve a CSS color string (e.g. an `hsla(...)` theme value) to the computed
- `ERROR_COLOR` — `colors.error` / `colors.success` from the light theme
- `SUCCESS_COLOR`

## snippets.ts
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
- `openSnippetRow` — Expand a snippet row's detail panel (which reveals the Edit button). The row
- `getPermissionsForUserGroup` — Port of the spec-local getPermissionsForUserGroup:
- `createNestedSnippet` — Port of the spec-local createNestedSnippet: sign in as admin, create a
- `createDoublyNestedSnippet` — Port of the spec-local createDoublyNestedSnippet: Folder A > Folder B >
- `codeMirrorValue` — Port of H.codeMirrorValue (e2e-codemirror-helpers.ts): join the editor's
- `setupGitSync` — Port of H.setupGitSync (e2e-remote-sync-helpers.ts): create a local git repo
- `teardownGitSync` — Remove a repo created by setupGitSync. */
- `configureGitAndPullChangesReadOnly` — Port of H.configureGitAndPullChanges (read-only branch): PUT the remote-sync

## snowplow-collector.ts
- `SnowplowCollector`
- `expectCollectedSnowplowEvent` — Collector-side port of `H.expectSnowplowEvent({ event: { event_name } })`.
- `expectNoBadCollectedSnowplowEvents` — Upstream asks snowplow-micro which events failed **Iglu schema validation**.
- `collectorPortFor` — The collector port for a slot backend. Derived from the backend port so the

## snowplow.ts
- `enableTracking` — Port of H.enableTracking — `updateSetting("anon-tracking-enabled", true)`. */
- `resetSnowplow` — Port of H.resetSnowplow (micro/reset), scoped to this slot's collector.
- `expectUnstructuredSnowplowEvent` — Port of H.expectUnstructuredSnowplowEvent(eventData, count).
- `assertNoUnstructuredSnowplowEvent` — Port of H.assertNoUnstructuredSnowplowEvent. Same caveat as upstream: an
- `expectNoBadSnowplowEvents` — Port of H.expectNoBadSnowplowEvents — the real one: structural decode check

## source-replacement.ts
- `SourceReplacement` — Port of H.DataModel.SourceReplacement (e2e-datamodel-helpers.ts).
- `waitForReplaceSource` — POST /api/ee/replacement/replace-source — the `@replaceSource` alias. */
- `waitForDependents` — GET /api/ee/dependencies/graph/dependents* — the `@dependents` alias.
- `visitDataStudioSegments` — Port of H.DataModel.visitDataStudioSegments for an arbitrary database /
- `visitDataStudioMeasures` — Port of H.DataModel.visitDataStudioMeasures, database-parameterised. */
- `visitTransform` — Port of H.visitTransform (e2e-transform-helpers.ts) — a bare visit. */

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

## sql-filters-source.ts
- `openEntryForm` — Port of FieldFilter.openEntryForm: click the filter widget, or — when the
- `closeEntryForm` — Port of FieldFilter.closeEntryForm: press Escape in the popover input. */
- `setWidgetType` — Port of FieldFilter.setWidgetType. */
- `selectFilterValueFromList` — Port of FieldFilter.selectFilterValueFromList: pick a value from the
- `setDropdownFilterType` — Port of H.setDropdownFilterType (clicks the "Dropdown list" radio label). */
- `setSearchBoxFilterType` — Port of H.setSearchBoxFilterType (clicks the "Search box" radio label). */
- `setConnectedFieldSource` — Port of H.setConnectedFieldSource: pick table then field from the popover.
- `checkFilterListSourceHasValue` — Port of H.checkFilterListSourceHasValue: open Edit, switch to Custom list,
- `fieldValuesValue` — Port of H.fieldValuesValue: the nth token-field value pill. */
- `multiAutocompleteValue` — Port of H.multiAutocompleteValue: the nth [data-with-remove] sibling of the
- `dashboardParametersPopover` — Port of H.dashboardParametersPopover (popover with the value-dropdown testid). */
- `checkFilterValueInList` — Port of the spec-local checkFilterValueInList: value present in last popover. */
- `checkFilterValueNotInList` — Port of the spec-local checkFilterValueNotInList: value absent in last popover. */
- `updateQuestion` — Port of the spec-local updateQuestion: click Save, confirm in the save modal,
- `runQuery` — Port of SQLFilter.runQuery(xhrAlias): run the query, wait for the specific

## sql-filters.ts
- `setWidgetValue` — Port of SQLFilter.setWidgetValue: `filterWidget().type(value)` — type the
- `setDefaultValue` — Port of SQLFilter.setDefaultValue: type into the sidebar's

## sso-google.ts
- `CLIENT_ID_SUFFIX` — The suffix every valid Google Sign-In client id must end with. */
- `getGoogleCard` — Port of the spec-local getGoogleCard: cy.findByTestId("google-setting"). */
- `typeAndBlurUsingLabel` — Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
- `setupGoogleAuth` — Port of the spec-local setupGoogleAuth: PUT /api/google/settings with the

## sso-jwt.ts
- `getJwtCard` — Port of the spec-local getJwtCard:
- `waitForUpdateSettings` — The `@updateSettings` alias: PUT /api/setting (the bulk endpoint). */
- `waitForUpdateSetting` — The `@updateSetting` alias: PUT /api/setting/<key> (the single-key endpoint). */

## sso-ldap.ts
- `getLdapCard` — Port of the spec-local getLdapCard:
- `waitForUpdateLdapSettings` — The `@updateLdapSettings` alias: PUT /api/ldap/settings. */
- `LDAP_BIND_PASSWORD` — Fixture credentials for the local OpenLDAP container.
- `LDAP_USER_PASSWORD`
- `LDAP_USERNAME` — The fixture account the container provisions (a username, not a secret). */
- `ldapReachable`
- `ldapUnavailableReason` — Undefined when the LDAP-dependent tests can run; otherwise the skip reason. */
- `setupLdap` — Port of H.setupLdap (e2e/support/helpers/e2e-ldap-helpers.js).
- `expectDisplayValueCount` — Playwright has no `getByDisplayValue`, and a `[value="..."]` locator is not a
- `enterLdapPort` — Port of the spec-local enterLdapPort. */
- `enterLdapSettings` — Port of the spec-local enterLdapSettings. */

## sso-saml.ts
- `getSamlCard` — Port of the spec-local getSamlCard:
- `typeAndBlurUsingLabel` — Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
- `goToAuthOverviewPage` — Port of H.goToAuthOverviewPage (e2e-misc-helpers.js:443). */
- `enterSamlSettings` — Port of the spec-local enterSamlSettings.
- `visitAuthSettings` — The group-mappings settings page for an auth method, with the two GETs the
- `crudGroupMappingsWidget` — Port of crudGroupMappingsWidget(authenticationMethod). */
- `checkGroupConsistencyAfterDeletingMappings` — Port of checkGroupConsistencyAfterDeletingMappings(authenticationMethod). */

## subscriptions.ts
- `openDashboardSubscriptions` — Port of the spec-local openDashboardSubscriptions. */
- `recipientInput` — The RecipientPicker's TokenField input. */
- `tokenFieldInput` — The TokenField's raw input — what H.openAndAddEmailsToSubscriptions targets
- `typeRecipient` — - cy.type() clicks its subject first, so the click is explicit here.
- `assignRecipient` — Port of the spec-local assignRecipient. */
- `assignRecipients` — Port of the spec-local assignRecipients: open the picker, click each user in
- `clickButton` — Port of the spec-local clickButton(name). */
- `createEmailSubscription` — Port of the spec-local createEmailSubscription. */
- `openSlackCreationForm` — Port of the spec-local openSlackCreationForm. */
- `setTextFilter` — Port of the spec-local setTextFilter: H.setFilter("Text or Category", "Is"). */
- `addParametersToDashboard` — Port of the spec-local addParametersToDashboard. */
- `addConnectedAndUnconnectedParameterToDashboard` — Port of the spec-local addConnectedAndUnconnectedParameterToDashboard. */
- `clickSend` — Port of H.clickSend. `scope` mirrors the one caller that runs it inside an
- `sendEmailAndAssert` — Port of H.sendEmailAndAssert: click send, then read the inbox's FIRST email.
- `sendEmailAndVisitIt` — Port of H.sendEmailAndVisitIt: click send, then navigate to the LAST email's
- `viewEmailPage` — Port of H.viewEmailPage: open the maildev UI and click the email by subject. */
- `openEmailPage` — Port of H.openEmailPage: open the maildev UI, click the first email with
- `openAndAddEmailsToSubscriptions` — Port of H.openAndAddEmailsToSubscriptions. */
- `setupSubscriptionWithRecipients` — Port of H.setupSubscriptionWithRecipients. */
- `openPulseSubscription` — Port of H.openPulseSubscription. */
- `emailSubscriptionRecipients` — Port of H.emailSubscriptionRecipients. */
- `mockSlackConfigured` — Port of H.mockSlackConfigured: read the real /api/pulse/form_input (to keep
- `waitForInbox` — Poll maildev until at least one email is stored. The backend hands the
- `escapeRegExp`

## summarization.ts
- `createTestQuery` — Port of H.createTestQuery (api/createTestQuery.ts): POST the MBQL5 test-query
- `createCard` — Port of H.createCard (api/createCard.ts): POST /api/card with a raw
- `getRemoveDimensionButton` — Port of H.getRemoveDimensionButton: the "Remove dimension" button only
- `clickDimensionLeft` — Port of the spec-local `.click({ position: "left" })` on a dimension row —
- `removeMetricFromSidebar` — Port of the spec-local removeMetricFromSidebar: click the close icon on a

## supporting-text.ts
- `DOCUMENT_WITH_SUPPORTING_TEXT`
- `SUPPORTING_TEXT_TESTID`
- `supportingText`
- `getSupportingText` — Port of the spec-local getSupportingText: `findAllByTestId(testId)
- `addSupportingTextMenuItem` — The "Add supporting text" item in the card menu (findByText string is exact).
- `addSupportingText` — Open the card menu, click "Add supporting text", and assert the supporting
- `clickIntoSupportingText` — Click into the supporting text's paragraph and confirm the ProseMirror root
- `documentsDragAndDrop` — Port of H.documentsDragAndDrop. Replays the Cypress helper's synthetic event
- `assertHorizontalLayout` — Port of the spec-local assertHorizontalLayout (c2 is to the right of c1). */
- `assertVerticalLayout` — Port of the spec-local assertVerticalLayout (c2 is below c1). */

## table-collection-permissions.ts
- `blockUserGroupPermissions` — Port of H.blockUserGroupPermissions (e2e-permissions-helpers.js): block
- `sandboxProductsOnCategory` — Port of the spec-local sandboxProductsOnCategory. */
- `popoverByIndex` — Port of the spec-local popoverByIndex:
- `assertQueryPermissionError` — Port of the spec-local assertQueryPermissionError. */

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

## table-drills.ts
- `mockDevelopmentMode` — Port of the spec's `cy.intercept("/api/session/properties", ...)` that
- `expectIconVisible` — `cy.icon(name).should("be.visible")` is an ANY-match (PORTING.md rule 3 /

## table-editing.ts
- `setTableEditingEnabledForDB` — Port of the spec-local setTableEditingEnabledForDB: PUT the DB's
- `getFieldId` — Port of H.getFieldId({ tableId, name }) (e2e-qa-databases-helpers.js):
- `openTableBrowser` — Port of the spec-local openTableBrowser: navigate to the database browser
- `getTableEditIcon` — Port of the spec-local getTableEditIcon: the edit-table icon is revealed on
- `openTableEdit` — Port of the spec-local openTableEdit: hover-reveal the icon and click it. */
- `openEditRowModal` — Port of the spec-local openEditRowModal. The edit-table grid renders each

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
- `createDashboardWithMappedQuestion` — Port of the spec-local createDashboardWithMappedQuestion. */
- `createDashboardWithMultiSeriesCard` — Port of the spec-local createDashboardWithMultiSeriesCard. */
- `backToDashboard` — Port of the spec-local backToDashboard. */
- `addTemporalUnitParameter` — Port of the spec-local addTemporalUnitParameter (H.setFilter("Time grouping")). */
- `addQuestion` — Port of the spec-local addQuestion. */
- `removeQuestion` — Skipping the *stable* check is what bit us: in the two blocks where
- `selectDashboardFilter` — Faithful port of H.selectDashboardFilter (e2e-dashboard-helpers.ts): the real
- `editParameter` — Port of the spec-local editParameter. */
- `ensureDashboardCardHasText` — Port of H.ensureDashboardCardHasText — note the `dashcard` testid (distinct
- `resetFilterWidgetToDefault` — Port of H.resetFilterWidgetToDefault (the revert icon, hover-gated). */
- `dashcardTableHeaderColumn` — Port of H.tableHeaderColumn scoped to a dashcard — the click-behavior tests

## tenant-users-sidecar.ts
- `GIZMO_TENANT`
- `GIZMO_USER`
- `loginWithJWT` — user (jwt-user-provisioning-enabled?), issues a session cookie and redirects
- `createTenant` — Port of `cy.request("POST", "/api/ee/tenant", tenant)`. */
- `sidebarCollectionItem` — Port of `cy.findByText(name).closest("li")` inside the navigation sidebar.
- `pickerRowLink` — Port of `cy.findByText(name).closest("a")` inside the entity picker: the
- `expectIconVisible` — Port of `cy.icon(name).should("be.visible")`.

## tenants.ts
- `GIZMO_TENANT`
- `DOOHICKEY_TENANT`
- `GIZMO_USER`
- `DOOHICKEY_USER`
- `SECOND_DOOHICKEY_USER`
- `TENANTS`
- `USERS`
- `getFullName` — Port of H.getFullName (e2e/support/helpers/e2e-user-helpers.ts). */
- `GIZMO_FULL_NAME`
- `ALL_EXTERNAL_USERS_GROUP_ID` — Mirrors ALL_EXTERNAL_USERS_GROUP_ID / COLLECTION_GROUP_ID
- `COLLECTION_GROUP_ID`
- `STATIC_ORDERS_ID` — Mirrors SAMPLE_DB_TABLES (e2e/support/cypress_data.js). */
- `STATIC_PRODUCTS_ID`
- `createTenants` — Port of the spec-local createTenants: POST each fixture tenant. */
- `createUsers` — Port of the spec-local createUsers: GET the tenant list, resolve each
- `provisionViaJwt` — It deliberately does NOT go through `mb.api`. `/auth/sso` responds with a
- `loginWithJwt` — Port of `cy.task("signJwt")` + `cy.visit("/auth/sso?…")`: navigate the
- `typeTenantName` — Port of `cy.findByRole("textbox", { name: "Give this tenant a name" })
- `visitTenantUsers` — the FE's session-properties cache. When the setting was written moments
- `adminContentTable` — cy.findByTestId("admin-content-table"). */
- `adminLayoutContent` — cy.findByTestId("admin-layout-content"). */
- `adminPeopleListTable` — cy.findByTestId("admin-people-list-table"). */
- `peopleNav` — cy.findByRole("navigation", { name: "people-nav" }). */
- `rowContaining` — Port of `cy.findAllByRole("row").contains("tr", text)`: Cypress's
- `globeIconFor` — Port of the spec-local `hasGlobeIcon` / `lacksGlobeIcon`:
- `expectGlobeIcon`
- `expectNoGlobeIcon`
- `assertPermissionTableColumnsExist` — Port of the spec-local assertPermissionTableColumnsExist. `findByRole` with
- `createTenantGroupFromUI` — Port of the spec-local createTenantGroupFromUI. The `@createGroup` wait is
- `tenantOption` — Port of `H.popover().findByText(name).click()` for the tenant picker in the

## text-cards.ts
- `addTextBoxWhileEditing` — Port of H.addTextBoxWhileEditing: assumes the dashboard is already in edit

## text.ts
- `escapeRegExp` — Escape a string for literal use inside a RegExp. */
- `caseSensitiveSubstring` — Case-sensitive substring matcher (Cypress `cy.contains` / `:contains`

## theme-upsell.ts
- `ADMIN_EMAIL` — The email of the `admin` snapshot user — mirrors support/sample-data.ts. */
- `CLOUD_TRIAL_PATH`
- `mockTrialAvailability` — Port of the spec's
- `mockCurrentAdminAsStoreUser` — Port of the spec's `cy.intercept("GET", "/api/session/properties", req =>
- `themesNavLink` — Port of
- `visibleGemIcon` — Port of `cy.icon("gem").should("be.visible")` scoped inside a locator.
- `gemIcons` — The `.Icon-gem` elements inside a scope, unfiltered (for absence checks). */

## time-series-chrome.ts
- `dateFilterPicker` — The `date-filter-picker` container. Both the timeseries chrome popover
- `updateOperator` — Port of the spec-local updateOperator(from, to): open the operator select

## timelines-collection.ts
- `openMenu` — Port of the spec-local openMenu:
- `setFormattingSettings` — Port of the spec-local setFormattingSettings:
- `waitForCreateEvent` — POST /api/timeline-event (@createEvent). */
- `waitForUpdateEvent` — PUT /api/timeline-event/** (@updateEvent). */
- `waitForDeleteEvent` — DELETE /api/timeline-event/** (@deleteEvent). */
- `waitForCreateTimeline` — POST /api/timeline (@createTimeline). */
- `waitForUpdateTimeline` — PUT /api/timeline/** (@updateTimeline). */
- `waitForDeleteTimeline` — DELETE /api/timeline/** (@deleteTimeline). */
- `waitForUpdateCollection` — PUT /api/collection/** (@updateCollection). */
- `waitForGetTimeline` — GET /api/timeline/** (@getTimeline). */

## timelines.ts
- `createTimeline` — Port of H.createTimeline (api/createTimeline.ts): POST /api/timeline with
- `createTimelineEvent` — Port of H.createTimelineEvent (api/createTimelineEvent.ts): POST
- `createTimelineWithEvents` — Port of H.createTimelineWithEvents: create the timeline, then each event
- `timelineEventChip` — Port of H.timelineEventChip(label): the chart's timeline-event chip whose
- `timelineEventCard` — Port of the spec-local timelineEventCard: the sidebar card enclosing an
- `timelineEventVisibility` — Port of the spec-local timelineEventVisibility: the event card's checkbox. */
- `toggleEventVisibility` — Port of the spec-local toggleEventVisibility: click the event's visibility
- `waitForTimelinesAfterCreatingAnEvent` — Port of the spec-local waitForTimelinesAfterCreatingAnEvent: after
- `timelineCardHeader` — The sidebar's timeline card header enclosing a timeline's name.

## title-drill.ts
- `checkScalarResult` — Port of the spec-local checkScalarResult:
- `checkFilterLabelAndValue` — Port of the spec-local checkFilterLabelAndValue:
- `waitForTitleDrillQuery` — The reusable `cy.intercept(...).as("cardQuery")` the spec waits on after each

## transforms-codegen.ts
- `SOURCE_TABLE`
- `resetManySchemasTable` — Port of H.resetTestTable({ type: "postgres", table: "many_schemas" })
- `createSqlTransform` — Port of H.createSqlTransform (e2e-transform-helpers.ts), subset used here. */
- `createPythonTransform` — Port of H.createPythonTransform (e2e-transform-helpers.ts). */
- `pythonSourceTables` — Port of the spec-local pythonSourceTables. */
- `createMockNativeTransformJSON`
- `createMockPythonTransformJSON`
- `createMockTransformSuggestionResponse` — Port of the spec-local createMockTransformSuggestionResponse: a streamed text
- `visitTransformListPage` — Port of visitTransformListPage. */
- `getMetabotButton` — Port of getMetabotButton: findByRole("button", { name: /Chat with Metabot/ }). */
- `suggestions` — Port of suggestions(): findAllByTestId("metabot-chat-suggestion"). */
- `lastSuggestion` — Port of lastSuggestion(): suggestions().last(). */
- `viewLastSuggestion` — Port of viewLastSuggestion():
- `acceptSuggestionBtn`
- `acceptSuggestion`
- `rejectSuggestionBtn`
- `rejectSuggestion`
- `queryEditor` — Port of H.DataStudio.Transforms.queryEditor(). */
- `editorContent` — The CodeMirror content element for the given editor type. */
- `assertSuggestionInSidebar` — Port of assertSuggestionInSidebar: the last suggestion contains the new
- `assertEditorDiffState` — Port of assertEditorDiffState: the query editor's apply/create + reject
- `assertEditorContent` — Port of assertEditorContent: the editor's content contains `content`. */
- `makeManualEdit` — Port of makeManualEdit: editor.clear().paste(newContent). clear() is
- `assertAcceptRejectUI` — Port of assertAcceptRejectUI: the accept/reject buttons are visible or absent.
- `sendCodgenBotMessage` — Port of sendCodgenBotMessage: send the message, wait for the agent-streaming

## transforms-incremental.ts
- `DB_NAME`
- `SOURCE_TABLE`
- `TARGET_SCHEMA`
- `SCHEMA_B`
- `TARGET_TABLE` — (e.g. `incremental_transform_table`) does NOT escape that LIKE pattern, so
- `QA_DB_SKIP_REASON`
- `PYTHON_SKIP_REASON` — See the token-tier block above — both halves probed, neither assumed. */
- `resetIncrementalTargetTables` — the spec never picks one, so the app defaults it — and it does NOT default to
- `removeAppendedSourceRows` — Restore the source rows this spec mutates.
- `visitTransformListPage` — Port of the spec-local visitTransformListPage(). */
- `getQueryEditor` — Port of the spec-local getQueryEditor(). */
- `editorSidebar` — Port of the spec-local editorSidebar(). */
- `getPythonDataPicker` — Port of the spec-local getPythonDataPicker(). */
- `getRunButton` — Port of the spec-local getRunButton(): `findAllByTestId("run-button").eq(0)`.
- `runTransformAndWaitForSuccess` — getRunButton().click();
- `openRunDetail` — Port of:
- `expectCheckpointTo` — Port of:
- `resetCheckpointFromSettings` — cy.findByRole("group", { name: /Last processed/i }).within(() => {

## transforms-indexes.ts
- `SOURCE_TABLE`
- `TARGET_SCHEMA`
- `INDEX_TABLE_COLUMNS`
- `LIST_TARGET_TABLE` — The two physical target tables this spec's transforms write into.
- `LIFECYCLE_TARGET_TABLE`
- `QA_DB_SKIP_REASON`
- `queryWritableDBRows` — Port of `H.queryWritableDB(sql, "postgres")` — ROW-RETURNING.
- `execWritableDB` — Fire-and-forget variant, for the `CREATE INDEX` the spec runs as a DBA. */
- `resetIndexesTargetTables` — from scratch. THIS HARNESS'S `mb.restore()` DOES NOT — it only restores the
- `btreeIndex` — Port of the spec-local `btreeIndex(name, columns)`. */
- `createIndexRequest` — Port of the spec-local `createIndexRequest()`.
- `deleteIndexRequest` — Port of upstream's inline `cy.request("DELETE", "/api/index/request/:id")`.
- `indexesTable` — Port of the spec-local `indexesTable()`. */
- `matchHeaderName` — Port of the spec-local `matchHeaderName(label)` — `new RegExp("^" + label)`.
- `visitIndexes` — Port of `H.DataStudio.Transforms.visitIndexes(id)` — a plain `cy.visit`.
- `indexesTab` — Port of `H.DataStudio.Transforms.indexesTab()`. */
- `undoToast` — Port of `H.undoToast()`. */
- `indexesContent` — Port of the spec-local `indexesContent()` anchor (`transforms-indexes-content`). */

## transforms-inspect.ts
- `SOURCE_TABLE`
- `TARGET_SCHEMA`
- `JOIN_SCHEMA`
- `QA_DB_SKIP_REASON`
- `resetNoPkTable` — Port of H.resetTestTable({ type: "postgres", table: "no_pk_table" })
- `resetInspectTargetTables` — No counterpart in the Cypress original, and the same reasoning as
- `visitInspect` — Port of H.DataStudio.Transforms.visitInspect (e2e-data-studio-helpers.ts:49). */
- `createTestQuery` — Port of H.createTestQuery (e2e/support/helpers/api/createTestQuery.ts):
- `createMbqlTransform` — Port of H.createMbqlTransform (e2e-transform-helpers.ts:77). The `limit: 5`
- `createAndRunMbqlTransform` — Port of H.createAndRunMbqlTransform (e2e-transform-helpers.ts:273). */
- `createAndRunSqlTransform` — Port of H.createAndRunSqlTransform (e2e-transform-helpers.ts:295). */
- `createAndRunMbqlJoinTransform` — Port of the spec-local createAndRunMbqlJoinTransform
- `recordInspectorResponses` — Port of the two beforeEach aliases:
- `waitForInspectorDiscovery` — Port of cy.wait("@inspectorDiscovery"). */
- `waitForInspectorLens` — Port of cy.wait("@inspectorLens"). */

## transforms-permissions.ts
- `ALL_USERS_GROUP` — USER_GROUPS.ALL_USERS_GROUP — "All internal users". Measured: 1. */
- `COLLECTION_GROUP` — USER_GROUPS.COLLECTION_GROUP — the group literally named "collection". Measured: 5. */
- `DATA_GROUP` — USER_GROUPS.DATA_GROUP — the group literally named "data". Measured: 6. */
- `NORMAL_USER_ID` — NORMAL_USER_ID (cypress_sample_instance_data.js). Measured: 2. */
- `CREATE_QUERIES_PERMISSION_INDEX`
- `TRANSFORMS_PERMISSION_INDEX`
- `SOURCE_TABLE`
- `TARGET_TABLE`
- `TARGET_SCHEMA`
- `DB_NAME`
- `QA_DB_SKIP_REASON`
- `DataPermissionValue` — Port of `DataPermissionValue` (frontend/src/metabase-types/api/permissions.ts).
- `grantTransformsPermissionToAllGroups` — Port of the spec-local grantTransformsPermissionToAllGroups. */
- `denyTransformsPermissionToAllGroups` — Port of the spec-local denyTransformsPermissionToAllGroups. */
- `getTransformsNavLink` — Port of the spec-local getTransformsNavLink. */
- `resetPermissionTestTables` — `driver/table-exists?`) is a check against the REAL warehouse, which the

## transforms-reproductions.ts
- `SOURCE_TABLE`
- `TARGET_SCHEMA`
- `DB_NAME`
- `TARGET_TABLE` — Upstream `TARGET_TABLE = "transform_table"`, renamed. See the "TWO RENAMES"
- `DELETED_TRANSFORM_TARGET_TABLE` — Upstream `TRANSFORM_TARGET_TABLE = "deleted_transform_table"` (spec line
- `QA_DB_SKIP_REASON`
- `resetEmptySchema` — The upstream fixture (e2e/support/test_tables.js:291) is exactly
- `resetReproTargetTables` — `POST /api/transform`'s already-exists guard is a physical check. See the
- `visitTransformListPage` — Port of the spec-local `visitTransformListPage()`. */
- `getQueryEditor` — Port of the spec-local `getQueryEditor()`. */
- `visitTransformSettingsTab` — Port of `H.DataStudio.Transforms.visitSettingsTab(id)`
- `createMockSearchResult`

## transforms-template-tags.ts
- `DB_NAME`
- `SOURCE_TABLE`
- `TARGET_SCHEMA`
- `TARGET_TABLE` — against the same container all five slots share. Any name still containing
- `TRANSFORM_NAME` — the sibling incremental port: name "MBQL" -> table "mbql"), and test 3 then
- `TRANSFORM_TARGET_TABLE` — The table `TRANSFORM_NAME` auto-derives into, needed only for cleanup. */
- `QA_DB_SKIP_REASON`
- `resetTemplateTagTargetTables` — #85 compliance: this drops TWO EXACT TABLE NAMES, both chosen above to be
- `visitTransformListPage` — Port of `visitTransformListPage()`: cy.visit("/data-studio/transforms"). */
- `editorSidebar` — Port of `editorSidebar()`: cy.findByTestId("editor-sidebar"). */
- `getRunButton` — Port of `getRunButton()`: cy.findAllByTestId("run-button").eq(0).
- `nativeEditorActionButtons` — The native editor's action-button cluster (data reference / snippets / preview). */
- `nativeQueryTopBar` — The native editor's top bar (holds the "Variables" toggle). */
- `undoToast` — `H.undoToast()`: cy.findByTestId("toast-undo"). */
- `dismissUndoToast` — 🔴 Not cosmetic. `UndoListing.tsx:203` picks its transition group with
- `nativeEditorValue` — be a no-op for this particular value, but reading raw keeps the assertion
- `expectNativeEditorValue` — Assert `H.NativeEditor.value()` equals `expected`, retried. */
- `directText` — where testing-library's succeeds.)
- `assertNoParameterSettingsAreVisible` — Port of `assertNoParameterSettingsAreVisible()` (spec:374-382).
- `assertIsTransformRunnable` — Port of `assertIsTransformRunnable()` (spec:363-368): switch to the Run tab,
- `typeAppend` — Type into an input the way Cypress `.type()` does: APPEND at the end of any

## transforms.ts
- `DB_NAME`
- `SOURCE_TABLE`
- `TARGET_TABLE`
- `TARGET_TABLE_2`
- `TARGET_SCHEMA`
- `TARGET_SCHEMA_2`
- `CUSTOM_SCHEMA`
- `QA_DB_SKIP_REASON`
- `tooltip` — Scope-aware visible tooltip. Delegates to the canonical charts.ts helper. */
- `resetTransformTargetTables` — It deliberately does NOT drop foreign SCHEMAS, even though one of them
- `resetCompositePkTable` — Port of H.resetTestTable({ type: "postgres", table: "composite_pk_table" }) —
- `waitForApi`
- `waitForCreateTransform` — cy.intercept("POST", "/api/transform").as("createTransform") */
- `waitForUpdateTransform` — cy.intercept("PUT", "/api/transform/*").as("updateTransform") */
- `waitForDeleteTransform` — cy.intercept("DELETE", "/api/transform/*").as("deleteTransform") */
- `waitForDeleteTransformTable` — cy.intercept("DELETE", "/api/transform/*&#47;table").as("deleteTransformTable") */
- `waitForUpdateField` — cy.intercept("PUT", "/api/field/*").as("updateField") */
- `waitForCreateTag` — cy.intercept("POST", "/api/transform-tag").as("createTag") */
- `waitForUpdateTag` — cy.intercept("PUT", "/api/transform-tag/*").as("updateTag") */
- `waitForDeleteTag` — cy.intercept("DELETE", "/api/transform-tag/*").as("deleteTag") */
- `DataStudio`
- `verifyDisconnectedDatabaseBanner`
- `getTransformsNavLink`
- `getRunsNavLink`
- `getTransformsList`
- `getTransformsTargetContent`
- `getQueryEditor`
- `getRunButton` — Port of getRunButton(): findAllByTestId("run-button").eq(0). */
- `getCancelButton`
- `getRunStatus`
- `getRunListLink`
- `getRunErrorInfoButton`
- `getTableLink` — Port of getTableLink({ isActive }) — the Cypress getter carries an assertion
- `getDatabaseLink`
- `getSchemaLink`
- `getQueryVisualization`
- `getSchedulePicker`
- `getScheduleFrequencyInput`
- `getScheduleTimeInput` — `{ exact: true }` is not decoration. testing-library's `findByLabelText`
- `getCronInput` — The real placeholder is `"For example 5   0   *   Aug   ?"` — three spaces
- `getTagsInput`
- `getTagsInputContainer` — Port of getTagsInputContainer(): getTagsInput().parent(). */
- `getFieldPicker`
- `getIncrementalSwitch`
- `isIncrementalSwitchEnabled`
- `isIncrementalSwitchDisabled`
- `getJobTransformTable`
- `getTransformRunTable`
- `getTransformFilterWidget`
- `getStatusFilterWidget`
- `getTagFilterWidget`
- `getRunMethodFilterWidget`
- `getStartAtFilterWidget`
- `getEndAtFilterWidget`
- `visitTransformListPage`
- `visitJobListPage`
- `visitRunListPage`
- `getJobRow` — Port of getJobRow(name): the job list's row containing `name`. */
- `openBulkActionsMenu`
- `runTransformInUiAndWaitForSuccess` — Port of runTransformAndWaitForSuccess() — the UI one (there is also an API
- `runTransformInUiAndWaitForFailure`
- `runJobAndWaitForSuccess`
- `runJobAndWaitForFailure`
- `createMbqlTransform` — Port of the spec-local createMbqlTransform() wrapper + H.createMbqlTransform. */
- `createSqlTransform` — Port of the spec-local createSqlTransform() wrapper + H.createSqlTransform. */
- `createPythonTransform` — Port of the spec-local createPythonTransform() wrapper + H.createPythonTransform. */
- `pythonSourceTables` — Port of the spec-local pythonSourceTables(alias, tableId). */
- `createTransformCollection` — Port of H.createTransformCollection (e2e-transform-helpers.ts). */
- `createTransformTag` — Port of H.createTransformTag (e2e/support/helpers/api/createTransformTag.ts). */
- `createTransformJob` — Port of H.createTransformJob (e2e/support/helpers/api/createTransformJob.ts).
- `visitTransformJob` — Port of `cy.visit("/data-studio/transforms/jobs/:id")` — the
- `waitForSucceededTransformRuns` — Port of H.waitForSucceededTransformRuns (e2e-transform-helpers.ts:71) —
- `waitForCreateJob` — cy.intercept("POST", "/api/transform-job").as("createJob") */
- `waitForUpdateJob` — cy.intercept("PUT", "/api/transform-job/*").as("updateJob") — note that the
- `waitForDeleteJob` — cy.intercept("DELETE", "/api/transform-job/*").as("deleteJob") */
- `waitForBulkUpdateJobActive` — cy.intercept("PUT", "/api/transform-job/active").as("bulkUpdateJobActive") */
- `waitForApiRequestBody` — Port of `cy.wait("@alias").its("request.body").should("deep.equal", body)`.
- `createPythonLibrary` — Port of the spec-local createPythonLibrary(path, source). */
- `getPythonDataPicker`
- `runPythonScriptAndWaitForSuccess` — Port of runPythonScriptAndWaitForSuccess(). */
- `assertTableDoesNotExistError` — Port of assertTableDoesNotExistError(). */
- `assertOptionSelected` — Port of assertOptionSelected(name) — the tags input shows the pill. */
- `assertOptionNotSelected` — Port of assertOptionNotSelected(name). */
- `getRowNames` — Port of getRowNames(): the transform list's tree-node names, trimmed. */
- `checkSortingOrder` — Port of checkSortingOrder(transformNames). */
- `pythonEditorContent` — Port of codeMirrorHelpers("python-editor").get(). */
- `focusPythonEditor` — Port of PythonEditor.focus(): click, assert cm-focused. */
- `clearPythonEditor` — Port of PythonEditor.clear(): focus + select-all + Backspace. */
- `typePythonEditor` — Port of PythonEditor.type(text) — the non-`allowFastSet` branch, i.e. real
- `pythonEditorValue` — Port of PythonEditor.value(): the `.cm-line` textContents joined by newline,
- `visitCommonLibrary` — Port of the spec-local visitCommonLibrary(path = "common.py"). */
- `getLibraryEditorHeader` — Port of the spec-local getLibraryEditorHeader(). */
- `activatePythonTransformToken` — python source returns 200. The LOCAL `MB_PRO_SELF_HOSTED_TOKEN` predates that
- `setPythonRunnerSettings` — Port of `H.setPythonRunnerSettings()` (e2e-python-helpers.ts) — points the
- `collectionPickerDialog` — Port of `cy.findByRole("dialog", { name: "Select a collection" })`. */
- `collectionPickerButton`
- `collectionRowOptions` — Port of
- `transformsSearchInput`
- `getTransformNameInput` — Port of `H.DataStudio.Transforms.header().findByPlaceholderText("Name")`. */
- `getTransformHeaderEllipsis` — Port of `H.DataStudio.Transforms.header().icon("ellipsis")`. */
- `getTransformHistoryList`

## ui.ts
- `icon` — `.Icon-<name>` locator. Canonical home for the helper that had been
- `modal` — The open Mantine modal dialog. Canonical home for the helper that had been
- `popover` — Matches all visible popovers (like the Cypress helper). With a single
- `goToTab` — Click a tab by its accessible name. Canonical home for the copy that had
- `main` — Port of H.main() (e2e-ui-elements-helpers.js:25): cy.get("main"). Canonical
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

## user-settings.ts
- `NORMAL_USER` — The `normal` user, mirroring e2e/support/cypress_data.js USERS.normal:
- `NORMAL_USER_ID` — Port of NORMAL_USER_ID (e2e/support/cypress_sample_instance_data.js). */
- `getFullName` — Port of H.getFullName(normal). */
- `assertLightMode` — Port of the spec-local assertLightMode. */
- `assertDarkMode` — Port of the spec-local assertDarkMode. */
- `colorSchemeInput` — The color-scheme Select on /account/profile, matched by its current value. */
- `stubCurrentUser` — Port of the spec-local stubCurrentUser: replace GET /api/user/current with
- `goToProfile` — Port of H.goToProfile: open the profile menu and click "Account settings". */
- `waitForGetUser` — Register a wait for the next GET /api/user/current (cy.wait("@getUser")). */

## view-data-permissions.ts
- `DATA_ACCESS_PERM_IDX` — The spec's three permission-column indices. */
- `CREATE_QUERIES_PERM_IDX`
- `DOWNLOAD_PERM_IDX`
- `QA_DB_SKIP_REASON`
- `assertPermissionTable` — upstream — it asserts nothing.
- `savePermissions` — Port of H.savePermissions (e2e-permissions-helpers.js):
- `assertSameBeforeAndAfterSave` — Port of H.assertSameBeforeAndAfterSave: run the assertions, save, run them
- `selectImpersonatedAttribute` — Port of H.selectImpersonatedAttribute: open the impersonation dialog's
- `saveImpersonationSettings` — Port of H.saveImpersonationSettings: the dialog's Save button. */
- `createTestRoles`
- `makeOrdersSandboxed` — Port of the spec-local makeOrdersSandboxed(): from the group-focused schema
- `configureSandboxColumnAndAttribute` — The shared tail of every sandboxing-modal block in this spec: pick the
- `configureSandboxColumnAndAttributeInModal` — Same as the above, but with every step scoped to the modal — the form the
- `lackPermissionsView` — Port of the spec-local lackPermissionsView(shouldExist).

## visualizations-charts-reproductions.ts
- `MONGO_SKIP_REASON`
- `visitAdhoc`
- `visitNativeAdhoc`
- `visitAdhocNotebook` — Port of `H.visitQuestionAdhoc(question, { mode: "notebook" })`. The Cypress
- `cartesianChartCircles`
- `testPairedTooltipValues` — Port of H.testPairedTooltipValues(val1, val2):
- `toggleFieldSelectElement` — Port of the issue-18063 spec-local toggleFieldSelectElement:
- `countResponses` — The counting side of a `cy.intercept(...).as(alias)` whose only use is
- `withDatabase` — Port of H.withDatabase's `{ TABLE: { FIELD: id }, TABLE_ID: id }` map

## visualizations-table.ts
- `headerCells` — Port of the spec-local `headerCells()` — `cy.findAllByTestId("header-cell")`.
- `tableHeaderText` — Port of `H.tableHeaderColumn(name)` — note it returns the `findByText`
- `getColumnWidth` — Port of `H.getColumnWidth(columnId)` —
- `outerWidth` — Port of `H.tableHeaderColumn(x).invoke("outerWidth")` — jQuery `.outerWidth()`
- `scrollTableTo` — Port of `H.tableInteractiveScrollContainer().scrollTo(corner)`. Cypress's
- `triggerMouseEvent` — Cypress `.trigger(type, ...)` is a synthetic event dispatch at the element's
- `expectAnyCellContains` — Port of `cy.get(sel).should("contain", value)` on a MULTI-element subject:
- `expectNoCellContains`
- `assertClientSideTableSorting` — Port of the spec-local `assertClientSideTableSorting`. `columnName` is the
- `columnHeaderOf` — `H.tableHeaderColumn(name).closest("[role=columnheader]")`.
- `tableHeaderClickScoped` — `H.tableHeaderClick(name)` on the header text (see notebook.ts). */
- `assertCanViewOrdersTableDashcard` — Port of the spec-local `assertCanViewOrdersTableDashcard`. Called once on the
- `getWritableTable` — Port of `H.getTable({ name })` (e2e-qa-databases-helpers.js): the writable
- `hoverForHovercard` — Dispatch `mouseover` and wait for the field-metadata hovercard, re-nudging if

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
- `createQuestion`
- `createNativeQuestion`
- `createDashboard`
- `addQuestionToDashboard` — Port of H.addQuestionToDashboard: append a dashcard, keeping existing ones. */
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
- `dataSource` — Port of H.dataSource: the data-source row in the importer whose text contains
- `dataSourceColumn` — Port of H.dataSourceColumn. */
- `selectColumnFromColumnsList` — Port of H.selectColumnFromColumnsList. */
- `removeDataSource` — Port of H.removeDataSource (default, non-menu path): click the first "Remove"
- `ensureDisplayIsSelected` — Port of H.ensureDisplayIsSelected: the viz-type radio for `display` is
- `chartLegend` — Port of H.chartLegend. `scope` mirrors the Cypress calls, which ran the bare
- `chartLegendItems` — Port of H.chartLegendItems. */
- `chartLegendItem` — Port of H.chartLegendItem(name): chartLegend().findByText(name). A string
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

## visualizer-cartesian.ts
- `ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY`
- `PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY`
- `PIVOT_TABLE_CARD`
- `chartPathWithFillColor` — Port of H.chartPathWithFillColor, scoped to a chart-container ancestor
- `trendLine` — Port of H.trendLine (TREND_LINE_DASH = [5, 5]), scoped. */
- `echartsTextExact` — ECharts SVG `<text>` carries leading/trailing spaces and Playwright's
- `showDashcardVisualizerModalSettings` — Port of H.showDashcardVisualizerModalSettings: open the visualizer modal and
- `saveDashcardVisualizerModalSettings` — Port of H.saveDashcardVisualizerModalSettings (= saveDashcardVisualizerModal). */

## visualizer-columns-mapping.ts
- `COUNTRY_CODES`
- `ACCOUNTS_COUNT_BY_COUNTRY`
- `clickUndoButton` — Port of H.clickUndoButton (cy.findByLabelText("Undo") is exact — rule 1;

## visualizer-drillthrough.ts
- `cartesianChartCircleWithColor` — Port of H.cartesianChartCircleWithColor, scoped to a dashcard (the Cypress
- `applyBrush` — Port of H.applyBrush(left, right), scoped to a dashcard. Cypress fires
- `waitForDataset` — The @dataset intercept: POST /api/dataset. Register BEFORE the triggering
- `trackDatasetRequests` — A running counter of POST /api/dataset requests, for the VIZ-979 assertion

## visualizer-snowplow-tracking.ts
- `ACCOUNTS_COUNT_BY_CREATED_AT` — Port of ACCOUNTS_COUNT_BY_CREATED_AT (e2e/support/test-visualizer-data.ts). */
- `deselectDataset` — Port of H.deselectDataset: search for the dataset, assert its swap button is
- `removeDataSourceThroughMenu` — Port of H.removeDataSource(name, { throughMenu: true }): open the datasource
- `toggleVisualizerSettingsSidebar` — Port of H.toggleVisualizerSettingsSidebar. */
- `closeDashcardVisualizerModal` — Port of H.closeDashcardVisualizerModal. */

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

## waterfall.ts
- `verifyWaterfallRendering` — Port of the spec-local verifyWaterfallRendering. The Cypress
- `switchToWaterfallDisplay` — Port of the spec-local switchToWaterfallDisplay: expand the "more charts"
- `getWaterfallDataLabels` — Port of the spec-local getWaterfallDataLabels: `paint-order='stroke'` targets
- `countDisplayValue` — How many form controls inside `scope` currently have `value` as their value —
- `assertEChartsTooltipNotContain` — Port of H.assertEChartsTooltipNotContain (e2e-visual-tests-helpers.js): none

## wave7-filters-admin.ts
- `OAUTH_REDIRECT_URI`
- `registerOauthClient` — Register a dynamic client via `POST /oauth/register`, creating a
- `approveOauthClient`
- `denyOauthClient`

## whats-new.ts
- `mockVersions` — Port of the spec-local mockVersions: stub /api/setting/version-info with the
- `loadHomepage` — Port of the spec-local loadHomepage: visit "/", wait for the stubbed
- `seeWhatsNew` — The navbar "See what's new" link. findByText string → exact (rule 1). */
- `dismissWhatsNew` — The navbar notification's dismiss (close) icon. */

## whitelabel.ts
- `LOGO_PATH`
- `FAVICON_PATH`
- `LOGO_BASE64` — logo.jpeg as a base64 data URI — how the spec stores the logo setting and
- `LOGO_DATA_URI`
- `FAVICON_BASE64` — favicon.ico as a base64 data URI (the spec uploads it with mimeType
- `FAVICON_DATA_URI`
- `MB`
- `checkFavicon` — Port of the spec-local checkFavicon: GET the setting and assert the value
- `checkLogo` — Port of the spec-local checkLogo: the logo is stored as a data URI, so an
- `changeLoadingMessage` — Port of the spec-local changeLoadingMessage: on the whitelabel page pick a
- `setApplicationFontTo` — Port of the spec-local setApplicationFontTo (H.updateSetting). */
- `helpLink` — Port of the spec-local helpLink: the "Get help" item in the help submenu. */
- `getHelpLinkCustomDestinationInput` — Port of the spec-local getHelpLinkCustomDestinationInput. */

## worker-backend.ts
- `startWorkerBackend`

## workspace-instance.ts
- `QA_DB_SKIP_REASON`
- `WorkspaceListPage`
- `SetupWorkspaceModal`
- `CurrentWorkspacePage`
- `LeaveWorkspaceModal`
- `clearWorkspaceInstanceConfig` — Port of H.clearWorkspaceInstanceConfig (api/setWorkspaceInstanceConfig.ts). */
- `createAndRunTransform` — Port of the spec-local `createAndRunTransform` (upstream lines 258-287).

## workspace-manager.ts
- `QA_DB_SKIP_REASON`
- `WorkspaceListPage` — NAME MATCHING. Every `findByRole(..., { name })` below becomes
- `NewWorkspaceModal`
- `RenameWorkspaceModal`
- `DeleteWorkspaceModal`
- `enableWorkspaces` — Port of the spec-local `enableWorkspaces(databaseId)` (upstream 116-122):

## writable-db.ts
- `QA_POSTGRES_PORT` — Connection facts, mirroring WRITABLE_DB_CONFIG in e2e/support/cypress_data.js. */
- `QA_MYSQL_PORT`
- `writableDbSlot` — This process's slot, or `null` when per-worker isolation is off.
- `writableDbName` — The writable database THIS worker owns. `writable_db` when isolation is off. */
- `writableDbConnection` — Bare connection object for this worker's writable database — what `new
- `writableDbConfig` — Knex config for this worker's writable database. Every helper that talks to
- `writableDbDetailsPatch` — `dbname` is the key for BOTH engines — see `convertToWritable`
- `writableDbClient` — A client for this worker's writable database. */
- `provisionWritableDb` — Create this worker's writable database if it does not exist.

## x-rays.ts
- `getDashcardByTitle` — Port of the spec-local getDashcardByTitle: the dashcard in the dashboard
- `waitForDatasetResponses` — Resolve after `count` POST /api/dataset responses (the "@dataset" /
- `waitForDatasetWithRows` — Port of the spec's `waitForSatisfyingResponse("@ordersDataset", { body:
- `waitForXray` — Register a wait for the automagic-dashboards GET the drill fires. */
- `waitForGeojson` — Register a wait for the built-in geojson map asset the choropleth card
