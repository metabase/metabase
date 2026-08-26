(ns metabase.task-history.models.task-history-queries
  "HugSQL query access for `:model/TaskHistory` (app-db HugSQL POC).

  The SQL lives in [[task_history.sql]] as literal text; [[sqlvec]] builds `[sql & params]`
  vectors from it. Execution goes through Toucan 2 (`t2/select` / `t2/query` with the model),
  so instances, out-transforms, and hydration behave exactly as with HoneySQL queries."
  (:require
   [hugsql.core :as hugsql]
   [hugsql.parameters :as hugsql.params]
   [toucan2.tools.transformed :as t2.transformed]))

;;; Disarm HugSQL's raw-splice param types process-wide: :sql/:snip splice unescaped text and
;;; :i/:identifier splices identifiers UNQUOTED by default -- each is a SQL injection hole.
;;; Metabase SQL files use :value/:value* only (tuples are also value-carrying and stay legal),
;;; so anything else throws at query-build time instead of relying on lint or review.
;;; Re-arming a type means deleting it from this list: a global, loud diff. See the HugSQL
;;; style guide.
(doseq [param-type [:sql :snip :snip* :sqlvec :sqlvec* :i :identifier :i* :identifier*]]
  (defmethod hugsql.params/apply-hugsql-param param-type
    [param _data _options]
    (throw (ex-info "Raw-splice HugSQL params are not allowed in Metabase SQL files; use :value/:value* (see the HugSQL style guide)"
                    {:param param}))))

(def ^:private queries
  (delay (hugsql/map-of-sqlvec-fns "metabase/task_history/models/task_history.sql" {:fn-suffix ""})))

(defn sqlvec
  "Build the `[sql & params]` vector for `query-name` -- a `-- :name` in task_history.sql --
  from the `params` map. Throws on an unknown query name."
  [query-name params]
  (if-let [f (get-in @queries [query-name :fn])]
    (f params)
    (throw (ex-info (str "No such query in task_history.sql: " query-name)
                    {:query-name query-name, :known (keys @queries)}))))

(defn in-xform
  "Apply `model`'s Toucan `:in` transforms to the matching non-nil keys of `m`, so values headed
  into raw SQL params take the same wire format a `t2` write would send (keywords -> strings,
  maps -> JSON). Reuses the registry `t2/deftransforms` writes to; nothing is duplicated."
  [model m]
  (reduce-kv (fn [m col {in-fn :in}]
               (if (some? (get m col))
                 (update m col in-fn)
                 m))
             m
             (t2.transformed/transforms model)))
