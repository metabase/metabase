Done. Here is the report.

## 1. git diff (product mutation)

Semantic revert of fix commit `1a4744e` in the two current-code sites (the original `AddEditEmailSidebar.tsx` moved to `frontend/src/metabase/dashboard/components/DashboardSubscriptionsSidebar/AddEditSidebar/`):

**`.../DashboardSubscriptionsSidebar/AddEditSidebar/AddEditEmailSidebar.tsx`** and **`.../modals/CreateOrEditQuestionAlertModal/CreateOrEditQuestionAlertModal.tsx`** — both had the `userCanAccessSettings ? "…ending in ${domains}" : "…allowed domains"` ternary collapsed back to the unconditional domain-leaking string:

```
-                userCanAccessSettings
-                  ? t`You're only allowed to email alerts to addresses ending in ${domains}`
-                  : t`You're only allowed to email alerts to allowed domains`
+                t`You're only allowed to email alerts to addresses ending in ${domains}`
```

(same shape for the "subscriptions" wording in the sidebar). The mutation is left applied in the worktree.

## 2. Witness

Added to `frontend/src/metabase/notifications/modals/CreateOrEditQuestionAlertModal/CreateOrEditQuestionAlertModal.unit.spec.tsx` (reusing its existing `setup` harness; I added two opt-in setup params — `subscriptionAllowedDomains` and `withChannelTypes` — that don't affect existing tests):

```tsx
it("should hide the allowed email domains from non-admins without settings access (metabase#57138)", async () => {
  setup({
    isAdmin: false,
    userCanAccessSettings: false,
    isEmailSetup: true,
    subscriptionAllowedDomains: "metabase.test",
    withChannelTypes: true,
  });

  expect(await screen.findByText("New alert")).toBeInTheDocument();

  const tokenField = screen.getByTestId("token-field");
  await userEvent.type(
    within(tokenField).getByRole("textbox"),
    "mailer@metabase.example{enter}",
  );

  expect(
    await screen.findByText("You're only allowed to email alerts to allowed domains"),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/addresses ending in metabase\.test/),
  ).not.toBeInTheDocument();
});
```

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/notifications/modals/CreateOrEditQuestionAlertModal/CreateOrEditQuestionAlertModal.unit.spec.tsx
```

- **Clean HEAD:** `Tests: 21 passed, 21 total` (witness ✓).
- **Mutant:** witness ✕ — `Unable to find an element with the text: You're only allowed to email alerts to allowed domains` (the RecipientPicker instead renders "…addresses ending in metabase.test"), all other 20 tests still pass.

Two setup-harness details worth noting: the `subscription-allowed-domains` setting must be set (mockSettings wires both redux `useSetting` and the `MetabaseSettings` global that `recipientIsValid` reads); and the mocked `/api/pulse/form_input` channels needed a `type: "email"` field, because non-admins gate the create form on `getHasConfiguredEmailOrSlackChannel`, which filters on `c.type` (admins use `getHasConfiguredAnyChannel`, which ignores type — why no existing non-admin test tripped on it). I scoped that behind `withChannelTypes` so the pre-existing "should not show channels…" test keeps its behavior.

## 3. Bug summary

For a non-admin user without settings access, when they enter an email whose domain isn't in `subscription-allowed-domains`, the invalid-recipient error message leaks the configured allow-list, e.g. "You're only allowed to email alerts to addresses ending in **metabase.test**". The fix suppresses the domain for such users, showing the generic "…to allowed domains" instead. Applies to both the question-alert modal and the dashboard-subscription email sidebar. This is exactly what the e2e repro (`alert.cy.spec.js`, `metabase#57138`) checks by signing in as a normal user and asserting the generic wording.

## 4. Outcome

**witness_authored** — the bug is unit-catchable. The observable (which of two error strings the RecipientPicker shows) is a pure function of the redux `canAccessSettings` selector plus the allowed-domains setting, fully reproducible in jsdom via React Testing Library. No real browser, routing, network, or layout measurement is involved, so this jest test is a viable unit replacement for the e2e repro.

## 5. Confidence

High. The mutation is the precise inverse of the fix commit's product change, at the same two call sites (drift accounted for: the subscription sidebar file relocated but the logic is identical). The witness discriminates cleanly — a real assertion failure on the mutant (the leaked-domain string is present and the generic string is absent), not a compile/setup error — and passes on clean HEAD with the full pre-existing suite green in both states. The only non-obvious part was the mock fidelity (setting + channel `type`), now handled and isolated from other tests.