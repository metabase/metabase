# Funnel querying

How the funnel's query should work: which settings it supports, how one query finds each person's run through the steps, what we measured, and what's left for the querying team after the prototype.

It replaces `windowFunnel`, `funnel_chains` and the disqualifier pass in [`sql/analyses/funnel.ts`](../../../frontend/src/metabase/product-analytics/sql/analyses/funnel.ts).

## Settings

| Setting | Decision |
|---|---|
| Disqualifiers ("What disqualifies someone partway through the funnel?") | **Add, in the default ordering only.** It's in the HTML prototype and Figma, and PostHog and Mixpanel both have it. Pick an event, then optionally the steps it applies between. |
| "What counts as one attempt" | **Out.** One person or one visit is the Counting control (people or sessions). There's no account grain to count by. |
| "Allow retrying a step" (`funnel.allow_retry`) | **Drop the toggle, always on.** Every step-1 event starts a new attempt, and a person's best attempt counts. That's PostHog's default and Mixpanel's Optimized Re-entry. |
| "Counted from the last step they completed" (`funnel.anchor`) | **Remove.** The window always runs from the first step. See below. |
| "In any order" | **Respect the window, and label steps by count.** Today it ignores the window. |
| "In order, no other actions in between" | **Any other event interrupts, including a repeat of the step just done.** |

### Disqualifiers

- **Per attempt.** A disqualifier between steps a and b cuts that attempt off at the last step it reached before the disqualifier. The person's result is still their best attempt, so a later clean attempt counts. This is Mixpanel's behavior. Someone who should never count belongs in a population filter, which is also Mixpanel's advice. PostHog differs: it drops the person entirely when their furthest attempt is disqualified.
- **Bounds come from the attempt's own steps,** not each step's first time ever. Today's pass uses `minIf(ts, step_k)`. It also never disqualifies someone who didn't reach the later step, because `minIf` returns `1970-01-01` for them.
- **Same timestamp:** a disqualifier sorts before a step. So one at the same moment as step a doesn't count, and one at the same moment as step b does. This matches PostHog.
- **Hidden in strict order and in any order:**
  - In strict order, every other event already interrupts, so disqualifiers would do nothing.
  - In any order, "between steps" doesn't mean anything. PostHog only allows disqualifiers over the whole funnel there and shows an error otherwise, which is confusing.
  - For both, the alternative is a population filter, which is Mixpanel's advice too. That needs filters like "has never done this event" and "has done this event more than twice", which we don't offer yet.
- A disqualifier can't be one of the steps it applies between. PostHog validates the same thing.

### Why "counted from the last step" goes

- **The current version is wrong.** It runs `windowFunnel` once per pair of adjacent steps, independently:
  - It ignores strict ordering: A, X, B, C reaches 3 instead of 1.
  - It counts hops done out of order: B, C on day 1 and then A, B on day 10 reaches 3.
- **Nobody else offers it.** PostHog's window always runs from step 1. Its "Relative to previous step" only changes the denominator of the conversion rate. Mixpanel's window starts at step 1 too; Optimized Re-entry changes *which* step 1, not where each window starts.
- **It could come back later.** Each row would also need "latest step-k event before this row" (a running max), and the window check would move into the `MIN` conditions below. That's untested.

### "In any order" and the window

A person's level is how many of the steps they did within one window, whichever steps they were. This is PostHog's definition.

The step chart can't keep the step names. The bar for 2 steps includes someone who did A and C but never B, so labeling it "B" would be wrong. Label the bars "Completed 1 step", "Completed 2 steps" and so on, and don't show step names on the bars:
- **PostHog** uses that wording, but its vertical chart's legend still shows each step's event next to it ([`StepLegend.tsx`](https://github.com/PostHog/posthog/blob/master/products/product_analytics/frontend/insights/funnels/FunnelStepsBarChart/StepLegend.tsx) has no case for unordered funnels), which reads as "B: completed 2 steps".
- **Mixpanel** shows only "Step 1", "Step 2" and so on.

The steps themselves can still be listed in the setup panel, just not on the bars.

Today's chart counts each step on its own (did A, did B, did C) and ignores the window. That isn't a funnel, so it goes.

We considered a different definition: how many *leading* steps 1..k they did, in any order. That would keep the step names accurate. But it makes step 1 special, which contradicts "in any order".

## The query

### One query for everything

Every funnel view needs each person's run through the steps, not only how far they got:

- **Step by step:** the median time from the previous step.
- **Over time:** when the run started.
- **How long it took:** the run's duration.
- **Drill-through:** the same start time, and how far the run got.
- **The funnel's Paths:** which events made the run.

So one query finds the run, and both levels and times come from it. It replaces `windowFunnel` plus `funnel_chains`, which today run side by side and can disagree. That disagreement is why `length(chain_times) >= n` guards exist.

**The run counted:** the one that got furthest, then the one with the earliest start, as `funnel_chains` picked.
- **Why not the latest start,** which is what `windowFunnel`, PostHog and Mixpanel time from? Someone who keeps starting and never gets further would then sit in the period of their last start. That drains the people who didn't convert out of early periods in "Over time".
- **On the dev data it was large.** "Started trial" went from 21% to 5% over 90 days, against a flat 10–12% from the earliest start.
- **The last period is still low either way,** because its people haven't had a whole window yet.

**Rows and their order:**
- **Rows:** the step events, plus disqualifier events. Strict order needs every event in scope.
- **Order:** `rn = row_number() OVER (PARTITION BY actor ORDER BY ts, <step order>)`. At the same timestamp, disqualifiers sort before steps, and in strict order other events sort after steps.
  - The order has to be total. Sorting by `(ts, flags)` instead puts step 3 before step 1 at the same timestamp. That alone gave 134 of 20k actors a different level from `windowFunnel` on data with hour-resolution timestamps.
- **Strictly after:** each step is looked up strictly after the previous one. So one event fills at most one step, even when two steps' segments overlap. `windowFunnel` lets one event fill several steps, unless you use `strict_once`, which is expensive.

### In order, other actions allowed (the default)

The greedy run from a step-1 row r takes the first step-2 row after r, then the first step-3 row after that, and so on. The window doesn't change which rows the run takes; it only decides how far the run counts.

Build the run from the last step backwards, without joins. Let `c[j][k](r)` be when the run reaches step k if it starts looking for step j right after row r. Starting later can never reach a step earlier, so "the run from the first step-j row after r" is the column-wise `MIN` over all step-j rows after r:

```
AFTER = OVER (PARTITION BY actor ORDER BY rn DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)

stage n:              c[n][n] = MIN(CASE WHEN step_n THEN ts END) AFTER
stage j (n-1 .. 2):   c[j][j] = MIN(CASE WHEN step_j THEN ts END) AFTER
                      c[j][k] = MIN(CASE WHEN step_j THEN c[j+1][k] END) AFTER     -- k = j+1 .. n
runs:   each step-1 row r: t_1 = r.ts, t_k = c[2][k](r)
level:  the largest k with t_k NOT NULL AND t_k - t_1 <= window
person: highest level, then latest t_1
```

Each stage is a CTE over the previous one. This uses only `row_number`, `MIN() OVER` with a ROWS frame, and `CASE`.

**Disqualifiers** add one value per hop. That value is the next disqualifier for hop k after the row where the run did step k−1. It is carried through the same `MIN`s, because it also never decreases as the row moves later. Hop k fails if that disqualifier comes before `t_k`, and the run's level stops at k−1. That's one pass with no range join, but it's untested.

### In order, no other actions in between (strict)

```
rows:    every event in scope, ordered as above
runs:    each step-1 row r reaches step k if the next k-1 rows are steps 2 .. k, in order
         (lead(step_j, j-1) for j = 2 .. k) and lead(ts, k-1) - r.ts <= window
person:  highest level, then latest start
```

This is one stage of `lead` calls, with no `MIN` stages. It reads every event, not only the step events.

- **Any other event interrupts, and so does a repeat of the step just done.**
  - A, B, B, C reaches 2.
  - A later step 1 starts a new attempt, so A, A, B, C and A, X, A, B, C both reach 3.
- **PostHog and `windowFunnel` treat repeats differently.** They let a repeat of the step just done slide, so A, B, B, C reaches 3 in both. PostHog clears every attempt except the one at the step the event matches ([`steps.rs`](https://github.com/PostHog/posthog/blob/master/funnel-udf/src/steps.rs)).
  - Letting repeats slide would mean first collapsing consecutive repeats into one row (gaps and islands: `lag`, a running sum and a `GROUP BY`). That's two more stages.
  - We chose the simpler rule. It also matches the label, "no other actions in between", more literally.
- **`windowFunnel` can't start over.** Its `strict_order` stops at the first interruption, so A, X, A, B, C gives 1. Adding `allow_reentry` doesn't help. It only skips step events that arrive out of place, which turns A, C, B, C into 3 and breaks "no other actions in between".
- **Untested.**

### In any order

```
from(r, k) = MIN(CASE WHEN step_k THEN ts END) over rows from r on      -- growing frame, including r
level(r)   = how many steps k have from(r, k) - r.ts <= window
person:    highest level, then latest r
duration:  for people who did every step, max(from(r, 1..n)) - r.ts
```

Windows only need to start at a step event, because the best window can always slide to start at its first event. This is one stage with n columns.

### Open decision: `windowFunnel` for step by step

Dropping the median-time tooltip would let step by step use `windowFunnel` alone. That's 10–25× faster on ClickHouse at the heavy tail; see the next section.

- **It only covers** the step-by-step view in the default ordering, with no disqualifiers. Every other view needs the run.
- **It's a second code path** whose counts have to match the run query's.
- **In strict order the counts wouldn't match,** because `windowFunnel` doesn't start over after an interruption.

## Measured

These are from ClickHouse 26.8 in Docker on a laptop, single runs, so treat them as rough. The heavy rows are one bot whose events are 70% step 1.

[`bench-funnel.ts`](../bench-funnel.ts) reproduces the three right-hand columns. It first checks that both window versions agree with `windowFunnel`. The `funnel_chains` and `arrayFold` columns were one-off measurements.

| Data | `windowFunnel` | `funnel_chains` today | `arrayFold`, one pass | Window + joins | **Window, no joins** |
|---|---|---|---|---|---|
| 1.2M events, 20k people, 3 steps | 15 ms | 76 ms | 94 ms | 111 ms, 492 MiB | 46 ms, 157 MiB |
| same, 10 steps | 14 ms | | | 372 ms, 2.0 GiB | 185 ms, 749 MiB |
| One bot, ~10k step-1 events | 1 ms | 3.9 s, 2.5 GiB | 140 ms, 105 MiB | 8 ms | 3 ms |
| One bot, ~300k step-1 events | 5 ms | out of memory | 4.6 s, 3.2 GiB | 73 ms, 185 MiB | 41 ms, 73 MiB |
| One bot, ~3M step-1 events | 82 ms, 85 MiB | out of memory | ~30 GiB (not run) | 515 ms, 1.6 GiB | 267 ms, 517 MiB |
| same, 10 steps | 85 ms, 67 MiB | | | 2.5 s, 6.7 GiB | 2.2 s, 2.7 GiB |

Both window versions agree with `windowFunnel` on every person's level, at 3, 5 and 10 steps, including data with many same-second ties.

The version without joins costs about O(steps × Σ Eₐ log Eₐ + steps² × E):
- ClickHouse sorts again at each of its stages.
- The steps² running-minimum columns dominate by 10 steps. Fitting the 4.3M-event bot gives roughly 46·steps + 17·steps² ms.
- Dropping columns between stages changed nothing, because ClickHouse already prunes unused columns.

## ClickHouse findings

- **`windowFunnel`** keeps one slot per step, holding the latest step-1 time that reached it, in one pass, storing a timestamp and a step number per step event. It returns only a level, never which events made the run. Other details:
  - `strict_order` stops at the first non-step row and doesn't restart.
  - `allow_reentry` only works with `strict_order` and needs 25.12 or later.
  - The timestamp can't be `DateTime64`.
  - The limit is 32 steps.
- **`arrayFold`** splits its arrays into one column per array position, to work across many rows at once. So one long array costs about 8 KB per element: a trivial fold over 387k elements used 3 GiB. It's fine for many short arrays and wrong for per-person event arrays.
- **Window frame direction:** write "every row after this one" as a growing frame (`ORDER BY rn DESC … UNBOUNDED PRECEDING AND 1 PRECEDING`). The equivalent shrinking frame (`1 FOLLOWING AND UNBOUNDED FOLLOWING`) is recomputed for every row:
  - 27 s vs 76 ms at ~300k step-1 events.
  - Over 120 s vs 0.6 s at ~3M.
- **CTEs are inlined:** every reference recomputes them. The join version sorts 2n−1 times at n steps, because each join re-runs the window CTE.
- **`LEFT JOIN`** fills missing rows with default values, not NULL, unless `join_use_nulls = 1`. A missing next step became `0`, and the level check passed for 343 of 20k people.
- **`sequenceMatch`** with `(?t<=N)` between steps gives windows measured from each previous step. But it returns only 0 or 1, and it throws `TOO_SLOW` for the whole query after 1M iterations.

## After the prototype

These are for the querying team.

- **Join or no join, per engine.** The numbers above are ClickHouse only, where the version without joins wins. On an engine that computes a CTE once and distributes joins (Snowflake, BigQuery), the join version sorts once and might win. Measure there before choosing. Footguns:
  - Without joins: steps² columns and one sort per stage.
  - With joins: CTEs recomputed per reference, hash joins holding every step row in memory, and default values instead of NULL.
  - Both: the frame direction.
- **What each warehouse has to build on:**

  | Warehouse | Funnel building blocks |
  |---|---|
  | ClickHouse | `windowFunnel`, `sequenceMatch`, `arrayFold` |
  | Snowflake, Oracle, Trino/Athena | `MATCH_RECOGNIZE`, which matches the steps and returns their rows and times. Snowflake also has `REDUCE`. |
  | Databricks, DuckDB | Array folds (`aggregate`, `list_reduce`) |
  | BigQuery, Postgres, Redshift, MySQL | Window functions and joins only |

- **Database-specific fast paths, or one portable query.**
  - `windowFunnel` is much faster, but it can't give the run's times, start over after a strict interruption, or keep one event to one step.
  - `arrayFold` has the memory cost above.
  - Functions defined inside the query vary by database:
    - BigQuery allows temporary JS UDFs. They are scalar, so each person's events go in as an array, with the same heavy-tail problem.
    - ClickHouse's executable UDFs need a binary and config on every server. That's how PostHog runs its Rust funnel function (`funnel-udf/` in PostHog), and it isn't possible on a customer's database. WASM UDFs are experimental.
  - Every fast path is another implementation that has to agree with the others. Same-second ties and join defaults each caused disagreements while we were testing this.
- **MBQL** needs window functions with ROWS frames. Stages map naturally onto MBQL stages, which may favor the version without joins.
- **Heavy tails.** Benchmark against a few people with millions of events, not only typical volumes. Consider leaving out or capping extreme actors.

## Work for the prototype

1. Replace `funnel_levels`, `funnel_chains` and `funnel_timed` with the run query in the default ordering, using the tie-break above. Remove the `length(chain_times) >= n` guards.
2. Strict order with `lead`.
3. "In any order" with the window, and bars labeled "Completed n steps" without step names.
4. A disqualifier setting that `toSpec` turns into `exclusions`, computed inside the run query. Remove `funnel_kept` and its warning, and hide the setting in strict order and in any order.
5. Remove `funnel.anchor` and `funnel.allow_retry`: their settings, the spec fields, and their warnings. Saved analyses don't need to keep working.
6. Add the cases from this investigation to the unit tests or fixture checks:
   - hops done out of order;
   - strict start-over (A, X, A, B, C) and a repeat in strict order (A, B, B, C);
   - same-second ties;
   - a disqualifier before or after the later step, and one where the later step was never reached;
   - "any order" outside the window, and A and C counting as 2 steps;
   - one event matching two steps.
