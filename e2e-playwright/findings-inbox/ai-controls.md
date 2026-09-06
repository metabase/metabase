# ai-controls (metabot/ai-controls.cy.spec.ts → tests/ai-controls.spec.ts)

17/17 tests, faithful, green on the jar (slot 2, COMMIT-ID 751c2a98),
34/34 under `--repeat-each=2`. tsc clean (the two tsc errors on the branch are
in a sibling agent's `dashboard-drill.spec.ts`, not this port).

## Migration dividend / mechanism note: quota tests need the REAL backend, not `mockMetabotResponse`

The brief suggested stubbing the 2 agent tests with `mockMetabotResponse`. That
helper fulfils POST `/api/metabot/agent-streaming` at the **browser**, so the
backend never runs — which would make every quota assertion in this spec
**vacuous** (the whole point of these tests is the backend's usage-limit logic).
So the faithful mechanism is the Cypress one, ported: a Node HTTP server
impersonating the Anthropic Messages API, pointed at by
`llm-anthropic-api-base-url`, so requests flow through the real backend and only
the final provider call is stubbed.

- Verified in source: `metabase.metabot.self/call-llm` short-circuits when
  `usage/check-usage-limits!` returns a message and streams an
  `ai_usage_limit_reached` error part **without ever calling the provider**
  (so the quota-exceeded tests don't even hit the mock server). The FE renders
  that error's message verbatim as a chat message
  (`metabot/state/actions.ts` — `display: {type:"message", message}` for
  `ai_usage_limit_reached`). Both branches confirmed on the jar.
- The mock server binds an **ephemeral port** (`listen(0)`), not Cypress's fixed
  6123, so it can never collide with a sibling worker/shard backend. Lives in
  `support/ai-controls.ts` (a new file; shared files untouched). This is the
  reference infra Cypress had as `cy.task("startMockLlmServer")`
  (`e2e/support/helpers/e2e-mock-llm-tasks.ts`) — the reason `document-metabot`
  and the mock-LLM path here had been left unported. All 4 agent tests
  (instance-limit-0, group effective-limit with `seed-ai-usage`, tenant-limit-0,
  tenant-no-limit) now run end-to-end on the jar.

## Gotchas worth folding into PORTING.md

- **A Mantine `Switch` can be `disabled` while an unrelated settings query
  loads.** `useAdminSetting` returns `isLoading = settingsLoading ||
  detailsLoading`; the illustrations `Switch` is `disabled={isLoading}`, and its
  `data-checked="true"` flips as soon as the *settings* query resolves — but the
  *admin-settings-details* query can still be pending, leaving the switch
  `disabled`. A `.click({force:true})` on a disabled input silently no-ops (no
  toggle, no PUT), and the failure surfaces as a `waitForResponse` timeout on the
  save, not as a click error. Assert `await expect(sw).toBeEnabled()` before
  toggling any admin `Switch`, not just `toBeChecked`/`data-checked`.
- **Mantine `SegmentedControl` "radios" are offscreen hidden inputs.**
  `getByRole("radio",{name}).click({force:true})` throws *"Element is outside of
  the viewport"* even with `force` (force skips actionability but a real mouse
  click still needs the point in the viewport, and the input is `sr-only`). Click
  the **visible label** (`getByText(optionLabel,{exact:true})`) — it auto-scrolls
  into view. (The sibling table `Switch`es in the same spec toggle fine with a
  force-click because they're visible; the distinction is hidden-input controls.)

## Faithfulness details

- `H.updateEnterpriseSettings({...})` → per-key `api.updateSetting` (each is
  `PUT /api/setting/:key`, equivalent to the map PUT).
- Admin text inputs (name, quota message) are debounce-saved → `typeAndBlur`
  (click + fill + blur), anchored on the setting PUT.
- Tenant user isn't in the cached USERS map → `signInViaCookie` POSTs
  `/api/session` and installs the browser session cookies (equivalent of the
  spec's `cy.request("POST","/api/session")`); `mb.api` stays admin, matching the
  spec (all API setup runs as admin before the browser session is switched).
- `cy.reload()` → `page.reload()`; `contain.value` → `toHaveValue(/regex/)`.
