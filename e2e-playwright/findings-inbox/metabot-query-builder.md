# metabot-query-builder

Port of `e2e/test/scenarios/metabot/metabot-query-builder.cy.spec.ts` →
`tests/metabot-query-builder.spec.ts` (8 tests). Verified on the jar (slot 1):
8/8 green, 16/16 under `--repeat-each=2`, tsc clean. EE/token-gated; LLM stubbed
via canned SSE (no key). No fixmes, no product-bug claims.

## Fixes classified

- **New gotcha (worth adding to PORTING.md): a Mantine `Modal`'s `data-testid`
  lands on the Modal-ROOT wrapper, which Playwright's `toBeVisible` reports
  hidden even when the modal is open.** The root only renders when `opened`
  (default `keepMounted={false}`), so its presence already proves the modal
  opened — but its children are `position: fixed`, giving the wrapper a
  zero-size box, and Playwright treats zero-box as hidden. Cypress's
  `should("be.visible")` on the same element passes. Faithful port:
  `toBeAttached()` on the testid + `toBeVisible()` on a visible descendant (the
  modal title `Connect to an AI provider`), not `toBeVisible()` on the wrapper.
  Same family as the existing "assert on rendered content, not the wrapper"
  notes. This was the only assertion that needed changing; caught by jar-mode.

## Port notes (mechanical, no dividend)

- The Cypress `beforeEach` aliases `POST /api/metabot/agent-streaming` as
  `@agentReq` but nothing ever waits on it (tests use the `@metabotAgent` alias
  that `mockMetabotResponse` sets). Dropped per PORTING rule 2; where a test
  reads the request (`profile_id === "nlq"`), `waitForAgentRequest()` is
  registered before send and `response.request().postDataJSON()` inspected.
- `mockMetabotResponse`'s Cypress `delay` option (navigate_to test) has no
  equivalent in the shared helper and isn't needed — the test only asserts the
  final URL + QB header — so it's dropped.
- `cy.intercept("GET", ".../prompt-suggestions*")` → `page.route` with a regex
  for the id segment (Playwright globs treat `*` as "not `/`").
- Reused shared `support/metabot.ts` (UI helpers, SSE builders,
  `mockMetabotResponse`) read-only; `adhocQuestionHash` from `permissions.ts`;
  `newButton`/`popover`/`main`/`queryBuilderHeader` from `ui.ts`. New spec-local
  helpers (canned response builders, `waitForAgentRequest`, `mockPromptSuggestions`,
  `allOrdersQuestion`) in the new `support/metabot-query-builder.ts`.
