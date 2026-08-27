(ns metabase.analytics-interface.core
  "Dependency-free analytics interface for use in CLJC code (including metabase.lib).

  Provides a thin reporting API that works in both CLJ and CLJS runtimes.
  This namespace has zero dependencies, so it can be safely required from `metabase.lib`
  without circular dependencies.

  ## How it works

  [[Reporter]] is a protocol defining the core metrics operations.
  Each runtime provides an implementation and registers it via [[set-reporter!]]:
  - **CLJ (backend):** `metabase.analytics.impl` registers an implementation
    that delegates to Prometheus.
  - **CLJS (frontend):** `metabase.analytics.impl` registers an implementation
    that batches events and POSTs them to the backend.

  ## Usage from library code

      (require '[metabase.analytics-interface.core :as analytics])

      (analytics/inc! :my-experiment/runs-total {:variant \"new\"})
      (analytics/observe! :my-experiment/overhead-ms {:variant \"new\"} 42)
      (analytics/set-gauge! :my-gauge/current-value 10)
      (analytics/dec-gauge! :my-gauge/active-count)")

(defprotocol Reporter
  (-inc! [this metric labels amount]
    "Increment a counter metric.")
  (-dec-gauge! [this metric labels amount]
    "Decrement a gauge metric.")
  (-set-gauge! [this metric labels amount]
    "Set a gauge metric to an absolute value.")
  (-observe! [this metric labels amount]
    "Record a histogram/summary observation.")
  (-clear! [this metric]
    "Clear all values for a metric (reset all label combinations)."))

(def ^:private no-op-reporter
  "A no-op reporter. This ideally should never be used in production, as the real one is installed after setting up the
  prometheus server. That has been moved to very early in the startup chain"
  (reify Reporter
    (-inc! [_this _metric _labels _amount])
    (-dec-gauge! [_this _metric _labels _amount])
    (-set-gauge! [_this _metric _labels _amount])
    (-observe! [_this _metric _labels _amount])
    (-clear! [_this _metric])))

(defonce ^:private reporter (atom no-op-reporter))

(defn get-reporter
  "Return the currently registered [[Reporter]], or nil."
  []
  @reporter)

(defn set-reporter!
  "Register a [[Reporter]] implementation. Called once per runtime at init time."
  [r]
  (reset! reporter r))

(defn inc!
  "Increment a counter metric. No-op if no reporter is registered."
  ([metric]
   (inc! metric nil 1))
  ([metric labels-or-amount]
   (if (number? labels-or-amount)
     (inc! metric nil labels-or-amount)
     (inc! metric labels-or-amount 1)))
  ([metric labels amount]
   (when-let [r @reporter]
     (-inc! r metric labels amount))))

(defn dec-gauge!
  "Decrement a gauge metric. No-op if no reporter is registered."
  ([metric]
   (dec-gauge! metric nil 1))
  ([metric labels-or-amount]
   (if (number? labels-or-amount)
     (dec-gauge! metric nil labels-or-amount)
     (dec-gauge! metric labels-or-amount 1)))
  ([metric labels amount]
   (when-let [r @reporter]
     (-dec-gauge! r metric labels amount))))

(defn set-gauge!
  "Set a gauge metric to an absolute value. No-op if no reporter is registered."
  ([metric amount]
   (set-gauge! metric nil amount))
  ([metric labels amount]
   (when-let [r @reporter]
     (-set-gauge! r metric labels amount))))

(defn observe!
  "Record a histogram/summary observation. No-op if no reporter is registered."
  ([metric]
   (observe! metric nil 1))
  ([metric labels-or-amount]
   (if (number? labels-or-amount)
     (observe! metric nil labels-or-amount)
     (observe! metric labels-or-amount 1)))
  ([metric labels amount]
   (when-let [r @reporter]
     (-observe! r metric labels amount))))

(defn clear!
  "Clear all values for a metric. No-op if no reporter is registered."
  [metric]
  (when-let [r @reporter]
    (-clear! r metric)))
