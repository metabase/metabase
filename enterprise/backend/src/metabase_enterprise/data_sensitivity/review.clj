(ns metabase-enterprise.data-sensitivity.review
  "Review of the suggestions of a metadata generation run: counts per table, and accept, unaccept or reject per
  suggestion, per table or for the whole run. Unaccept moves a decided suggestion back to pending. A decision writes no
  field metadata; apply is a separate step that writes the accepted suggestions as AI values (decision
  `ghy-4721-metadata-layer-precedence`).

  A suggestion with source `human` would replace a value a person set. Accept or unaccept by table or for the whole run
  leaves those suggestions out unless the request sets `include_human_set`; a decision by suggestion id always includes
  them.
  Apply of such a suggestion clears the person's value."
  (:require
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-suggestion :as suggestion]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.field :as warehouse-schema.field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

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
   [:decision          [:enum :accept :unaccept :reject]]
   [:suggestion_ids    {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]
   [:table_ids         {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]
   [:all               {:optional true} [:maybe :boolean]]
   [:include_human_set {:optional true} [:maybe :boolean]]])

(def ^:private decision-rules
  {:accept   {:from #{:pending :rejected} :to :accepted}
   :unaccept {:from #{:accepted :rejected} :to :pending}
   :reject   {:from #{:pending :accepted} :to :rejected}})

(defn- bad-request [message]
  (ex-info message {:status-code 400}))

(defn- selection [{:keys [suggestion_ids table_ids all include_human_set decision]}]
  (when-not (= 1 (count (filter identity [suggestion_ids table_ids all])))
    (throw (bad-request (tru "Give exactly one of suggestion_ids, table_ids or all."))))
  (cond-> (cond
            suggestion_ids {:suggestion-ids (vec (distinct suggestion_ids))}
            table_ids      {:table-ids (vec (distinct table_ids))}
            :else          {})
    (and (#{:accept :unaccept} decision) (not suggestion_ids) (not include_human_set))
    (assoc :exclude-human? true)))

(mu/defn decide! :- [:map {:closed true} [:updated ms/IntGreaterThanOrEqualToZero]]
  "Decide the suggestions of run `run-id` that `request` selects, as `user-id`. Accept moves pending and rejected
  suggestions to accepted; unaccept moves accepted and rejected suggestions to pending; reject moves pending and
  accepted suggestions to rejected. Stale and applied suggestions do not change."
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

;;; Apply

(mr/def ::apply-request
  [:map {:closed true}
   [:table_ids {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]])

(mr/def ::failure-reason
  [:enum :field_not_found :not_writable :key_field :type_mismatch :error])

(mr/def ::apply-result
  [:map {:closed true}
   [:written  ms/IntGreaterThanOrEqualToZero]
   [:stale    ms/IntGreaterThanOrEqualToZero]
   [:failed   ms/IntGreaterThanOrEqualToZero]
   [:failures [:sequential [:map {:closed true}
                            [:suggestion_id ms/PositiveInt]
                            [:field_id      ms/PositiveInt]
                            [:attribute     :keyword]
                            [:reason        ::failure-reason]]]]])

(defn- current-value
  "The value of `attribute` of `field` as a suggestion records it in `current_value`."
  [field attribute]
  (let [value (get field attribute)]
    (case attribute
      :semantic_type    (some-> value u/qualified-name)
      :data_sensitivity (some-> value name)
      :description      value)))

(defn- current-source [settings field attribute]
  (let [value (current-value field attribute)]
    (context/value-source settings attribute (if (= :description attribute) (not-empty value) value))))

(defn- key-type? [semantic-type]
  (or (isa? semantic-type :type/PK) (isa? semantic-type :type/FK)))

(defn- outcome
  "`:write`, `:stale`, or a failure reason for accepted suggestion `s`. Stale: the value readers see, or the layer that
  gives it, is not the one the run recorded. A semantic type never replaces a key type, which sync owns, and must fit
  the field's type."
  [field settings {:keys [attribute source current_value proposed_value]}]
  (cond
    (nil? field)                                                        :field_not_found
    (not (:can_write field))                                            :not_writable
    (or (not= current_value (current-value field attribute))
        (not= source (current-source settings field attribute)))        :stale
    (not= :semantic_type attribute)                                     :write
    (key-type? (:semantic_type field))                                  :key_field
    (not (llm/semantic-type-fits? (keyword proposed_value)
                                  ((some-fn :effective_type :base_type) field))) :type_mismatch
    :else                                                               :write))

(defn- proposed-value [{:keys [attribute proposed_value]}]
  (case attribute
    (:semantic_type :data_sensitivity) (keyword proposed_value)
    :description                       proposed_value))

(defn- write-table!
  "Write the accepted suggestions `suggestions` of one table in one transaction and mark them applied or stale. For a
  suggestion over a human value, the person's value is cleared. Returns the outcome of each suggestion and the ids of
  the written fields."
  [suggestions]
  (t2/with-transaction [_conn]
    (let [field-ids (vec (distinct (map :field_id suggestions)))
          fields    (db/active-fields-by-id field-ids)
          settings  (db/user-settings-by-field field-ids)
          outcomes  (mapv (fn [s]
                            (assoc s ::outcome (outcome (get fields (:field_id s)) (get settings (:field_id s)) s)))
                          suggestions)
          writes    (filter #(= :write (::outcome %)) outcomes)
          by-field  (group-by :field_id writes)
          dims      (db/internal-dimension-ids-by-field
                     (vec (keep (fn [[field-id ss]] (when (some #(= :semantic_type (:attribute %)) ss) field-id))
                                by-field)))]
      (field-user-settings/set-ai-values-for-fields!
       (update-vals by-field (fn [ss] (into {} (map (juxt :attribute proposed-value)) ss))))
      (doseq [[field-id ss] by-field
              :let [human (vec (keep #(when (= :human (:source %)) (:attribute %)) ss))]
              :when (seq human)]
        (field-user-settings/unset-user-settings! {:id field-id} human))
      (doseq [[field-id ids] dims
              :let [field    (get fields field-id)
                    new-type (some #(when (= :semantic_type (:attribute %)) (proposed-value %)) (by-field field-id))]
              :when (not (warehouse-schema.field/internal-remapping-allowed? (:base_type field) new-type))]
        (db/delete-dimensions! ids))
      (db/set-suggestion-status! (mapv :id writes) :applied)
      (db/set-suggestion-status! (vec (keep #(when (= :stale (::outcome %)) (:id %)) outcomes)) :stale)
      {:outcomes  outcomes
       :field-ids (vec (keys by-field))})))

(defn- table-result [outcomes]
  (let [by-outcome (group-by ::outcome outcomes)
        failures   (remove #(#{:write :stale} (::outcome %)) outcomes)]
    {:written  (count (:write by-outcome))
     :stale    (count (:stale by-outcome))
     :failed   (count failures)
     :failures (mapv (fn [s] {:suggestion_id (:id s)
                              :field_id      (:field_id s)
                              :attribute     (:attribute s)
                              :reason        (::outcome s)})
                     failures)}))

(defn- apply-table!
  "Apply the accepted suggestions of run `run-id` for `table-id`, then publish `:event/field-update` for each written
  field as `user-id`. A table that throws counts all its accepted suggestions as failed and leaves them accepted."
  [run-id table-id user-id]
  (let [suggestions (db/accepted-suggestions run-id table-id)]
    (try
      (let [{:keys [outcomes field-ids]} (write-table! suggestions)]
        (doseq [field (vals (db/active-fields-by-id field-ids))]
          (events/publish-event! :event/field-update {:object field :user-id user-id}))
        (table-result outcomes))
      (catch Exception e
        (log/errorf e "Applying the suggestions of metadata generation run %d for table %d failed" run-id table-id)
        (table-result (map #(assoc % ::outcome :error) suggestions))))))

(mu/defn apply! :- ::apply-result
  "Write the accepted suggestions of run `run-id` as accepted AI values, for the tables in `table_ids`, else for every
  table, as `user-id`. Each table is one transaction. A suggestion whose field changed after the run becomes `stale`
  and is skipped; a suggestion that cannot be written stays accepted and is counted as failed."
  [run-id                :- ms/PositiveInt
   {:keys [table_ids]}   :- ::apply-request
   user-id               :- ms/PositiveInt]
  (transduce (map #(apply-table! run-id % user-id))
             (completing (fn [acc r] (merge-with #(if (number? %1) (+ %1 %2) (into %1 %2)) acc r)))
             {:written 0 :stale 0 :failed 0 :failures []}
             (sort (db/accepted-table-ids run-id table_ids))))
