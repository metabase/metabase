(ns metabase-enterprise.data-sensitivity.review
  "Review of the suggestions of a metadata generation run: counts per table, and accept or reject per suggestion, per
  table or for the whole run. A decision writes no field metadata; apply is a separate step.

  A suggestion with source `human` would replace a value a person set. Accept by table or for the whole run leaves
  those suggestions out unless the request sets `include_human_set`; accept by suggestion id always includes them."
  (:require
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-suggestion :as suggestion]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private statuses
  [:pending :accepted :rejected :stale :applied])

(mr/def ::status-counts
  (into [:map {:closed true}] (for [s statuses] [s ms/IntGreaterThanOrEqualToZero])))

(mr/def ::run-table
  [:map {:closed true}
   [:table_id           ms/PositiveInt]
   [:table_name         [:maybe :string]]
   [:schema             [:maybe :string]]
   [:total              ms/IntGreaterThanOrEqualToZero]
   [:counts             ::status-counts]
   [:human_set_pending  ms/IntGreaterThanOrEqualToZero]])

(mu/defn run-tables :- [:sequential ::run-table]
  "One entry per table that has suggestions in run `run-id`: the number of suggestions by status, and the number of
  pending suggestions that would replace a value a person set. Ordered by schema, then table name."
  [run-id :- ms/PositiveInt]
  (let [rows   (db/run-table-status-counts run-id)
        tables (db/tables-by-id (into #{} (map :table_id) rows))
        zero   (zipmap statuses (repeat 0))]
    (->> (group-by :table_id rows)
         (map (fn [[table-id rows]]
                (let [table (get tables table-id)]
                  {:table_id          table-id
                   :table_name        (:name table)
                   :schema            (:schema table)
                   :total             (reduce + (map :n rows))
                   :counts            (reduce (fn [acc {:keys [status n]}] (update acc status + n)) zero rows)
                   :human_set_pending (reduce + (for [{:keys [status source n]} rows
                                                      :when (= [:pending :human] [status source])]
                                                  n))})))
         (sort-by (juxt :schema :table_name :table_id))
         vec)))

(mr/def ::decision-request
  [:map {:closed true}
   [:decision          [:enum :accept :reject]]
   [:suggestion_ids    {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]
   [:table_ids         {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]
   [:all               {:optional true} [:maybe :boolean]]
   [:include_human_set {:optional true} [:maybe :boolean]]])

(def ^:private decision-rules
  {:accept {:from #{:pending :rejected} :to :accepted}
   :reject {:from #{:pending :accepted} :to :rejected}})

(defn- bad-request [message]
  (ex-info message {:status-code 400}))

(defn- selection [{:keys [suggestion_ids table_ids all include_human_set decision]}]
  (when-not (= 1 (count (filter identity [suggestion_ids table_ids all])))
    (throw (bad-request (tru "Give exactly one of suggestion_ids, table_ids or all."))))
  (cond-> (cond
            suggestion_ids {:suggestion-ids (vec (distinct suggestion_ids))}
            table_ids      {:table-ids (vec (distinct table_ids))}
            :else          {})
    (and (= :accept decision) (not suggestion_ids) (not include_human_set))
    (assoc :exclude-human? true)))

(mu/defn decide! :- [:map {:closed true} [:updated ms/IntGreaterThanOrEqualToZero]]
  "Accept or reject the suggestions of run `run-id` that `request` selects, as `user-id`. Accept moves pending and
  rejected suggestions to accepted; reject moves pending and accepted suggestions to rejected. Stale and applied
  suggestions do not change."
  [run-id  :- ms/PositiveInt
   request :- ::decision-request
   user-id :- ms/PositiveInt]
  (let [{:keys [from to]} (decision-rules (:decision request))]
    {:updated (db/decide-suggestions! run-id (selection request) from to user-id)}))

(mr/def ::suggestion
  [:merge
   ::suggestion/metadata-generation-suggestion
   [:map
    [:field_name         :string]
    [:field_display_name [:maybe :string]]]])
