(ns metabase.sync.analyze.classify
  "Analysis sub-step that takes a fingerprint for a Field and infers and saves appropriate information like special
  type. Each 'classifier' takes the information available to it and decides whether or not to run. We currently have
  the following classifiers:

  1.  `name`: Looks at the name of a Field and infers a semantic type if possible
  2.  `no-preview-display`: Looks at average length of text Field recorded in fingerprint and decides whether or not we
      should hide this Field
  3.  `category`: Looks at the number of distinct values of Field and determines whether it can be a Category
  4.  `text-fingerprint`: Looks at percentages recorded in a text Fields' TextFingerprint and infers a semantic type if
      possible

  All classifier functions take two arguments, a `FieldInstance` and a possibly `nil` `Fingerprint`, and should return
  the Field with any appropriate changes (such as a new semantic type). If no changes are appropriate, a classifier may
  return nil. Error handling is handled by `run-classifiers` below, so individual classiers do not need to handle
  errors themselves.

  In the future, we plan to add more classifiers, including ML ones that run offline."
  (:require
   [clojure.data :as data]
   [metabase.analyze.core :as analyze]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.models.interface :as mi]
   [metabase.sync.analyze.table-chunks :as table-chunks]
   [metabase.sync.interface :as i]
   [metabase.sync.updates :as sync.updates]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         CLASSIFYING INDIVIDUAL FIELDS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- updateable-columns
  "Columns of Field or Table that classifiers are allowed to be set."
  [model]
  (case model
    :model/Field #{:semantic_type :preview_display :has_field_values}
    :model/Table #{:entity_type}))

(def ^:private FieldOrTableInstance
  [:or
   i/FieldInstance
   i/TableInstance])

(mu/defn- model-updates :- [:maybe :map]
  "The values `updated-model` (a `Field` or a `Table`) sets on `original-model`, throwing for a column classifiers may
  not set."
  [original-model :- FieldOrTableInstance
   updated-model  :- FieldOrTableInstance]
  (assert (= (type original-model) (type updated-model)))
  (let [[_ values-to-set] (data/diff original-model updated-model)]
    (when (seq values-to-set)
      (log/debugf "Based on classification, updating these values of %s: %s"
                  (sync-util/name-for-logging original-model)
                  values-to-set))
    ;; Check that we're not trying to set anything that we're not allowed to
    (doseq [k (keys values-to-set)]
      (when-not (contains? (updateable-columns (mi/model original-model)) k)
        (throw (Exception. (format "Classifiers are not allowed to set the value of %s." k)))))
    values-to-set))

(def ^:private ClassifyOpts
  [:map {:closed true}
   [:exists-name :boolean]])

(mu/defn- classify!
  "Run various classifiers on `field` and its `fingerprint`, returning the updated `field`, with the values to save as
  `::updates` in its metadata."
  [field                 :- i/FieldInstance
   {:keys [exists-name]} :- ClassifyOpts
   fingerprint           :- [:maybe ::lib.schema.metadata.fingerprint/fingerprint]]
  (sync-util/with-error-handling (format "Error classifying %s" (sync-util/name-for-logging field))
    (let [classified (analyze/run-classifiers field fingerprint)
          would-be-name? (= (:semantic_type classified) :type/Name)
          ;; if it would be name and table already has a name field, don't classify as name (SEM-414)
          updated-field (if (and would-be-name? exists-name)
                          (assoc classified :semantic_type (:semantic_type field))
                          classified)]
      (cond-> updated-field
        (not= field updated-field) (vary-meta assoc ::updates (model-updates field updated-field))))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                        CLASSIFYING ALL FIELDS IN A TABLE                                         |
;;; +------------------------------------------------------------------------------------------------------------------+

(defn- classify-field
  "`state` with `field` classified: its Table's stats counted, its updates added, and its Table marked as having a name
  Field when it becomes one."
  [{:keys [tables-with-name] :as state} field]
  (let [table-id (:table_id field)
        result   (classify! field {:exists-name (contains? tables-with-name table-id)} (:fingerprint field))]
    (cond-> (update state :fields-classified inc)
      (instance? Exception result)           (update :fields-failed inc)
      (seq (::updates (meta result)))        (update :updates conj [field (::updates (meta result))])
      (= :type/Name (:semantic_type result)) (update :tables-with-name conj table-id))))

(defn- save-field-updates!
  "Save `updates`, pairs of a Field of one of `tables` and the values classification sets on it, in one update, or Table
  by Table when that fails."
  [tables updates]
  (let [id->table   (into {} (map (juxt :id identity)) tables)
        by-table    (group-by (comp :table_id first) updates)
        save-table! (fn [[table-id table-updates]]
                      (sync-util/with-error-handling (format "Error saving the classification of the Fields of %s"
                                                             (sync-util/name-for-logging (id->table table-id)))
                        (sync.updates/update-fields-unless-user-set! table-updates)))]
    (when (or (nil? (next by-table))
              (instance? Exception (sync-util/with-error-handling "Error saving the classification of Fields"
                                     (sync.updates/update-fields-unless-user-set! updates))))
      (run! save-table! by-table))))

(mu/defn- classify-fields-of-tables! :- [:map {:closed true} [:fields-classified :int] [:fields-failed :int]]
  "Run various classifiers on the Fields of `tables` that have not been previously analyzed, reading and saving them a
  page at a time, and return how many were classified and how many failed."
  [tables :- [:sequential i/TableInstance]]
  (tracing/with-span :sync "sync.classify.fields" {:sync/table-count (count tables)}
    (let [table-ids (mapv :id tables)]
      (loop [after-id 0
             state    {:fields-classified 0
                       :fields-failed     0
                       :tables-with-name  (set (keys (analyze/name-field-counts table-ids)))}]
        (if-let [fields (not-empty (analyze/incomplete-analysis-fields table-ids i/*latest-fingerprint-version*
                                                                       after-id table-chunks/fields-per-read))]
          (let [state (reduce classify-field (assoc state :updates []) fields)]
            (when (seq (:updates state))
              (save-field-updates! tables (:updates state)))
            (recur (:id (last fields)) (dissoc state :updates)))
          (select-keys state [:fields-classified :fields-failed]))))))

(mu/defn classify-fields!
  "Run various classifiers on the appropriate `fields` in a `table` that have not been previously analyzed. These do
  things like inferring (and setting) the semantic types and preview display status for Fields belonging to `table`."
  [table :- i/TableInstance]
  (let [stats (classify-fields-of-tables! [table])]
    (when (pos? (:fields-classified stats))
      stats)))

(mu/defn- table-classification
  "The values classifiers set on `table`, nil when they set none, or `::failed` when they throw."
  [table :- i/TableInstance]
  (let [updated-table (sync-util/with-error-handling (format "Error running classifier on %s"
                                                             (sync-util/name-for-logging table))
                        (analyze/infer-entity-type-by-name table))]
    (if (instance? Exception updated-table)
      ::failed
      (model-updates table updated-table))))

(mu/defn ^:always-validate classify-table!
  "Run various classifiers on the `table`. These do things like inferring (and setting) entity type of `table`."
  [table :- i/TableInstance]
  (let [values (table-classification table)]
    (cond
      (= ::failed values) table
      values              (do (sync.updates/update-table-unless-user-set! table values)
                              true))))

(mu/defn- classify-tables-of-chunk! :- :int
  "Run various classifiers on `tables` and save the values they set in one update, returning the number of Tables they
  set values on or failed on."
  [tables :- [:sequential i/TableInstance]]
  (let [outcomes (mapv (juxt identity table-classification) tables)
        updates  (filterv (comp map? second) outcomes)]
    (when (seq updates)
      (sync.updates/update-tables-unless-user-set! updates))
    (count (filter second outcomes))))

(def ^:private LogProgressFn
  [:=> [:cat :string [:schema i/TableInstance]] :nil])

(mu/defn classify-tables-for-db!
  "Classify all tables found in a given database"
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (reduce (fn [acc tables]
            (let [classified (classify-tables-of-chunk! tables)]
              (run! #(log-progress-fn "classify-tables" %) tables)
              (-> acc
                  (update :total-tables + (count tables))
                  (update :tables-classified + classified))))
          {:tables-classified 0, :total-tables 0}
          (table-chunks/chunks (sync-util/reducible-sync-tables database))))

(mu/defn classify-fields-for-db!
  "Classify all fields found in a given database"
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (reduce (fn [acc tables]
            (let [stats (classify-fields-of-tables! tables)]
              (run! #(log-progress-fn "classify-fields" %) tables)
              (merge-with + acc stats)))
          {:fields-classified 0, :fields-failed 0}
          (table-chunks/chunks (sync-util/reducible-sync-tables database))))
