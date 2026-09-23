(ns metabase.explorations.interestingness
  "Bridge between the explorations worker and `metabase.interestingness.core`.

  Resolves an `:model/ExplorationQuery` row to the Lib columns
  [[metabase.interestingness.core/chart-config]] needs, so its QP result can be turned into the
  `chart-config` consumed by `metabase.interestingness.chart/chart-interestingness`."
  (:require
   [clojure.string :as str]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn exploration-query->lib-query
  "Lib query built from the exploration query's `:dataset_query`. The database comes from the
  row's own `:database_id` snapshot column (frozen alongside `:dataset_query` at plan time),
  so building the metadata provider costs no extra query and doesn't parse the MBQL."
  [exploration-query]
  (let [dq (:dataset_query exploration-query)
        mp (lib-be/application-database-metadata-provider (:database_id exploration-query))]
    (lib/query mp dq)))

(defn exploration-query->lib-cols
  "Lib columns from the exploration query"
  [exploration-query]
  (lib/returned-columns (exploration-query->lib-query exploration-query)))

(defn qp-result->chart-config
  "Convenience: build a `chart-config` from an `:model/ExplorationQuery` row and its in-memory QP
  result. Derives Lib columns from the query's `:dataset_query` via
  [[exploration-query->lib-cols]]; takes rows from the QP result. Returns nil when the result
  can't be scored."
  [exploration-query qp-result]
  (interestingness/chart-config exploration-query
                                (exploration-query->lib-cols exploration-query)
                                (get-in qp-result [:data :rows])))

(defn lib-col->detail
  "A compact human-readable identifier for a single Lib column of `lib-query`. Uses the `:long`
  display-name style — which carries the join/FK-source prefix (e.g. `Product → Category`) for
  joined columns — plus any temporal-bucket / binning so that the same logical column at
  different granularities (e.g. `Created At: Month` vs `Created At: Quarter`) is distinguishable
  in prompt text."
  [lib-query lib-col]
  (when (map? lib-col)
    (let [display-name    (lib/display-name lib-query -1 lib-col :long)
          unit            (lib/raw-temporal-bucket lib-col)
          binning         (lib/binning lib-col)
          unit-name       (some-> unit name)
          unit-redundant? (and unit-name
                               (str/includes? (u/lower-case-en display-name)
                                              (u/lower-case-en unit-name)))]
      (cond-> display-name
        (and unit (not unit-redundant?)) (str ": " unit-name)
        binning                          (str " (binned)")))))
