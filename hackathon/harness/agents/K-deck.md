# Agent K: demo deck (reveal.js, slides as code)

Read `../START-HERE.md` first (the sync-with-F rule and worklogs apply to you too). Session: `metabase-sqlite-semantic-search-e3 [282a46]`.
Brief written by Agent F (overseer), 2026-09-23.

## Mission

Build Voytek's hackathon demo deck as code: **reveal.js with Markdown slides**. He knows reveal.js well.

**Very little on each slide.** The slides are Voytek's checklist of points, and something for the audience to look at while he
talks and improvises. Put a few words, one table or one diagram per slide, never paragraphs. Detail that helps him goes into
**speaker notes** (`Note:` in reveal's Markdown), not on the slide.

## Where and how

- Deck lives in `hackathon/deck/`: `index.html` (reveal.js, Markdown plugin, notes plugin), `slides.md` (all slides; `---`
  between slides, `--` for vertical ones), `assets/` for images or diagrams.
- Load reveal.js from a pinned CDN version (jsdelivr) or npm. Make sure it runs offline too if possible, since the network on this laptop is
  flaky: vendor the reveal.js dist into `hackathon/deck/vendor/` if you can do it without a build step.
- Serve with a one-liner (the Markdown plugin needs HTTP, e.g. `npx serve hackathon/deck` or `python3 -m http.server`) and document
  it at the top of `slides.md`. Check it renders, including speaker view (`s`).
- Diagrams: simple ones as Mermaid or inline SVG, or ASCII boxes if that's clearer. Keep them legible from the back of a room.

## Content (in this order; Voytek's outline)

1. **Intro.** SQLite (Libor's) was the starting idea; we went further (two new engines, an eval harness, what to embed).
2. **Research of alternatives.** Preliminary but interesting. One slide with a **table**. Sources: `hackathon/sqlite-semantic-search-brief.md` (moved from the
   worktree root) (section "Alternatives to the solution", engines and embedders) and Slack (search it; see "Slack" below).
   Mark it clearly as preliminary.
3. **SQLite (Libor) and Lucene (Paolo).** One slide each with the **basic architecture**: where vectors live, how it plugs into
   Metabase (both swap the store under the `semantic` engine), vector-only vs hybrid, exact vs approximate. Sources: `hackathon/harness/branches.md`
   (J's reviews), `native/vec1/PLAN_002_engine.md` on Libor's branch, and the lucene worktree at
   `/Users/krever/Projects/metabase/.claude/worktrees/lucene-paolo` (read only).
4. **Evals.** Voytek will show the live dashboard (http://localhost:3002/dashboard/12), so the slides only **frame** it: what we
   measured, how (the golden set, the SQL corpus, real Stats data, blind questions, held-out split), and 2–3 headline numbers as a
   hook. Take the numbers from the dashboard's Start-here verdict and `research/embedding-text-recommendation.md`, with run ids
   in the speaker notes. Check with F before quoting any number: some are still landing (lucene, stats-real).
5. **How we built the evals: the agent setup.** One slide listing the agents we ran, with a one-line role each (A runner … K deck; F
   overseer). Source: `START-HERE.md` roster and `00-plan.md`. Voytek will talk around it. A simple org-chart style diagram works well.
6. **Setup simplicity.** Two columns: **pgvector setup** vs **our new engine** (sqlite-vec1 and/or lucene), as step lists. Derive
   the pgvector steps from what we really did (`local/run-semantic-search.sh`, `local/README.md`: docker Postgres with the pgvector extension,
   `MB_PGVECTOR_DB_URL`, …), and the new engines' from their branches (sqlite-vec1: one env var plus a bundled native lib; lucene:
   an in-process library, index on local disk). Be accurate: count real steps; don't exaggerate.
7. **New features from Riley and Mike.**
   - **Riley:** there's a branch with a couple of features, shared in Slack. Find it (search Slack for Riley plus semantic
     search / hackathon; read the thread), list the features, and plan the **live demo**. The demo needs a **locally running
     Metabase on Riley's branch**, shown on (a) the corpus Riley used (there were Pokémon; find out whether it's a default
     dataset or Riley's own), (b) our **northwind** golden corpus, and (c) the **Stats** real-data corpus (B's `stats-real-v1`).
     See "Demo instance" below. Slides: one per feature, a title plus one line, then "→ demo".
   - **Mike** presents his own part (possibly the `hackathon-2026-sqlite-vec1-vibes` reranker branch). Add a placeholder
     slide and ask Mike's content from Voytek via F. Don't build it yourself.
8. **Conclusions / what's next.** 3–5 bullets, taken from the dashboard verdict and I's recommendation at the time of writing.

## Demo instance for Riley's features

- It's a separate throwaway Metabase, **not** the harness instances. Plan it with F, and with J (who owns the branch worktrees and
  fetching: `git fetch` over SSH fails here, so fetch over HTTPS with the gh credential helper, as J did) and A (ports, queue).
  Use a detached worktree of Riley's branch as a sibling in `.claude/worktrees/`, and a port outside 3021–3040/3041 (e.g. 3050).
- Data: loading northwind means B's corpus tools (`corpus-gen/apply.ts`) against the demo instance. Stats means restoring
  B's snapshot into **another new** database (never reuse `mb_stats_real`); ask B.
- **Stats data is company-internal.** Before any real Stats item names appear on a slide or on screen in the demo, check with
  Voytek via F that the audience is fine with it. Never paste real content into the deck files. The live demo shows it on screen only.
- Everything must survive a flaky network: prefetch dependencies (`clojure -P` in the worktree), and note that every Metabase
  boot needs the license token check (the pipeline retries it; your launcher should too).

## Slack

Use the Slack tools **read-only** (search and read threads). Never post, react or send drafts. Cite the channel and
thread in the speaker notes, and don't copy other people's text onto slides verbatim.

## Deliverables and done-when

1. `hackathon/deck/` runs with one command and shows every section above, with speaker notes.
2. A demo runbook `hackathon/deck/DEMO.md`: how to start the demo instance(s), the exact click path per feature, and the fallback
   (screenshots in `assets/`) if the network or instance fails on stage.
3. Voytek has done one click-through and signed off (via F).

## Rules

- Sync with F before each step: the outline, the research table, the demo instance plan, and any number you quote.
- Numbers only from verified sources (dashboard, recommendation, F), with run ids in the notes.
- Don't change harness code, Metabase source, or other agents' files. The deck is yours.
- Log in `worklogs/K-deck.md`.
