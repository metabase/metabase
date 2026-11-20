(ns metabase.transforms.models.util
  (:require
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private terminal-statuses
  "The statuses of a run that has ended."
  #{:succeeded :failed :canceled :timeout})

(defn ended-without-end-time?
  "Whether the pending changes of `run` move it to a terminal status and leave its `end_time` unset."
  [run]
  (let [changes (t2/changes run)]
    (and (contains? terminal-statuses (keyword (:status changes)))
         (not (contains? changes :end_time)))))

(defn ended?
  "Whether `status` is a terminal run status."
  [status]
  (contains? terminal-statuses (keyword status)))

(defn derive-is-active
  "Set `is_active` on `run` from its status: true while the run is not terminal, nil once it ended."
  [run]
  (assoc run :is_active (when-not (contains? terminal-statuses (keyword (:status run))) true)))

(defn with-run-defaults
  "Fill the status of a new `run` with `:started` when it has none and derive its `is_active`."
  [run]
  (derive-is-active (cond-> run (nil? (:status run)) (assoc :status :started))))

(defn derive-is-active-on-update
  "Derive `is_active` of the updated `run` from its status when the status is among the changes."
  [run]
  (cond-> run
    (contains? (t2/changes run) :status) derive-is-active))

(mu/defn timestamp-range :- [:tuple [:maybe ms/TemporalInstant] [:maybe ms/TemporalInstant]]
  "Parse `date-string` (in the same format as the query-processor date parameter, e.g. \"2025-01\",
  \"past7days\") into a `[start end]` pair of instants (either may be nil)."
  [date-string :- :string]
  (let [{:keys [start end]}
        (try
          (params.dates/date-string->range date-string {:inclusive-end? false})
          (catch Exception e
            (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                            {:status-code 400}
                            e))))]
    [(some-> start u.date/parse) (some-> end u.date/parse)]))

(mu/defn timestamp-constraint :- [:cat [:= :and] [:* [:or [:tuple [:= :>=] :keyword ms/TemporalInstant] [:tuple [:= :<] :keyword ms/TemporalInstant]]]]
  "Build a HoneySQL `[:and ...]` clause constraining `field-name` to the range expressed by `date-string`.
  `date-string` uses the same format as the query-processor date parameter (e.g. \"2025-01\", \"past7days\")."
  [field-name  :- :keyword
   date-string :- :string]
  (let [[start end] (timestamp-range date-string)]
    (into [:and] (remove nil?)
          [(when start [:>= field-name start])
           (when end   [:<  field-name end])])))
