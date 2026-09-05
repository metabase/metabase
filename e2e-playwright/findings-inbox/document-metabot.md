# document-metabot

Port of `e2e/test/scenarios/documents/document-metabot.cy.spec.ts` (1 test).
Green on the CI uberjar (751c2a98), 2/2 under `--repeat-each=2`. tsc clean.
No fixmes, no product-bug claims — no cross-check required.

## Endpoint reality: document Metabot is JSON, not the SSE stream

The rest of the Metabot family streams from POST `/api/metabot/agent-streaming`
(support/metabot.ts's SSE builders + `mockMetabotResponse`). The **document**
Metabot block does not: `MetabotEmbed.tsx` → `useLazyMetabotGenerateContentQuery`
→ POST `/api/metabot/document/generate-content`, a plain JSON endpoint returning
`{ draft_card, description, error }`. So the brief's "canned SSE returns
text/entity parts" framing doesn't fit this spec — the faithful stub is a canned
JSON body, not an SSE body. New helper `support/document-metabot.ts`
(`mockDocumentGenerateContent` + `buildSqlChartResponse`); the shared SSE helpers
were left untouched.

## What upstream actually exercises vs. what we stub

Upstream stubs the LLM at the **Anthropic wire level** (`cy.task
startMockLlmServer` returns a canned `document_construct_sql_chart` tool call)
and lets the REAL backend run the tool — validate SQL, build the query,
`draft-card-from-chart-output` (metabase.metabot.api.document). We can't reach an
LLM in jar mode, so we mock the endpoint's response with the exact draft_card the
backend derives from that tool call: `name` from the tool input, `display` from
`viz_settings.chart_type`, a native `dataset_query` from the tool's SQL,
`database_id`, `parameters: []`, `visualization_settings: {}`. This is the same
stub level metabot.spec.ts uses (mock the FE-facing endpoint), one hop below
upstream (mock the LLM), and the difference is invisible to the test's
assertions (embed title visible, description paragraph, "Created with Metabot").
Scope caveat: this port does NOT exercise the backend tool pipeline (SQL
validation / query construction / chart-draft assembly) — only the FE render of
the endpoint's response.

## Gotcha: Run button is gated on `llm-metabot-configured?`, not just the token

`useUserMetabotPermissions().canUseMetabot = hasMetabotAccess && isConfigured`,
and `isConfigured = useSetting("llm-metabot-configured?")`, which the backend
derives from the selected provider's key (metabase.metabot.settings). So even
though the endpoint is mocked and no key is used for a request, the Run button
stays **disabled** unless `llm-anthropic-api-key` is set. The beforeEach sets it
(mirroring upstream) purely to enable the button — a subtle dependency: dropping
the key as "unneeded because we mock the network" would silently leave the Run
button disabled and time out the click.
