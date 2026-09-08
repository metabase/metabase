(ns metabase.health-inspector.db
  "Application database queries for the health inspector module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn unarchived-cards-reducible
  "A reducible of the unarchived `report_card` rows."
  []
  (t2/reducible-select :report_card {:where [:= :archived false]}))

(mu/defn insert-run! :- :int
  "Insert the `health_inspector_runs` `row`."
  [row :- [:map {:closed true}
           [:id {:optional true} :int]
           [:message {:optional true} :string]
           [:check_name {:optional true} :string]
           [:run_at {:optional true} ms/TemporalInstant]
           [:health {:optional true} :int]]]
  (t2/insert! :health_inspector_runs row))

(mu/defn delete-runs-before! :- :int
  "Delete the `health_inspector_runs` rows run before `run-before`."
  [run-before :- ms/TemporalInstant]
  (t2/delete! :health_inspector_runs :run_at [:< run-before]))

(def ^:private LatestRunRow
  "Rows returned by [[latest-run]]."
  [:map {:closed true}
   [:health :int]
   [:message :string]])

(mu/defn latest-run :- [:maybe LatestRunRow]
  "The `:health` and `:message` of the most recent `health_inspector_runs` row for `check-name`, or nil."
  [check-name :- :string]
  ;; Ty-break on id: back-to-back inserts can share a run_at, and run_at alone would then pick a non-deterministic
  ;; row (id is a monotonic auto-increment PK).
  (t2/select-one [:health_inspector_runs :health :message] :check_name check-name
                 {:order-by [[:run_at :desc] [:id :desc]]}))

(def ^:private LatestRun
  "Rows returned by [[latest-runs]]."
  [:map {:closed true}
   [:id :int]
   [:message :string]
   [:check_name :string]
   [:run_at ms/TemporalInstant]
   [:health :int]])

(mu/defn latest-runs :- [:sequential LatestRun]
  "The `limit` most recent `health_inspector_runs` rows."
  [limit :- ms/PositiveInt]
  (t2/select :health_inspector_runs {:limit limit :order-by [[:run_at :desc]]}))
