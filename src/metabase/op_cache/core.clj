(ns metabase.op-cache.core
  "The protocol for caching expensive operations. A cache coordinates concurrent callers of the same
  operation (identified by a caller-supplied key) so that at any moment at most one of them is actually running it:
  a caller is served a stored value, runs the operation itself, or is served the result of a concurrent caller
  already running it. A value past its freshness boundary may be served only within a bounded grace period, and only
  while a refresh is in flight.")

(defprotocol OpCache
  (fetch-or-compute! [cache k op call-opts]
    "Return the result of `op` for key `k`, serving a cached value when possible and coordinating concurrent callers
    so at most one runs `op` at a time. `op` is a zero-arg function; its exceptions propagate to the caller that ran
    it. `call-opts`:

      * `:invalidated-at` -- instant; cached values written before it are stale. nil means a cached value is never
        served.

    Returns `{:value <any>, :source <keyword>, :written-at <instant>, :stored <boolean>}`:

      * `:source`     -- `:computed` (this caller ran `op`), `:cached-fresh`, or `:cached-stale` (served while
                         another caller refreshes).
      * `:written-at` -- when the served cached value was written; absent for `:computed` results.
      * `:stored`     -- for `:computed` results, whether the value was saved for later callers.")
  (evict! [cache k]
    "Remove any cached value for `k`.")
  (evict-all! [cache]
    "Remove every cached value.")
  (keys-written-since [cache threshold]
    "A reducible of the key of every cached value written at or after instant `threshold`. Keys are in the same form
    callers pass to [[fetch-or-compute!]].")
  (stats [cache]
    "Statistics about the stored values: `{:entries <count>, :average-value-size <bytes, or nil with no entries>}`.
    Sizes are as stored (e.g. after any at-rest encryption)."))
