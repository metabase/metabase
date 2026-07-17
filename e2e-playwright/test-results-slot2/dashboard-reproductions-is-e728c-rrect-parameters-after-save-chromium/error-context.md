# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard-reproductions.spec.ts >> issue 12926 >> saving a dashboard that retriggers a non saved query (negative id) >> should load the card with correct parameters after save
- Location: tests/dashboard-reproductions.spec.ts:379:9

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByTestId('dashcard-container').first().getByText('Select…', { exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e4]:
    - generic [ref=e6]:
      - generic [ref=e8]:
        - generic [ref=e9]:
          - generic [ref=e10]:
            - img "pencil icon" [ref=e11]
            - generic [ref=e13]: You're editing this dashboard.
          - generic [ref=e14]:
            - button "Cancel" [ref=e15] [cursor=pointer]:
              - generic [ref=e17]: Cancel
            - button "Save" [ref=e19] [cursor=pointer]:
              - generic [ref=e21]: Save
        - generic [ref=e22]:
          - generic [ref=e24]:
            - heading "Test Dashboard Edited a few seconds ago by you" [level=1] [ref=e25]:
              - textbox "Add title" [ref=e28] [cursor=pointer]: Test Dashboard
              - button "Edited a few seconds ago by you" [ref=e30] [cursor=pointer]
            - generic [ref=e32]:
              - button "Add questions" [ref=e35] [cursor=pointer]:
                - img "add icon" [ref=e37]
              - button "Add a heading or text box" [ref=e41] [cursor=pointer]:
                - generic [ref=e43]:
                  - img "string icon" [ref=e44]
                  - img "chevrondown icon" [ref=e46]
              - button "Add a link or iframe" [ref=e50] [cursor=pointer]:
                - generic [ref=e52]:
                  - img "link icon" [ref=e53]
                  - img "chevrondown icon" [ref=e56]
              - button "Add section" [ref=e60] [cursor=pointer]:
                - img "section icon" [ref=e62]
              - button "Add a filter or parameter" [ref=e66] [cursor=pointer]:
                - img "filter icon" [ref=e68]
              - separator [ref=e72]
              - button "Toggle width" [ref=e76] [cursor=pointer]:
                - img "ellipsis icon" [ref=e78]
          - tablist [ref=e83]:
            - generic [ref=e84]:
              - tab "Tab 1" [selected] [ref=e85] [cursor=pointer]:
                - generic [ref=e86]:
                  - textbox "Tab 1" [disabled]
                - button "chevrondown icon" [ref=e87]:
                  - img "chevrondown icon" [ref=e89]
              - button "Create new tab" [ref=e91] [cursor=pointer]:
                - img "add icon" [ref=e93]
              - status [ref=e95]
      - generic [ref=e96]:
        - generic [ref=e97]:
          - list [ref=e101]:
            - listitem [ref=e102]:
              - generic [ref=e103] [cursor=pointer]:
                - generic [ref=e104]: Number
                - img "grabber icon" [ref=e107]
            - status [ref=e109]
          - generic [ref=e116]:
            - generic [ref=e120]: Question 1
            - generic [ref=e124]:
              - img "info icon" [ref=e125]
              - generic [ref=e127]: A number variable in this card can only be connected to a number filter with Equal to operator.
              - link "Learn how" [ref=e128] [cursor=pointer]:
                - /url: https://www.metabase.com/docs/latest/questions/native-editor/sql-parameters.html
        - complementary [ref=e129]:
          - tabpanel [ref=e132]:
            - generic [ref=e133]:
              - generic [ref=e134]:
                - generic [ref=e135]: Label
                - textbox "Label" [ref=e138]: Number
              - generic [ref=e139]:
                - generic [ref=e140]: Filter or parameter type
                - generic [ref=e142]:
                  - textbox [ref=e143] [cursor=pointer]: Number
                  - generic:
                    - img
              - generic [ref=e144]:
                - generic [ref=e145]: Filter operator
                - generic [ref=e147]:
                  - textbox [ref=e148] [cursor=pointer]: Equal to
                  - generic:
                    - img
              - generic [ref=e149]:
                - generic [ref=e150]: How should people filter on this column?
                - radiogroup [ref=e152]:
                  - generic [ref=e153]:
                    - generic [ref=e154]:
                      - generic [ref=e156]:
                        - generic [ref=e157]:
                          - radio "Dropdown list" [checked] [ref=e158] [cursor=pointer]
                          - img
                        - generic [ref=e160]: Dropdown list
                      - button "Edit" [ref=e162] [cursor=pointer]:
                        - generic [ref=e165]: Edit
                    - generic [ref=e168]:
                      - generic [ref=e169]:
                        - radio "Search box" [ref=e170] [cursor=pointer]
                        - img
                      - generic [ref=e172]: Search box
                    - generic [ref=e175]:
                      - generic [ref=e176]:
                        - radio "Input box" [ref=e177] [cursor=pointer]
                        - img
                      - generic [ref=e179]: Input box
              - generic [ref=e180]:
                - generic [ref=e181]: People can pick
                - radiogroup [ref=e183]:
                  - generic [ref=e184]:
                    - generic [ref=e186]:
                      - generic [ref=e187]:
                        - radio "Multiple values" [checked] [ref=e188] [cursor=pointer]
                        - img
                      - generic [ref=e190]: Multiple values
                    - generic [ref=e192]:
                      - generic [ref=e193]:
                        - radio "A single value" [ref=e194] [cursor=pointer]
                        - img
                      - generic [ref=e196]: A single value
              - generic [ref=e197]:
                - generic [ref=e198]: Default value
                - generic "Default value" [ref=e199]:
                  - listitem [ref=e200]:
                    - button "No default" [ref=e201] [cursor=pointer]:
                      - img "number icon" [ref=e202]
                      - generic [ref=e205]: "10"
                      - button "Clear" [ref=e206]:
                        - img "close icon" [ref=e207]
                - generic [ref=e209]:
                  - switch "Always require a value" [ref=e212]
                  - generic [ref=e216]:
                    - generic [ref=e217] [cursor=pointer]: Always require a value
                    - generic [ref=e218]: When enabled, people can change the value or reset it, but can't clear it entirely.
              - generic [ref=e219]:
                - textbox "Move filter" [ref=e221] [cursor=pointer]: Top of page
                - text: Move filter
          - generic [ref=e222]:
            - button "Remove" [ref=e224] [cursor=pointer]:
              - generic [ref=e225]:
                - img "trash icon" [ref=e227]
                - generic [ref=e230]: Remove
            - button "Done" [ref=e232] [cursor=pointer]:
              - generic [ref=e234]: Done
  - generic:
    - generic:
      - list "undo-list"
```

# Test source

```ts
  302 |         questionDetails,
  303 |       });
  304 |       await page.goto(`/dashboard/${dashcard.dashboard_id}`);
  305 | 
  306 |       // The query is deliberately slowed, so it is still in-flight here.
  307 |       // The API client uses fetch, so cancelling the query aborts its
  308 |       // AbortController (the upstream cy.spy on abort).
  309 |       await page.evaluate(() => {
  310 |         const original = AbortController.prototype.abort;
  311 |         (window as unknown as { __abortCalls: number }).__abortCalls = 0;
  312 |         AbortController.prototype.abort = function (
  313 |           ...args: Parameters<typeof original>
  314 |         ) {
  315 |           (window as unknown as { __abortCalls: number }).__abortCalls += 1;
  316 |           return original.apply(this, args);
  317 |         };
  318 |       });
  319 | 
  320 |       await removeCard(page);
  321 | 
  322 |       await expect
  323 |         .poll(() =>
  324 |           page.evaluate(
  325 |             () => (window as unknown as { __abortCalls: number }).__abortCalls,
  326 |           ),
  327 |         )
  328 |         .toBeGreaterThan(0);
  329 |     });
  330 | 
  331 |     test("should re-fetch the query when doing undo on the removal", async ({
  332 |       page,
  333 |       mb,
  334 |     }) => {
  335 |       const stopDelaying = await delayResponses(
  336 |         page,
  337 |         DASHCARD_QUERY_PATH,
  338 |         5000,
  339 |       );
  340 | 
  341 |       const dashcard = await createNativeQuestionAndDashboard(mb.api, {
  342 |         questionDetails,
  343 |       });
  344 |       await page.goto(`/dashboard/${dashcard.dashboard_id}`);
  345 | 
  346 |       await removeCard(page);
  347 | 
  348 |       await stopDelaying();
  349 | 
  350 |       const refetch = waitForDashcardQuery(page);
  351 |       await undo(page);
  352 |       await refetch;
  353 | 
  354 |       await expect(
  355 |         getDashboardCard(page).getByText(String(queryResult), { exact: true }),
  356 |       ).toBeVisible();
  357 |     });
  358 | 
  359 |     test("should not break virtual cards (metabase#35545)", async ({
  360 |       page,
  361 |       mb,
  362 |     }) => {
  363 |       const { id } = await createDashboard(mb.api);
  364 |       await visitDashboard(page, mb.api, id);
  365 | 
  366 |       await addTextBox(page, "Text card content");
  367 | 
  368 |       await removeDashboardCard(page);
  369 | 
  370 |       await undo(page);
  371 | 
  372 |       await expect(
  373 |         getDashboardCard(page).getByText("Text card content", { exact: true }),
  374 |       ).toBeVisible();
  375 |     });
  376 |   });
  377 | 
  378 |   test.describe("saving a dashboard that retriggers a non saved query (negative id)", () => {
  379 |     test("should load the card with correct parameters after save", async ({
  380 |       page,
  381 |       mb,
  382 |     }) => {
  383 |       await createNativeQuestion(mb.api, questionDetails);
  384 | 
  385 |       const { id } = await createDashboard(mb.api);
  386 |       await visitDashboard(page, mb.api, id);
  387 | 
  388 |       await editDashboard(page);
  389 | 
  390 |       await openQuestionsSidebar(page);
  391 |       await sidebar(page)
  392 |         .getByText(questionDetails.name, { exact: true })
  393 |         .click();
  394 | 
  395 |       await setFilter(page, "Number", "Equal to");
  396 |       await sidebar(page).getByText("No default", { exact: true }).click();
  397 |       await popover(page)
  398 |         .getByPlaceholder("Enter a number", { exact: true })
  399 |         .fill(String(parameterValue));
  400 |       await popover(page).getByText("Add filter", { exact: true }).click();
  401 | 
> 402 |       await getDashboardCard(page).getByText("Select…", { exact: true }).click();
      |                                                                          ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  403 |       // cy .contains(...).eq(0) — first match.
  404 |       await popover(page)
  405 |         .getByText(filterDisplayName, { exact: true })
  406 |         .first()
  407 |         .click();
  408 | 
  409 |       await saveDashboard(page);
  410 | 
  411 |       await expect(
  412 |         getDashboardCard(page).getByText(String(queryResult + parameterValue), {
  413 |           exact: true,
  414 |         }),
  415 |       ).toBeVisible();
  416 |     });
  417 |   });
  418 | });
  419 | 
  420 | test.describe("issue 13736", () => {
  421 |   const questionDetails = {
  422 |     name: "Orders count",
  423 |     query: {
  424 |       "source-table": ORDERS_ID,
  425 |       aggregation: [["count"]],
  426 |     },
  427 |   };
  428 | 
  429 |   test.beforeEach(async ({ mb }) => {
  430 |     await mb.restore();
  431 |     await mb.signInAsAdmin();
  432 |   });
  433 | 
  434 |   test("should work even if some cards are broken (metabase#13736)", async ({
  435 |     page,
  436 |     mb,
  437 |   }) => {
  438 |     const { id: failingQuestionId } = await createQuestion(
  439 |       mb.api,
  440 |       questionDetails,
  441 |     );
  442 |     const { id: successfulQuestionId } = await createQuestion(
  443 |       mb.api,
  444 |       questionDetails,
  445 |     );
  446 |     const { id: dashboardId } = await createDashboard(mb.api, {
  447 |       name: "13736 Dashboard",
  448 |     });
  449 | 
  450 |     const failingQueryPath = new RegExp(
  451 |       `^/api/dashboard/\\d+/dashcard/\\d+/card/${failingQuestionId}/query$`,
  452 |     );
  453 |     await page.route(
  454 |       (url) => failingQueryPath.test(url.pathname),
  455 |       (route) =>
  456 |         route.fulfill({
  457 |           status: 500,
  458 |           contentType: "application/json",
  459 |           body: JSON.stringify({
  460 |             cause: "some error",
  461 |             data: {},
  462 |             message: "some error",
  463 |           }),
  464 |         }),
  465 |     );
  466 | 
  467 |     await updateDashboardCards(mb.api, {
  468 |       dashboard_id: dashboardId,
  469 |       cards: [
  470 |         { card_id: failingQuestionId },
  471 |         { card_id: successfulQuestionId, col: 11 },
  472 |       ],
  473 |     });
  474 |     await visitDashboard(page, mb.api, dashboardId);
  475 | 
  476 |     await expect(
  477 |       getDashboardCards(page)
  478 |         .nth(0)
  479 |         .getByText("There was a problem displaying this chart.", {
  480 |           exact: true,
  481 |         }),
  482 |     ).toBeVisible();
  483 |     await expect(
  484 |       getDashboardCards(page).nth(1).getByText("18,760", { exact: true }),
  485 |     ).toBeVisible();
  486 |   });
  487 | });
  488 | 
  489 | test.describe("issue 16559", () => {
  490 |   const dashboardDetails = {
  491 |     name: "16559 Dashboard",
  492 |   };
  493 | 
  494 |   test.beforeEach(async ({ page, mb }) => {
  495 |     await mb.restore();
  496 |     await mb.signInAsAdmin();
  497 | 
  498 |     const { id } = await createDashboard(mb.api, dashboardDetails);
  499 |     await visitDashboard(page, mb.api, id);
  500 |   });
  501 | 
  502 |   function latestRevisionEvent(page: Page) {
```