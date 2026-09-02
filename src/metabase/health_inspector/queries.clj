(ns metabase.health-inspector.queries
  "Application database queries for the health inspector module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn unarchived-cards-reducible
  "A reducible of the unarchived `report_card` rows."
  []
  (t2/reducible-select :report_card {:where [:= :archived false]}))

(defn insert-run!
  "Insert the `health_inspector_runs` `row`."
  [row]
  (t2/insert! :health_inspector_runs row))

(defn delete-runs-before!
  "Delete the `health_inspector_runs` rows run before `run-before`."
  [run-before]
  (t2/delete! :health_inspector_runs :run_at [:< run-before]))

(defn latest-run
  "The `:health` and `:message` of the most recent `health_inspector_runs` row for `check-name`, or nil."
  [check-name]
  ;; Tie-break on id: back-to-back inserts can share a run_at, and run_at alone would then pick a non-deterministic
  ;; row (id is a monotonic auto-increment PK).
  (t2/select-one [:health_inspector_runs :health :message] :check_name check-name
                 {:order-by [[:run_at :desc] [:id :desc]]}))

(defn latest-runs
  "The `limit` most recent `health_inspector_runs` rows."
  [limit]
  (t2/select :health_inspector_runs {:limit limit :order-by [[:run_at :desc]]}))
