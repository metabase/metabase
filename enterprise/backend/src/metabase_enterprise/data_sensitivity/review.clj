(ns metabase-enterprise.data-sensitivity.review
  "Review of the proposals that a metadata generation run wrote last: counts per table, and apply. The review UI keeps
  the selection and the edits until apply, which takes the accepted and rejected proposals and the edited values in
  one request. Apply writes the accepted proposals as AI values (decision `ghy-4721-metadata-layer-precedence`) and
  deletes their rows, and marks the rejected ones `rejected` (decision `ghy-4721-ai-proposal-model`).

  `source` and `current_value` are computed when a proposal is read or applied, from the value readers see now. A
  proposal with source `human` would replace a value a person set. Apply of `all` leaves those proposals out unless
  the request sets `include_human_set`; a proposal accepted by id or by an edit is always included. Apply of such a
  proposal clears the person's value.

  An edited value replaces the proposed value of a suggestion at apply. Apply writes it as the person's value, not as
  an AI value (decision `ghy-4721-edited-suggestion-layer`)."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-proposal :as proposal]
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
  [:pending :rejected])

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

(defn- human-set-pending-by-table
  "A map of table id to the number of pending proposals of run `run-id` over a value a person set."
  [run-id]
  (let [ks       (db/run-pending-proposal-keys run-id)
        settings (db/user-settings-by-field (vec (distinct (map :field_id ks))))]
    (frequencies (keep (fn [{:keys [table_id field_id attribute]}]
                         (when (= :human (context/value-source (get settings field_id) attribute nil))
                           table_id))
                       ks))))

(mu/defn run-tables :- [:sequential ::run-table]
  "One entry per table that has proposals that run `run-id` wrote last: the number of proposals by status, and the
  number of pending proposals that would replace a value a person set. Ordered by schema, then table name."
  [run-id :- ms/PositiveInt]
  (let [rows   (db/run-table-status-counts run-id)
        tables (db/tables-by-id (into #{} (map :table_id) rows))
        human  (human-set-pending-by-table run-id)
        zero   (zipmap statuses (repeat 0))]
    (->> (group-by :table_id rows)
         (map (fn [[table-id rows]]
                (let [table (get tables table-id)]
                  {:table_id          table-id
                   :table_name        (:name table)
                   :schema            (:schema table)
                   :total             (reduce + (map :n rows))
                   :counts            (reduce (fn [acc {:keys [status n]}] (update acc status + n)) zero rows)
                   :human_set_pending (get human table-id 0)})))
         (sort-by (juxt :schema :table_name :table_id))
         vec)))

(mr/def ::source
  [:enum :human :ai :deterministic :none])

(mr/def ::suggestion
  [:merge
   ::proposal/metadata-generation-proposal
   [:map
    [:source               ::source]
    [:current_value        [:maybe :string]]
    [:field_name           :string]
    [:field_display_name   [:maybe :string]]
    [:field_base_type      :string]
    [:field_effective_type [:maybe :string]]]])

(defn- current-value
  "The value of `attribute` of `field` as a string, as `current_value` shows it."
  [field attribute]
  (let [value (get field attribute)]
    (case attribute
      :semantic_type    (some-> value u/qualified-name)
      :data_sensitivity (some-> value name)
      :description      value)))

(defn- current-source [settings field attribute]
  (let [value (current-value field attribute)]
    (context/value-source settings attribute (if (= :description attribute) (not-empty value) value))))

(defn- with-current
  "`proposals` with the `source` and `current_value` of the value readers see now."
  [proposals]
  (let [field-ids (vec (distinct (map :field_id proposals)))
        fields    (db/active-fields-by-id field-ids)
        settings  (db/user-settings-by-field field-ids)]
    (mapv (fn [{:keys [field_id attribute] :as p}]
            (let [field (get fields field_id)]
              (assoc p
                     :current_value (some-> field (current-value attribute))
                     :source        (if field (current-source (get settings field_id) field attribute) :none))))
          proposals)))

(mu/defn table-suggestions :- [:sequential ::suggestion]
  "The proposals of `table-id` that run `run-id` wrote last, with their `source` and `current_value`."
  [run-id   :- ms/PositiveInt
   table-id :- ms/PositiveInt]
  (with-current (db/table-proposals run-id table-id)))

;;; Edit

(defn- bad-request [message]
  (ex-info message {:status-code 400}))

(defn- key-type? [semantic-type]
  (or (isa? semantic-type :type/PK) (isa? semantic-type :type/FK)))

(defn- edited-value
  "`value` as the edited value of `attribute` of `field`, normalized, or throw a 400 when a person cannot set it: the
  same rules as generation and apply."
  [attribute field value]
  (case attribute
    :data_sensitivity
    (if (some #{value} llm/categories)
      value
      (throw (bad-request (tru "Data sensitivity must be one of {0}." (str/join ", " llm/categories)))))

    :semantic_type
    (let [semantic-type (keyword value)
          field-type    ((some-fn :effective_type :base_type) field)]
      (cond
        (not (and (isa? semantic-type :Semantic/*) (not (key-type? semantic-type))))
        (throw (bad-request (tru "{0} is not a semantic type that can be set here." value)))

        (not (llm/semantic-type-fits? semantic-type field-type))
        (throw (bad-request (tru "{0} does not fit a field of type {1}." value (u/qualified-name field-type))))

        :else
        (u/qualified-name semantic-type)))

    :description
    (let [value (str/trim value)]
      (cond
        (str/blank? value)
        (throw (bad-request (tru "The description must not be blank.")))

        (> (count value) llm/description-cap)
        (throw (bad-request (tru "The description must be at most {0} characters." llm/description-cap)))

        :else
        value))))

;;; Apply

(mr/def ::apply-request
  "Give `accept` (ids) or `all`, or neither when the request only rejects. `all` accepts every proposal that the run
  wrote last, or of the tables in `table_ids`, except those in `except` or `reject`, and except those over a value a
  person set unless `include_human_set`. `edits` maps a proposal id to the value that replaces its proposed value; an
  edit also accepts its proposal."
  [:map {:closed true}
   [:accept            {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:all               {:optional true} [:maybe :boolean]]
   [:except            {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:table_ids         {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]
   [:include_human_set {:optional true} [:maybe :boolean]]
   [:reject            {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:edits             {:optional true} [:maybe [:map-of ms/PositiveInt :string]]]])

(mr/def ::failure-reason
  [:enum :field_not_found :not_writable :key_field :type_mismatch :error])

(mr/def ::apply-result
  [:map {:closed true}
   [:written  ms/IntGreaterThanOrEqualToZero]
   [:rejected ms/IntGreaterThanOrEqualToZero]
   [:stale    ms/IntGreaterThanOrEqualToZero]
   [:failed   ms/IntGreaterThanOrEqualToZero]
   [:failures [:sequential [:map {:closed true}
                            [:suggestion_id ms/PositiveInt]
                            [:field_id      ms/PositiveInt]
                            [:attribute     :keyword]
                            [:reason        ::failure-reason]]]]])

(defn- value-to-write
  "The value apply writes for suggestion `s`: the edited value when the request edits it, else the proposed value."
  [{:keys [attribute edited_value proposed_value]}]
  (let [value (or edited_value proposed_value)]
    (case attribute
      (:semantic_type :data_sensitivity) (keyword value)
      :description                       value)))

(defn- outcome
  "`:write` or a failure reason for accepted proposal `s`. A semantic type never replaces a key type, which sync owns,
  and must fit the field's type."
  [field {:keys [attribute] :as s}]
  (cond
    (nil? field)                                                        :field_not_found
    (not (:can_write field))                                            :not_writable
    (not= :semantic_type attribute)                                     :write
    (key-type? (:semantic_type field))                                  :key_field
    (not (llm/semantic-type-fits? (value-to-write s)
                                  ((some-fn :effective_type :base_type) field))) :type_mismatch
    :else                                                               :write))

(defn- write-table!
  "Write the accepted proposals `suggestions` of one table in one transaction and delete their rows; a proposal that
  fails is set back to pending. An edited proposal is written as the person's value; any other is written as an AI
  value, and when it is over a human value now, the person's value is cleared. Returns the outcome of each proposal
  and the ids of the written fields."
  [suggestions user-id]
  (t2/with-transaction [_conn]
    (let [field-ids (vec (distinct (map :field_id suggestions)))
          fields    (db/active-fields-by-id field-ids)
          settings  (db/user-settings-by-field field-ids)
          outcomes  (mapv (fn [{:keys [field_id attribute] :as s}]
                            (let [field (get fields field_id)]
                              (assoc s
                                     ::outcome (outcome field s)
                                     :source   (when field (current-source (get settings field_id) field attribute)))))
                          suggestions)
          writes    (filter #(= :write (::outcome %)) outcomes)
          by-field  (group-by :field_id writes)
          ai-writes (group-by :field_id (remove :edited_value writes))
          dims      (db/internal-dimension-ids-by-field
                     (vec (keep (fn [[field-id ss]] (when (some #(= :semantic_type (:attribute %)) ss) field-id))
                                by-field)))]
      (field-user-settings/set-ai-values-for-fields!
       (update-vals ai-writes (fn [ss] (into {} (map (juxt :attribute value-to-write)) ss))))
      (doseq [[field-id ss] ai-writes
              :let [human (vec (keep #(when (= :human (:source %)) (:attribute %)) ss))]
              :when (seq human)]
        (field-user-settings/unset-user-settings! {:id field-id} human))
      (doseq [[field-id ss] (group-by :field_id (filter :edited_value writes))]
        (field-user-settings/upsert-user-settings {:id field-id} (into {} (map (juxt :attribute value-to-write)) ss)))
      (doseq [[field-id ids] dims
              :let [field    (get fields field-id)
                    new-type (some #(when (= :semantic_type (:attribute %)) (value-to-write %)) (by-field field-id))]
              :when (not (warehouse-schema.field/internal-remapping-allowed? (:base_type field) new-type))]
        (db/delete-dimensions! ids))
      (let [{writes true failures false} (group-by #(= :write (::outcome %)) outcomes)]
        (db/delete-proposals! (mapv :id writes))
        (db/set-proposal-status! (mapv :id failures) :pending user-id))
      {:outcomes  outcomes
       :field-ids (vec (keys by-field))})))

(defn- table-result [outcomes]
  (let [failures (remove #(= :write (::outcome %)) outcomes)]
    {:written  (- (count outcomes) (count failures))
     :rejected 0
     :stale    0
     :failed   (count failures)
     :failures (mapv (fn [s] {:suggestion_id (:id s)
                              :field_id      (:field_id s)
                              :attribute     (:attribute s)
                              :reason        (::outcome s)})
                     failures)}))

(defn- apply-table!
  "Write `suggestions`, the accepted proposals of one table of run `run-id`, then publish `:event/field-update` for
  each written field as `user-id`. A table that throws counts all its suggestions as failed and leaves their status."
  [run-id table-id suggestions user-id]
  (try
    (let [{:keys [outcomes field-ids]} (write-table! suggestions user-id)]
      (doseq [field (vals (db/active-fields-by-id field-ids))]
        (events/publish-event! :event/field-update {:object field :user-id user-id}))
      (table-result outcomes))
    (catch Exception e
      (log/errorf e "Applying the suggestions of metadata generation run %d for table %d failed" run-id table-id)
      (table-result (map #(assoc % ::outcome :error) suggestions)))))

(defn- check-request [{:keys [accept all except table_ids include_human_set reject edits]}]
  (when (and (seq accept) all)
    (throw (bad-request (tru "Give accept or all, not both."))))
  (when (and (not all) (or (seq except) (seq table_ids) include_human_set))
    (throw (bad-request (tru "except, table_ids and include_human_set need all."))))
  (let [rejected (set reject)]
    (when (some rejected (concat accept (keys edits)))
      (throw (bad-request (tru "A suggestion cannot be both accepted and rejected."))))
    (when (some (set except) (keys edits))
      (throw (bad-request (tru "An edited suggestion cannot be in except."))))))

(defn- human-set?
  "Whether a person set the value of the attribute of proposal `p` now."
  [settings {:keys [field_id attribute]}]
  (= :human (context/value-source (get settings field_id) attribute nil)))

(defn- accepted-suggestions
  "The proposals that the request accepts, each with the request's edit as `:edited_value`."
  [run-id {:keys [accept all except table_ids include_human_set reject edits]}]
  (let [left-out (into (set except) reject)
        by-id    (db/open-proposals-by-id run-id (vec (distinct (concat accept (keys edits)))))
        in-scope (when all
                   (let [ps       (remove #(left-out (:id %)) (db/open-proposals run-id table_ids))
                         settings (when-not include_human_set
                                    (db/user-settings-by-field (vec (distinct (map :field_id ps)))))]
                     (cond->> ps
                       (not include_human_set) (remove #(human-set? settings %)))))]
    (->> (concat by-id in-scope)
         (m/distinct-by :id)
         (map #(assoc % :edited_value (get edits (:id %)))))))

(defn- check-edits!
  "Throw a 400 when an edited value of `suggestions` is one a person cannot set; return `suggestions` with each edited
  value normalized. A proposal whose field is gone keeps its value; its write fails with `field_not_found`."
  [suggestions]
  (let [fields (db/active-fields-by-id (vec (distinct (keep #(when (:edited_value %) (:field_id %)) suggestions))))]
    (mapv (fn [{:keys [attribute edited_value field_id] :as s}]
            (let [field (get fields field_id)]
              (cond-> s
                (and edited_value field) (assoc :edited_value (edited-value attribute field edited_value)))))
          suggestions)))

(mu/defn apply! :- ::apply-result
  "Apply the review of run `run-id` that `request` gives, as `user-id`: write the accepted proposals, the edited ones
  as the person's values and the others as AI values, and delete their rows, and mark the rejected ones `rejected`.
  Only proposals that the run wrote last take part; other ids are ignored. An invalid edit is a 400 and nothing is
  written. Each table is one transaction. A proposal that cannot be written stays pending and is listed in
  `failures`."
  [run-id  :- ms/PositiveInt
   request :- ::apply-request
   user-id :- ms/PositiveInt]
  (check-request request)
  (let [accepted (check-edits! (accepted-suggestions run-id request))
        rejected (db/open-proposals-by-id run-id (vec (distinct (:reject request))))]
    (db/set-proposal-status! (mapv :id rejected) :rejected user-id)
    (transduce (map (fn [[table-id ss]] (apply-table! run-id table-id ss user-id)))
               (completing (fn [acc r] (merge-with #(if (number? %1) (+ %1 %2) (into %1 %2)) acc r)))
               {:written 0 :rejected (count rejected) :stale 0 :failed 0 :failures []}
               (sort-by key (group-by :table_id (sort-by :id accepted))))))
