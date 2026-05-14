# "The Sit-Down" — Slides feature demo with Don Pacino

**Date:** 2026-05-14
**Branch:** `feat/metabase-slides`
**Demo name:** `cigar-quarterly`
**Type:** Feature demo (uses the `feature-demo` skill at `~/work/internal-skills/metabase-feature-demo/`)

## Premise

A demo of the new Metabase Slides feature, narrated and "presented" by Al Pacino playing an unnamed cigar-importer Don. The Don opens Metabase at the head of a long table and walks his capos through Q4. Slides are real, generated live by the feature from a pre-built dashboard. The interactive drill-through mid-deck is both the dramatic beat (a capo gets called out) and the product proof point (Metabase slides are interactive, not static).

The endorsement is bookended: a cold open and a closing both addressed directly to the viewer. The Don pitches Metabase deadpan, like he'd pitch any legitimate business. The deadpan is the joke.

## Why this demo

- Shows the Slides feature generating a deck from a real dashboard with real data — not slideware.
- Proves the "interactive" claim with a live drill-through on a slide.
- Memorable framing — easier to share than a feature tour.
- Lets the Slides product itself look polished and corporate; the comedy is entirely in the narration.

## Out of scope

- No changes to the Slides feature code. This is a demo of code that already exists on `feat/metabase-slides`.
- No before/after pairing (that's the `playwright-demo` skill).
- No CI integration.

---

## Story shape

### Bookend structure

```
Beat 0  Cold open    → camera   "In my line of work, you need to know your numbers."
Beats 1-5  The sit-down → in-character with the crew
Beat 6  Closing      → camera   "Metabase. Tell 'em the Don sent you."
```

Beats 0 and 6 are voiceover over screen content (no Pacino on screen — we only have his voice). Visual for the cold open is a slow approach to the Metabase home screen / the cigar dashboard tile. Visual for the closing is the final slide held on screen.

### Beats and narration

All narration is in the **Godfather-Michael register**: cold, controlled, short sentences. *Not* Tony Montana. Cues stay ≤15 words for tight pacing.

| # | On-screen action | Narration |
|---|------------------|-----------|
| 0 | Cold open — Metabase home, hover the "Q4 Board Review" dashboard | "In my line of work, you need to know your numbers. This? This is Metabase. Beautiful." |
| 1 | Open dashboard "FY26 Q4 Board Review" → click "Generate slides" → presenter opens | "Sit down. We're gonna look at the numbers." |
| 2 | Slide 2 — Monthly revenue, FY26 vs. FY25 | "Up thirty-four percent. It was a good quarter. For most of us." |
| 3 | Slide 3 — Top 5 SKUs by Q4 revenue | "Cohibas are moving. The Behikes especially. Keep them stocked." |
| 4 | Slide 4 — Regional revenue stacked by distributor → **click NJ bar → drill-through** → result shows Big Sal at 82% | "Now. New Jersey." *(beat)* "Eighty-two percent. One name." *(drill resolves)* "Sal. We need to talk." |
| 5 | Slide 5 — FY27 projected revenue, Sicily as new entrant | "Next year, we go to Sicily. Family business." |
| 6 | Closing — hold on final slide | "This is how a family stays on top. Metabase. Tell 'em the Don sent you." |

Beat 4 is the only beat with both a click *and* a chart-state change. Every other beat is page-state or slide-advance.

---

## Voice and presenter

### Voice clone

- New voice registered as `pacino` via the feature-demo voice registry, cloned through MiniMax.
- Reference clip: 8–20s of clean *Godfather II* Michael Corleone dialogue. Mono, 22kHz. **One register only** — mixing Michael with Tony Montana ruins the clone.
- Suggested clip source: a *Godfather II* scene with one continuous Michael monologue (no music underneath, no other voices).
- Registration command (from the feature-demo skill):
  ```
  node ~/work/internal-skills/metabase-feature-demo/references/voice-registry.mjs register pacino ~/tmp/pacino-ref.wav
  ```

### Presenter persona

Registered alongside the voice:

```
name:     pacino
voice:    pacino
role:     Don, Corleone Cigars Imports
audience: his capos (in-character) AND the viewer (for bookend beats)
style:    first-person; Godfather-Michael register — cold, controlled,
          short sentences, no profanity, no Tony Montana shouting;
          cues ≤15 words for tight pacing; deadpan when addressing camera
```

---

## Data source

A fresh Postgres database called `corleone_cigars`, attached to Metabase as a new connection. Living in its own DB is deliberate — the data-picker entry "Corleone Cigars Imports" sells the bit before any slide loads.

### Tables

#### `shipments` — ~2,400 rows, trailing 4 quarters

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `ship_date` | date | Spans 4 trailing quarters relative to a fixed anchor date (2026-05-14). Anchor is hardcoded in the seeding script so the data is stable across reseeds. |
| `sku_id` | int FK → skus.id | |
| `distributor_id` | int FK → distributors.id | |
| `region` | text | Denormalized from distributor for fast group-bys |
| `units` | int | Cigars per shipment |
| `revenue_usd` | numeric(10,2) | |

#### `skus` — 12 rows

| name | origin | box_price_usd |
|---|---|---|
| Cohiba Behike 56 | Cuba | 1200.00 |
| Cohiba Robusto | Cuba | 480.00 |
| Montecristo No. 2 | Cuba | 360.00 |
| Romeo y Julieta Churchill | Cuba | 320.00 |
| Padrón 1964 Anniversary | Nicaragua | 580.00 |
| Arturo Fuente Opus X | Dom. Rep. | 720.00 |
| Davidoff Winston Churchill | Dom. Rep. | 540.00 |
| Partagás Lusitania | Cuba | 410.00 |
| Hoyo de Monterrey Epicure | Cuba | 290.00 |
| Trinidad Fundadores | Cuba | 460.00 |
| Bolívar Belicosos Finos | Cuba | 280.00 |
| Family Reserve | "House blend" | 950.00 |

"Family Reserve" is the only lean-in — just a name, no joke columns. Plays as a premium house line.

#### `distributors` — 8 capos

| name | nickname | region | joined_at |
|---|---|---|---|
| Salvatore Bonanno | "Big Sal" | NJ | 2014-03 |
| Vincenzo Pugliesi | "Two Times" | NY | 2009-06 |
| Francesco DeLuca | "Knuckles" | Chicago | 2011-11 |
| Antonio Marino | "Cigars" | Miami | 2016-02 |
| Paolo Greco | "The Books" | Boston | 2013-08 |
| Giuseppe Russo | "Half-Stack" | Vegas | 2018-04 |
| Carmine Esposito | "The Mouth" | Philly | 2010-09 |
| Rocco Mancuso | "Two Phones" | Long Island | 2015-12 |

### Critical data constraint

Big Sal must account for **~82%** of NJ Q4 revenue in the actual data. The drill-through reads live numbers — if we fake it via card config, the drill exposes the truth and the joke dies. The seeding script must produce this concentration naturally (weight Big Sal's NJ shipments heavily; give other regions a more even split across their distributors).

---

## Dashboard and cards

The Slides feature generates decks from dashboards as context (commit `76a18a32f18`). We pre-build one dashboard, and the AI generation produces the 5-slide deck from it.

### Dashboard: `FY26 Q4 Board Review`

Four cards, top to bottom. The Slides AI is expected to produce a **5-slide deck** from this dashboard: one title slide plus one slide per card, in the order below. If the AI's actual output differs in count or order, the storyboard cues stay anchored to the *cards* — we edit the generated deck post-hoc rather than rerun generation.

1. **Monthly revenue, FY26 vs. FY25**
   - Type: line chart, dual-series
   - X: month; Y: sum(revenue_usd); breakout: fiscal year
   - Story shape: clean up-and-to-the-right with a visible Q4 spike

2. **Top 5 SKUs by Q4 revenue**
   - Type: horizontal bar
   - X: sum(revenue_usd); Y: sku name; filter to current Q4
   - Cohibas land on top

3. **Q4 revenue by region, stacked by distributor** ← drill target
   - Type: stacked bar
   - X: region; Y: sum(revenue_usd); stack: distributor
   - NJ visibly tallest; Big Sal segment dominates inside it
   - Click-through configured to filter by distributor

4. **FY27 projected revenue by region, incl. Sicily**
   - Type: vertical bar
   - X: region (existing 8 + Sicily); Y: projected revenue
   - Projection logic: simple linear from FY26 + a manual Sicily entry. Doesn't need to be statistical — just visually closing.

---

## Demo workflow

### Workspace

Per the feature-demo skill, all artifacts live under `tmp/demos/cigar-quarterly/`. Every command exports `DEMO_NAME=cigar-quarterly` — this is non-negotiable to avoid clobbering other demos' shared globals (see user memory `feedback_feature_demo_shared_paths`).

### Phases (per feature-demo skill)

1. **Discover** — already done in this spec.
2. **Storyboard** — write `storyboard.md` and `cues.json` matching the beats table above; pause for user review.
3. **Precheck** — each cue's `precondition` hits a Metabase API endpoint and confirms the expected data exists (dashboard present, NJ-Q4 chart non-empty, Big Sal segment ≥ 80%, etc.).
4. **TTS** — synthesize 7 cues via MiniMax against the `pacino` clone; durations written back into `cues.json`.
5. **Record** — Playwright script `tmp/demos/cigar-quarterly/repro.mjs`:
   - Logs in as `crowberto@metabase.com / blackjet`
   - Beat 0: navigates to home, hovers the "Q4 Board Review" dashboard tile
   - Beat 1: opens the dashboard, clicks "Generate slides", waits for presenter
   - Beats 2–3: advances slides
   - Beat 4: advances to slide 4, clicks the NJ bar segment, waits for drill-through response, dwells while the filtered chart resolves
   - Beat 5: advances to slide 5
   - Beat 6: holds on the final slide for the closing voiceover
6. **Stitch + mux** — produces `tmp/demos/cigar-quarterly/video.mp4`.

### Locator stability

Beat 4's drill click is the highest-risk locator. Anchor on a stable label like `getByRole("graphics-symbol", { name: /^NJ$/ })` or a data-testid on the bar segment, NOT on a text match that includes the revenue number (those change between runs).

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Voice clone sounds off-register (Tony instead of Michael) | Source a single uninterrupted Michael monologue. If the clone still drifts, re-register with a different clip — don't try to fix it in narration. |
| Big Sal's NJ concentration drifts away from ~82% during seeding | Seed deterministically with a fixed RNG seed; include a precheck cue that asserts `82% ± 3%`. Reseed if it fails. |
| Drill-through changes the chart shape so much the slide looks broken | Choose a drill that filters in-place rather than navigating away. Verify visually before TTS. |
| Slides AI generation produces unexpected slide order or wording | Either accept the generation as-is and rewrite cues to match, or pin the slide content by editing after generation. Don't rerun generation hoping for a better result. |
| Endorsement reads as cringe rather than deadpan | Keep cue 0 and cue 6 short. No "amazing product" superlatives — just "Beautiful" and "Tell 'em the Don sent you." Let voice carry it. |

---

## Open items

- **Pacino reference clip URL/file** — not yet sourced. We need 8–20s of clean *Godfather II* Michael dialogue before TTS phase 4.
- **Seeding script implementation** — the design doesn't specify *how* the 2,400 rows are generated (Python, Clojure, raw SQL fixture). Decide during writing-plans.
- **Dashboard authoring** — decide whether to build it manually through the UI and snapshot it, or scaffold it via the API. Affects reproducibility.

These are intentionally deferred to the implementation plan.
