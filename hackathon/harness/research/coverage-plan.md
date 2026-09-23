# Measuring search comprehensively: what's missing and what it costs

Agent I, 2026-09-23. For Voytek, via F. Research only: nothing here has been built or run. Builds on J's partial notes
(`coverage-plan-notes-J.md`); the facts I rely on were rechecked in code.

## The short version

- **Today we measure mostly "find a question".** Golden's 52 answerable questions have 35 cards as their top answer.
  The SQL set is 60 of 60 cards. Collections, documents, measures, actions, databases and model values (indexed
  entities) are never the answer to any question.
- **Every item type is embedded by name and description only.** So an undocumented table, dashboard or document is as
  invisible to semantic search as "Query 17" was, and no test would notice.
- **Two different jobs**, which cost very differently:
  1. **Measure the gaps** (new items and questions only, no Metabase change). This compares every engine fairly today,
     keyword engines included. **About 15–17 agent-hours (phases 0–3) plus under 1 hour of runs.**
  2. **Close the gaps in the embedding** (an opt-in setting per type that embeds more content, like E's variant).
     Each type costs a small Clojure change plus a rerun. **About 4–6 agent-hours per type.**
- **Recommended first phase**: a coverage corpus (undocumented items of every type) with blind-written questions, 30
  or more per type. Phase 0 before it is a two-hour "coverage" card that shows what we measure today.

## 1. What people search each type by, and what we index

"Embedded" = in the vector. "Keyword" = in the text keyword engines search. From each model's search spec.

| Type | Users search it by | Embedded today | Keyword today | Content not used at all |
|---|---|---|---|---|
| Question, model, metric | what it answers, its measure and breakdown, a table | name, description | + native SQL, **only if the request sets `search_native_query=true`** (our runner never does) | the query as meaning (the SQL/MBQL study), result columns |
| Dashboard | topic, the charts on it | name, description | same | **its cards, tabs, filters, text boxes** |
| Table | business name, **a column** ("where's discount_code?") | name, display name, description | same (**columns aren't searchable by any engine: there is no Field search spec**) | **columns** (names, display names, descriptions), sample values |
| Segment | what it filters to ("active EU customers") | name, description | same | **its filter definition** |
| Measure | what it computes | name, description | same | **its aggregation** |
| Model (dataset) | topic, **its columns** | name, description | + SQL (only with the flag) | columns, query meaning |
| Document | **words in the body** | name only | name + body | body excluded from the vector on purpose (`document.clj:525`) |
| Collection | team or topic | name only | name | **description** (a render term only; the spec comment at `collection.clj:2472` says it was probably overlooked), what's inside it |
| Action | what it does ("refund an order") | name, description | same | parameters, target model |
| Indexed entity (a model's row values, e.g. a customer name) | the value itself | the value | the value | which model and column it came from |
| Transform | what it produces | name, description | same | source query, target table. **Superuser-only in search**, so our non-admin harness user can't measure it |
| Database | name | name, description | same | its schemas and tables |

The bold cells are what most users would expect to work, and nothing tests them.

## 2. Kinds of question we never ask

| Kind | Example | Needs Metabase change to *pass* in semantic? | Needs harness work to *ask*? |
|---|---|---|---|
| Table by column | "table with discount code" | yes (columns aren't embedded) | field metadata in apply.ts |
| Dashboard by a card on it | "the dashboard with the churn chart" | yes | dashboard cards in apply.ts |
| Document by body text | a phrase from the body | yes (body excluded) | no (apply.ts writes bodies) |
| Metric/measure/segment by definition | "sum of refunds", "EU customers" | yes | no (definitions exist); richer definitions help |
| Undocumented item of any type | vague names, meaning only in content | yes | new corpus |
| Same name across types | "Revenue": card vs metric vs dashboard vs table | no | new labels (which one should win) |
| Filters | only dashboards; created by Ana; verified only; archived | no | **contract + runner**: scenarios can't carry filters yet (the runner passes only `models`) |
| Permissions | item in a collection the user can't read must not appear | no | golden has a few (`expectedAbsent`); needs more, per type |
| Non-English | Polish/Japanese names and queries | no (arctic handles it) | golden has 4; needs ~30 to say anything |
| Values | a customer or product name (indexed entities) | no | model index creation in apply.ts |

## 3. What a comprehensive suite looks like

**How many questions.** Observed 95% ranges so far (J's collation plus mine): n ≈ 50–56 → ±0.03–0.09; n = 24 → ±0.13–0.19;
n = 13 → ±0.20; n = 5–9 → ±0.2–0.4. The per-question difference between arms has a spread (sd) of about 0.3–0.37. A 95% range of ±0.10 then needs about 35–55 paired questions; ±0.15 needs about 16–24.
- To **compare engines per type** (small differences): ~40 questions per type, i.e. ~24 held-out.
- To **catch big failures per type** (the "invisible undocumented table" kind, differences of 0.3+): 20 per type.
- The headline stays pooled over all types (hundreds of questions, tight ranges). Per-type numbers are diagnostics.

**Proposal**: 8 main types × 30 questions (question, dashboard, table, metric, model, segment/measure, document,
collection) plus 4 cross-cutting sets of 20 (same-name, filters, permissions, non-English), about **320 questions**.
Split 60/40 dev/held-out, stratified by type × category, frozen before writing.

**What corpus-gen/apply.ts can create today**: database, tables (display name and description), collections (incl.
restricted), questions, models and metrics (now with native SQL and MBQL filters/breakouts), dashboards (**empty**),
documents (one paragraph of body), segments and measures (a single trivial definition), one harness user.
**Missing**, in order of value:
1. **Field metadata**: column display names and descriptions (`PUT /api/field/:id`). Enables table-by-column. ~1 h.
2. **Dashboard cards and tabs** (`PUT /api/dashboard/:id` with dashcards). Enables dashboard-by-card. ~1.5 h.
3. **Real segment/measure definitions** (filters by column name, like the MBQL work already done). ~1 h.
4. **Several users** as creators (filter questions) and **archived/verified** items. ~1 h. Verified needs a premium token (we have one).
5. **Model indexes** (indexed entities, `POST /api/model-index`) and **actions**. ~1.5 h.
6. Transforms: skip. They're superuser-only in search, so measuring them needs an admin run, which breaks the fairness rule (one non-admin user).

**Labelling, the way that worked**: define each question *slot* first (type, category, target item, split). Set the
grades from the corpus alone. A **blind subagent** writes the question text from a one-line intent. It never sees names
(except exact-name slots), content or any generated text. At 60 questions this took about 30 minutes of agent time
end to end. At 320, about 3 hours, most of it designing slots and grading near-misses (same-name sets are the hard part).

## 4. Comparing engines vs changing what's embedded

**Only needs questions** (usable now to compare every engine, keyword engines included; no Metabase change):
undocumented items of every type, same-name across types, filters (after the contract/runner change), permissions,
non-English, values. Some will show semantic *losing* to keyword engines (document bodies are keyword-searchable but
not embedded). Others will show **every engine failing** (table-by-column: columns aren't indexed anywhere). Both are
the results we want to see. A cheap extra axis: rerun with `search_native_query=true` to measure keyword search over SQL
(the runner never sets it today).

**Needs an opt-in Metabase change to fix in the vector** (one setting value per type, off by default, like E's variant):

| Type | What to embed | Size of change | Source of text |
|---|---|---|---|
| Table | column display names (first N) | small: join fields in ingestion | metadata, no AI |
| Dashboard | names of its cards (first N) | small: join dashcards | metadata, no AI |
| Document | first paragraph of body | tiny: drop `:embedding-exclude` for a prefix | content, no AI |
| Segment / measure / metric | describe-query of the definition | small: Lib call at ingestion | Lib, no AI |
| Question / model (SQL) | description of the query | done (this study), or E's `context-sql` | rules or LLM |
| Collection | description + names of its items | medium: aggregation in ingestion | metadata |

Each is ~2–3 agent-hours of Clojure plus tests (H-style), plus ~1–2 hours of runs and write-up. Watch the per-batch
token budget for longer texts (items can be silently dropped, BOT-1742): compare `indexed_count` every run, as we did.

## 5. Phased plan

| Phase | What | Agent-hours | Run time | Adds to the dashboard |
|---|---|---|---|---|
| **0** | Tag every existing question with its target type. "Coverage" card: questions and top answers per type, per corpus | 2 | none | Makes the gap visible; honest labels on current numbers |
| **1** | apply.ts: field metadata, dashboard cards, real segment/measure definitions (items 1–3 above) | 4 | none | nothing yet (enables 2) |
| **2** | `northwind-coverage-v1`: undocumented items of all 8 main types, ~240 blind questions, frozen split. Runs: 3 engines × 2 embedders | 5 | ~20 min | **Per-type retrieval**: where semantic loses (expected: table-by-column, document-by-body, dashboard-by-card) |
| **3** | Cross-cutting sets: same-name, permissions, non-English (~60 questions); filters after a contract field plus runner support (A) | 4 (+2 A) | ~15 min | Ambiguity and filter correctness, permission leaks per type |
| **4** | Opt-in "embed the content" setting, one type at a time, in the order Phase 2 shows the biggest gaps. Rerun Phase 2 per type | 4–6 per type | ~10 min per type | Per-type before/after, like the text-strategy cards |
| **5** | Values (model indexes) and actions | 3 | ~10 min | Coverage of the remaining types |

**Total to "comprehensive measurement"** (phases 0–3): **about 15–17 agent-hours plus under an hour of runs.**
**Closing the gaps** (phase 4): **about 4–6 agent-hours per type**, so 20–30 for the five main types.

**Recommended first step: Phase 0, then Phases 1 and 2 together.** Phase 0 is cheap and relabels today's numbers honestly
("questions only"). Phase 2 is the first time we'd learn whether semantic search finds tables, dashboards and documents
at all, and it needs no Metabase change.

**Risks**: the corpus is still made up (blind questions help, but only real search logs would settle realism). Per-type n
of 30 gives ranges around ±0.13–0.15: fine for big failures, marginal for engine differences. Phase 2 may be dominated by
"not embedded" failures, which is useful, but it means Phase 4 decides most of the product value.
