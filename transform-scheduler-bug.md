# Bigger problem in transform scheduler

We fixed routing on transforms (#71931). But there's a bigger problem under it.

**One bad transform = whole transform scheduler dies.** Every scheduled job, every cron tick, indefinitely. Until someone manually finds and deletes the bad transform.

User sees:
- Failure email naming a transform they never scheduled
- Their other scheduled transforms quietly stop running

Both symptoms come from the same crash.

## Why

When any scheduled job fires, the planner loads **every transform in the system**. Calls the dep extractor on each one. For query transforms, that runs `qp.preprocess` on the query. If preprocess throws on **any** transform, the whole planner crashes. The misleading email naming the wrong transform comes from the catch path in `ordering.clj` that wraps the throwable with `::transform-failure` ex-data containing the transform that crashed the extractor — `run-job!` then reads that ex-data and emails about whichever transform happened to trip the scan, regardless of which job actually fired. Exception re-throws to cron. Next tick of any other job → same scan → same crash. Nothing runs.

The reason it scans everything isn't efficiency. The original implementation chose to compute the graph eagerly so the dep walker could do simple hashmap lookups instead of calling the extractor on the fly — a code-simplicity choice. The cost only became a problem once `qp.preprocess` became expensive and started having middlewares (like routing) that throw.

Routing is the confirmed repro. But ANY preprocess failure does the same thing — deleted columns, deleted tables, malformed queries from migrations, etc. So #71931 doesn't fully fix this. Existing instances can still have zombie transforms from before that PR. Non-routing failure modes affect OSS self-hosted instances too.

(Heads up: this is the scheduler's internal dep graph, **not** the EE `:dependencies` feature. Same name, different code path. No premium gate. Python transforms aren't affected — their extractor doesn't touch the query processor.)

## Two ways to fix

### Option 1 — Band-aid

Wrap the per-transform dep extraction call in try/catch. If it throws, log and treat as no deps. ~5 lines.

**Pros:**
- Tiny diff. Low review risk.
- Fixes both user-visible symptoms (no crash, no spurious email).
- If the bad transform IS scheduled, it fails cleanly at execution time via the existing per-transform error path.
- Defensive against future preprocess failure modes.

**Cons:**
- Planner still scans every transform on every cron tick. Wasteful.
- Doesn't fix the architectural issue. Still does global work for a per-job question.
- Silently swallows real errors. If a tagged transform has a legit dep extraction bug, the warn log is the only signal.

### Option 2 — Real fix

Walk the dep graph starting from the tagged transforms. Only call the dep extractor on transforms in the closure. Anything not reachable is never touched.

**Pros:**
- Fixes the architectural issue. No more global work for per-job questions.
- Performance scales with closure size, not system size. 1000-transform instance running a 3-transform job analyzes 3 transforms instead of 1000.
- Bad transforms outside any closure literally cannot affect the planner.

**Cons:**
- Bigger diff. Touches `transform-ordering`, several call sites, tests. Higher review burden.
- Public function signature change (or backwards-compat overload).
- Still needs the Option 1 try/catch as defense in depth for closure members that fail extraction.

### Recommendation

Ship Option 1 now to stop the bleeding. Option 2 as a follow-up cleanup.
