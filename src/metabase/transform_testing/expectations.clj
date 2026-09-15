(ns metabase.transform-testing.expectations
  "Check each expectation against the transform's output temp table, returning `:passed`/`:failed`.
  A multimethod on expectation `:type`:
  - `:empty`  — a SQL query over the output that passes iff it returns no rows;
  - `:equals` — the output equals declared data (rows/sql), comparing set columns, ignoring others.

  Compiles each check's SQL (remapping references to the run's temp tables, via `compile`) and runs
  it through the `executor` — never a connection directly, so the module's warehouse I/O stays in
  one place. Returns statuses as data; the runner folds them into the run result and owns any HTTP."
  (:require
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.executor :as transform-testing.executor]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::context
  "What checking an expectation needs: the connection holding the temp tables and how to refer to them."
  [:map {:closed true}
   [:driver       :keyword]
   [:conn         :some]
   [:output-table :string]
   [:replacements ::transform-testing.compile/table-replacements]])

(defmulti check-expectation
  "Checks `expectation` against the output temp table on the connection of `context`, returning whether it passed."
  {:arglists '([context expectation])}
  (fn [_context expectation]
    (:type expectation)))

(mu/defmethod check-expectation :equals :- ::transform-testing.schema/status
  [_context     :- ::context
   _expectation :- ::transform-testing.schema/expectation.equals]
  (throw (ex-info "Not implemented" {})))

(mu/defmethod check-expectation :empty :- ::transform-testing.schema/status
  [{:keys [driver conn replacements]} :- ::context
   {:keys [sql]}                      :- ::transform-testing.schema/expectation.empty]
  (let [query (transform-testing.compile/replace-tables driver sql replacements)]
    (if (empty? (transform-testing.executor/run-query driver conn [query []] 1))
      :passed
      :failed)))
