Both the mutation and witness are left in the worktree. Task complete.

---

## Report

### 1. git diff (product mutation)
Semantic revert of fix `908eda5` in the file's current location `frontend/src/metabase/common/CreateDashboard/CreateDashboardForm.tsx` (moved from the old `dashboard/containers/` path):

```diff
-      const dashboard = await handleCreateDashboard(values).unwrap();
+      const { data: dashboard } = await handleCreateDashboard(values);
       if (dashboard) {
```

This drops `.unwrap()` and destructures `{ data }` from the RTK Query result. On a server error the result is `{ error }` (data is `undefined`), so nothing is thrown — the exact pre-fix bug.

### 2. Witness
Added to `frontend/src/metabase/common/CreateDashboard/CreateDashboardModal.unit.spec.tsx`:

```tsx
it("surfaces a server validation error when creating with a blank name (metabase#63176)", async () => {
  setup({ mockCreateDashboardResponse: false });
  fetchMock.post(`path:/api/dashboard`, {
    status: 400,
    body: { errors: { name: "value must be a non-blank string." } },
  });

  const nameField = screen.getByRole("textbox", { name: /name/i });
  // A single space passes the client-side `required` check, so it reaches
  // the server, which rejects it as a blank string.
  await userEvent.type(nameField, " ");

  const createButton = await screen.findByRole("button", { name: "Create" });
  await waitFor(() => expect(createButton).toBeEnabled());
  await userEvent.click(createButton);

  expect(
    await screen.findByText("value must be a non-blank string."),
  ).toBeInTheDocument();
  expect(nameField).toHaveAttribute("aria-invalid", "true");
  expect(await screen.findByText("Failed")).toBeInTheDocument();
});
```

**Oracle command** (run from the MAIN tree — the worktree's own `bun` harness hits a bun symlink resolution bug `Cannot find module '@stardazed/streams-text-encoding'`; running from the main tree resolves node_modules correctly and still picks up the worktree spec file):
```
bun run test-unit-keep-cljs .claude/worktrees/agent-a18f76da48c50e0b6/frontend/src/metabase/common/CreateDashboard/CreateDashboardModal.unit.spec.tsx -t "metabase#63176"
```
- **PASS on clean** (`.unwrap()`): `Tests: 1 passed`.
- **FAIL on mutant** (destructure): `findByText("value must be a non-blank string.")` times out; dumped DOM shows the name input with `aria-invalid="false"` and no error/`Failed` state — clean assertion failure, not a compile error.

### 3. Bug summary
When a user submits the Create Dashboard modal with a blank name (a single space passes the client-side Yup `required` check and reaches the server), the backend returns a 400 with `{ errors: { name: "value must be a non-blank string." } }`. With the fix, `.unwrap()` throws that error; Metabase's `useFormSubmit` catches it, calls `helpers.setErrors(error.data.errors)` (marking the field `aria-invalid` and showing the message) and sets form status to `rejected` (the submit button shows `Failed`). With the bug, the error is swallowed by the `{ data }` destructure — no throw — so the form reports `fulfilled`: no error text, field stays valid, and no `Failed` state. The user gets silent failure.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable. The entire chain (RTK mutation error → form `setErrors` → `aria-invalid` + message + `Failed` button) is exercisable in jsdom with a `fetch-mock` 400 response; no real browser, layout, routing, or network is required.

### 5. Confidence
High. The mutation is the literal inverse of the shipped one-line fix, applied at the same seam that drifted to a new path. The witness asserts on all three observable signals the e2e repro checks (error text, `aria-invalid="true"`, `Failed` button) and cleanly discriminates: PASS on `.unwrap()`, FAIL on the destructure. The mocked 400 body shape matches what `getFormErrors` reads (`error.data.errors`), which is how the field-level message and invalid state are produced.