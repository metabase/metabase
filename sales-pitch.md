# Nested modules: less config, smaller APIs, fewer cycles

## The pitch in one sentence
> Nest `lib.schema` under `lib` and `lib`'s public API drops from **30 namespaces to 8** — with zero code changes, just config.

## The problem
Our modules config is flat. Every Metabase namespace maps to its first segment after `metabase.`, giving us **177 top-level modules**, **1,433 dependency edges**, **30 `:friends` entries**, and a growing collection of workarounds that exist only to keep the graph acyclic.

The pain is concentrated and visible:

- **API surfaces are bloated by sub-packages that have no way to be first-class.** `lib` exposes 30 API namespaces; **22 are `metabase.lib.schema.*`**. `driver` exposes 24, with whole subtrees (`driver.sql.*`, `driver.sql-jdbc.*`) forced into the top-level contract. `query-processor` exposes 24. `channel` has 11, with a config comment literally reading *"way too many API namespaces"*.
- **`-rest` modules are nesting cosplay.** We have **12 of them**, all existing purely to separate HTTP concerns from core logic and break cycles. They're backed by ~40 lines of dedicated special-case logic in `.clj-kondo/src/hooks/common/modules.clj:78-116` (the `rest-module?`/`routes-module?`/`core-module?` predicates and their custom error message).
- **`:friends` is mostly "let my nearby relative peek inside me".** `lib`'s friends include `lib-be` — a naming-sibling. `query-processor`'s 6 friends (our worst offender) include `enterprise/sandbox`, `enterprise/cache`, `transforms-base` — all things that could plausibly live *inside* qp's subtree if we had one.
- **The config itself is asking for this.** Lines 229, 438, and 1394 of `config.edn` all carry TODOs along the lines of *"too many API namespaces, consolidate"*.

## The proposal

Teach the modules system about **nested sub-modules** — e.g. `util.db` as a child of `util`, `lib.schema` as a child of `lib` — with three primitives:

### 1. Nesting with `:open` as the visibility knob
Every module is encapsulating by default. A parent uses `:open` to expose children:

- **`:open false` (default)** — children are private; siblings see each other only via each other's `:api`. Strict encapsulation.
- **`:open :siblings`** — children are still private from outside the subtree, but siblings see each other's internals freely. A "private subsystem with internal trust" — designed for tightly-coupled clusters like `metabot`/`mcp`/`slackbot`/`agent-api`, the `-rest` pairs, and the `query-processor` middleware/streaming/cache cluster.
- **`:open true`** — children are exposed externally as if top-level. Pure organizational grouping; no semantic change from today's flat world.

The conceptual root is `:open false`, which reproduces today's flat semantics exactly — making current behavior a special case of the nested world rather than a separate model.

**Invariant:** a nested module is never visible to the outside world as more than its top encapsulating ancestor.

### 2. `:extends` for enterprise/OSS coupling
EE modules augment OSS modules with one-way read access. Rather than overloading `:friends` (which is declared on the *friended* side, backwards from the actual knowledge), `:extends` is declared on the extender:

```clojure
enterprise/sandbox
{:extends #{lib query-processor}
 ...}
```

- Grants read access to the target's internals.
- Target gains nothing and need not know the extender exists — OSS stays blind to EE by construction.
- Multi-target: the data shows real EE modules extend multiple unrelated OSS modules (`enterprise/sandbox` reaches into both `lib` and `query-processor`).
- Lint invariant: if `A :extends B`, `B` may not depend on `A` (no cycles via extension).

### 3. `:friends` remains as the rare escape hatch
Expected final count: 2–5 entries, each with an explanatory comment. Not removed from the toolbox, just demoted from routine use to genuine exception.

## What we get back

### The flagship win: `lib`
- **30 → ~8 API namespaces** (≈73% cut on arguably the most central module in the codebase)
- `lib.schema` becomes a child, absorbing the 22 `metabase.lib.schema.*` entries
- `lib-be`, `source-swap`, and `legacy-mbql` become siblings under a `lib` subsystem parent, killing 3 of `lib`'s 5 `:friends` structurally
- Zero code changes — this is a config-only refactor
- The **4 distinct public faces** outside modules currently have to reason about (`lib`, `lib-be`, `legacy-mbql`, `source-swap`) collapse to **1**, for 97 inbound edges

### The cycle-breaker win: `query-processor`
- Worst friends offender (6 friends). `qp.streaming`, `qp.middleware`, `qp.cache` become children
- `warehouse-schema`, `parameters`, `transforms-base` join as siblings in a qp subsystem
- Plausible to cut 4–5 of 6 friends and roughly halve the external API
- 68 inbound edges collapse from 4 public faces to 1

### The deletion win: `-rest`
- 12 `-rest` modules become `.rest` children under `:open :siblings` parents
- The entire `rest-module?`/`routes-module?` machinery in `hooks.common.modules:78-116` gets deleted
- A rare refactor that lets us *remove* enforcement code rather than add it

### The metabot subsystem win
- `metabot`, `mcp`, `slackbot`, `agent-api` become children of an `agent` parent with `:open :siblings`
- 4 modules collapsing to one external face cleans up a cluster of cross-module edges and `:friends` entries that clearly never should have been top-level peers

### The EE/OSS cleanup
- 10 EE→OSS `:friends` entries → **7 `:extends` declarations** (two EE modules each fold two friendships into one multi-target declaration)
- The primitive finally matches the shape of the actual coupling

## The aggregate

| Metric | Today | After | Change |
|---|---|---|---|
| Top-level modules | 177 | ~153 | **~14% ↓** |
| `:friends` entries | 30 | ~10 | **~65% ↓** |
| EE→OSS `:friends` | 10 | 0 (→7 `:extends`) | primitive replaced |
| `lib` public `:api` | 30 | ~8 | **~73% ↓** |
| `lib` distinct public-face count | 4 | 1 | **75% ↓** |
| `-rest` kondo special-case LoC | ~40 | 0 | **100% ↓** |

**A note on edges:** of 1,433 total `:uses` edges, only ~28 get absorbed into subtrees under the proposed nestings. Raw edge count is *not* the headline metric — and that's fine. The real complexity reduction is in **number of public faces** a random outside module has to reason about. The 97 inbound edges to the lib subtree currently target 4 distinct public faces; after nesting they target 1. That's the correct framing: *not "fewer edges" but "fewer things to know about."*

## Why this is low-risk

- **Grouping-only is a no-op.** We can introduce nested declarations with `:open true` across the whole config as a pure refactor, with zero lint behavior change, validated via the existing staleness test at `test/metabase/core/modules_test.clj:141`.
- **Encapsulation is opt-in per subtree.** Prove the model on `lib.schema` first, measure, then expand.
- **`:uses` is per-child, not inherited.** No reach can silently expand when a parent grows.
- **`:friends` still exists** as the escape hatch for genuinely cross-subtree cases — we're not removing a tool, we're making it rarely necessary.
- **The conceptual root is `:open false`.** Current flat semantics are the special case where the root stays closed — no new rules for existing modules.

## Why this is worth doing now

Every new module compounds the current flatness. Every new `-rest` split teaches us to reach for the wrong pattern. Every EE module that should extend OSS reaches for `:friends` because that's the only tool in the box. The longer we wait, the more the config ossifies around workarounds and the more code has to move to unwind them.

Nested modules let us *stop creating new top-level entries* immediately, give us a primitive named for what it actually does in the EE/OSS case, and — as the `lib.schema` demo will show — let us shrink the public API of our most central module by ~73% with no code changes at all.

## Rollout plan

1. **Add nesting support with `:open true` as a no-op refactor primitive.** Extend `.clj-kondo/src/hooks/common/modules.clj:15-32` to longest-prefix-match into nested config. All existing top-level modules remain top-level. Staleness test should continue to pass.
2. **Add `:open :siblings` mode.** Main new knob; updates `dev/src/dev/deps_graph.clj` and the kondo hook's visibility logic.
3. **Land the `lib.schema` demo.** One nesting, one `:open` flip, the headline 30→8 number proven. This is the advertisement that sells the rest.
4. **Convert `-rest` pairs to children with `:open :siblings` parents.** Delete the `rest-module?`/`routes-module?`/`core-module?` special-case code.
5. **Add `:extends` (multi-target, extender-declared).** Replace the 10 EE→OSS `:friends` entries with 7 `:extends` declarations.
6. **Introduce the metabot and qp subsystems as `:open :siblings` parents.**
7. **Investigate remaining `:friends` entries one by one.** Whatever doesn't fit stays, with an explanatory comment. Expected final count: 2–5.
