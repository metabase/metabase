(ns metabase-enterprise.data-sensitivity.review
  "Review of the pending AI proposals of a database or its tables: counts per table, the proposals, and apply. The
  review UI keeps the selection and the edits until apply, which takes the accepted proposals and the edited values
  in one request. Apply writes the accepted proposals as AI values, which readers see over the deterministic value
  and under a person's value, and deletes their rows. Apply with `reject_all` marks every pending proposal of a
  database `rejected`. A rejected proposal is hidden until the next run that covers its field and attribute.

  `source` and `current_value` are computed when a proposal is read or applied, from the value readers see now. A
  proposal with source `human` would replace a value a person set; apply of such a proposal clears the person's
  value.

  An edited value replaces the proposed value of a proposal at apply. Apply writes it as the person's value, not as
  an AI value, because a person chose it.

  A run can replace or delete a proposal after the client read it. The request gives the proposed values that the
  client saw, and apply skips a proposal whose value is not that value any more, or that is gone, with reason
  `changed`."
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

(defn- human-set?
  "Whether a person set the value of the attribute of proposal `p` now."
  [settings {:keys [field_id attribute]}]
  (= :human (context/value-source (get settings field_id) attribute nil)))

(mr/def ::table-counts
  [:map {:closed true}
   [:table_id          ms/PositiveInt]
   [:table_name        [:maybe :string]]
   [:schema            [:maybe :string]]
   [:pending           ms/IntGreaterThanOrEqualToZero]
   [:human_set_pending ms/IntGreaterThanOrEqualToZero]])

(mu/defn table-counts :- [:sequential ::table-counts]
  "One entry per table in `scope` that has pending proposals: their number, and the number of them that would replace
  a value a person set. Ordered by schema, then table name."
  [scope :- ::db/scope]
  (let [ks       (db/pending-proposal-keys scope)
        tables   (db/tables-by-id (into #{} (map :table_id) ks))
        settings (db/user-settings-by-field (vec (distinct (map :field_id ks))))
        human    (frequencies (keep #(when (human-set? settings %) (:table_id %)) ks))]
    (->> (frequencies (map :table_id ks))
         (map (fn [[table-id n]]
                (let [table (get tables table-id)]
                  {:table_id          table-id
                   :table_name        (:name table)
                   :schema            (:schema table)
                   :pending           n
                   :human_set_pending (get human table-id 0)})))
         (sort-by (juxt :schema :table_name :table_id))
         vec)))

(mr/def ::source
  [:enum :human :ai :deterministic :none])

(mr/def ::proposal
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

(mu/defn pending-proposals :- [:sequential ::proposal]
  "The pending proposals in `scope`, with their `source` and `current_value`, in table and field order."
  [scope :- ::db/scope]
  (with-current (db/pending-proposals scope)))

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

        (llm/markup? value)
        (throw (bad-request (tru "The description must be plain text, without links, HTML tags or code.")))

        :else
        value))))

;;; Apply

(mr/def ::apply-request
  "Give `accept` (ids) and `edits`, or `reject_all` with `database_id`. `edits` maps a proposal id to the value that
  replaces its proposed value; an edit also accepts its proposal. `proposed_values` maps a proposal id to the
  proposed value that the client saw. `reject_all` rejects every pending proposal of the database `database_id`."
  [:map {:closed true}
   [:accept          {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:edits           {:optional true} [:maybe [:map-of ms/PositiveInt :string]]]
   [:proposed_values {:optional true} [:maybe [:map-of ms/PositiveInt :string]]]
   [:reject_all      {:optional true} [:maybe :boolean]]
   [:database_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::failure-reason
  [:enum :changed :field_not_found :not_writable :key_field :type_mismatch :error])

(mr/def ::apply-result
  [:map {:closed true}
   [:written  ms/IntGreaterThanOrEqualToZero]
   [:rejected ms/IntGreaterThanOrEqualToZero]
   [:failed   ms/IntGreaterThanOrEqualToZero]
   [:failures [:sequential [:map {:closed true}
                            [:proposal_id ms/PositiveInt]
                            [:field_id    [:maybe ms/PositiveInt]]
                            [:attribute   [:maybe :keyword]]
                            [:reason      ::failure-reason]]]]])

(defn- value-to-write
  "The value apply writes for proposal `s`: the edited value when the request edits it, else the proposed value."
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
  "Write the accepted proposals `proposals` of one table in one transaction and delete their rows; a proposal that
  fails keeps its row and status. The rows are locked first, and a proposal whose row is gone or whose value or status
  is not the one in `proposals` fails as `changed`. An edited proposal is written as the person's value; any other is
  written as an AI value, and when it is over a human value now, the person's value is cleared. Returns the outcome
  of each proposal and the ids of the written fields."
  [proposals]
  (t2/with-transaction [_conn]
    (let [rows      (db/lock-proposals (mapv :id proposals))
          field-ids (vec (distinct (map :field_id proposals)))
          fields    (db/active-fields-by-id field-ids)
          settings  (db/user-settings-by-field field-ids)
          outcomes  (mapv (fn [{:keys [id field_id attribute] :as s}]
                            (let [field (get fields field_id)]
                              (assoc s
                                     ::outcome (if (= (rows id) (select-keys s [:proposed_value :status]))
                                                 (outcome field s)
                                                 :changed)
                                     :source   (when field (current-source (get settings field_id) field attribute)))))
                          proposals)
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
      (db/delete-proposals! (mapv :id writes))
      {:outcomes  outcomes
       :field-ids (vec (keys by-field))})))

(defn- failure [{:keys [id field_id attribute]} reason]
  {:proposal_id id
   :field_id    field_id
   :attribute   attribute
   :reason      reason})

(defn- table-result [outcomes]
  (let [failures (remove #(= :write (::outcome %)) outcomes)]
    {:written  (- (count outcomes) (count failures))
     :rejected 0
     :failed   (count failures)
     :failures (mapv #(failure % (::outcome %)) failures)}))

(defn- publish-field-updates!
  "Publish `:event/field-update` for each active field in `field-ids` as `user-id`. A handler that throws is logged and
  does not stop the events of the other fields."
  [field-ids user-id]
  (doseq [field (vals (db/active-fields-by-id field-ids))]
    (try
      (events/publish-event! :event/field-update {:object field :user-id user-id})
      (catch Exception e
        (log/errorf e "Publishing the update of field %d failed" (:id field))))))

(defn- apply-table!
  "Write `proposals`, the accepted proposals of one table, then publish `:event/field-update` for each written field
  as `user-id`. A table whose write throws counts all its proposals as failed and leaves their status."
  [table-id proposals user-id]
  (if-let [{:keys [outcomes field-ids]} (try
                                          (write-table! proposals)
                                          (catch Exception e
                                            (log/errorf e "Applying the AI proposals of table %d failed" table-id)
                                            nil))]
    (do
      (try
        (publish-field-updates! field-ids user-id)
        (catch Exception e
          (log/errorf e "Publishing the field updates of table %d failed" table-id)))
      (table-result outcomes))
    (table-result (map #(assoc % ::outcome :error) proposals))))

(defn- check-request [{:keys [accept edits reject_all database_id]}]
  (when (and reject_all (not database_id))
    (throw (bad-request (tru "reject_all needs database_id."))))
  (when (and database_id (not reject_all))
    (throw (bad-request (tru "database_id needs reject_all."))))
  (when (and reject_all (or (seq accept) (seq edits)))
    (throw (bad-request (tru "Give accept and edits, or reject_all, not both.")))))

(defn- reject-all!
  "Mark every pending proposal of active fields of the database `database-id` `rejected`, decided by `user-id`."
  [database-id user-id]
  (let [ids (mapv :id (db/pending-proposal-keys {:database_id database-id}))]
    {:written  0
     :rejected (db/set-proposal-status! ids :rejected user-id)
     :failed   0
     :failures []}))

(defn- check-edits!
  "Throw a 400 when an edited value of `proposals` is one a person cannot set; return `proposals` with each edited
  value normalized. A proposal whose field is gone keeps its value; its write fails with `field_not_found`."
  [proposals]
  (let [fields (db/active-fields-by-id (vec (distinct (keep #(when (:edited_value %) (:field_id %)) proposals))))]
    (mapv (fn [{:keys [attribute edited_value field_id] :as p}]
            (let [field (get fields field_id)]
              (cond-> p
                (and edited_value field) (assoc :edited_value (edited-value attribute field edited_value)))))
          proposals)))

(mu/defn apply! :- ::apply-result
  "Apply the review that `request` gives, as `user-id`: write the accepted proposals, the edited ones as the person's
  values and the others as AI values, and delete their rows; or, with `reject_all`, mark every pending proposal of
  the database `rejected`. Ids that name no proposal are ignored, unless `proposed_values` has them: then they are
  listed in `failures` as `changed`, as is a proposal whose value is not the one in `proposed_values`, and a proposal
  in `accept` that is not pending. An edit of a proposal that is not pending is applied. An invalid edit is a 400 and
  nothing is written. Each table is one transaction. A proposal that cannot be written keeps its status and is listed
  in `failures`."
  [request :- ::apply-request
   user-id :- ms/PositiveInt]
  (check-request request)
  (if (:reject_all request)
    (reject-all! (:database_id request) user-id)
    (let [{:keys [accept edits proposed_values]} request
          seen      (or proposed_values {})
          ids       (vec (distinct (concat accept (keys edits))))
          by-id     (m/index-by :id (db/proposals-by-id ids))
          gone      (for [id ids :when (and (contains? seen id) (not (by-id id)))] {:id id})
          changed?  (fn [{:keys [id proposed_value]}] (and (contains? seen id) (not= (seen id) proposed_value)))
          decided   (filter #(and (not (contains? edits (:id %))) (not= :pending (:status %))) (keep by-id accept))
          candidate (keep by-id ids)
          changed   (m/distinct-by :id (concat decided (filter changed? candidate)))
          skip      (into #{} (map :id) changed)
          accepted  (->> (remove #(skip (:id %)) candidate)
                         (map #(assoc % :edited_value (get edits (:id %))))
                         check-edits!)
          failures  (mapv #(failure % :changed) (sort-by :id (concat gone changed)))]
      (transduce (map (fn [[table-id ps]] (apply-table! table-id ps user-id)))
                 (completing (fn [acc r] (merge-with #(if (number? %1) (+ %1 %2) (into %1 %2)) acc r)))
                 {:written 0 :rejected 0 :failed (count failures) :failures failures}
                 (sort-by key (group-by :table_id (sort-by :id accepted)))))))
