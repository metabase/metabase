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
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.models.interface :as mi]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

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

(mu/defn- save-model-updates!
  "Save the updates in `updated-model` (can be either a `Field` or `Table`)."
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
    ;; cool, now we should be ok to update the model
    (when values-to-set
      (t2/update! (mi/model original-model) (u/the-id original-model)
                  values-to-set)
      true)))

(mu/defn- classify!
  "Run various classifiers on `field` and its `fingerprint`, and save any detected changes.
   Returns updated `field`"
  ([field :- i/FieldInstance opts]
   (classify! field opts
              (or (:fingerprint field)
                  (when (qp.store/initialized?)
                    (:fingerprint (lib.metadata/field (qp.store/metadata-provider) (u/the-id field))))
                  (t2/select-one-fn :fingerprint :model/Field :id (u/the-id field)))))

  ([field       :- i/FieldInstance
    {:keys [exists-name]}
    fingerprint :- [:maybe ::lib.schema.metadata.fingerprint/fingerprint]]
   (sync-util/with-error-handling (format "Error classifying %s" (sync-util/name-for-logging field))
     (let [classified (analyze/run-classifiers field fingerprint)
           would-be-name? (= (:semantic_type classified) :type/Name)
           ;; if it would be name and table already has a name field, don't classify as name (SEM-414)
           updated-field (if (and would-be-name? exists-name)
                           (assoc classified :semantic_type (:semantic_type field))
                           classified)]
       (when-not (= field updated-field)
         (save-model-updates! field updated-field))
       updated-field))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                        CLASSIFYING ALL FIELDS IN A TABLE                                         |
;;; +------------------------------------------------------------------------------------------------------------------+

(mu/defn- fields-to-classify :- [:maybe [:sequential i/FieldInstance]]
  "Return a sequences of Fields belonging to `table` for which we should attempt to determine semantic type. This
  should include Fields that have the latest fingerprint, but have not yet *completed* analysis."
  [table :- i/TableInstance]
  (seq (apply t2/select :model/Field
              :table_id (u/the-id table)
              :active true
              :visibility_type [:not-in ["sensitive" "retired"]]
              (reduce concat [] (sync.fingerprint/incomplete-analysis-kvs)))))

(mu/defn classify-fields!
  "Run various classifiers on the appropriate `fields` in a `table` that have not been previously analyzed. These do
  things like inferring (and setting) the semantic types and preview display status for Fields belonging to `table`."
  [table :- i/TableInstance]
  (let [table-id (:id table)]
    (when-let [fields (fields-to-classify table)]
      (let [existing-name-field (t2/count :model/Field
                                          :table_id table-id
                                          :active true
                                          :visibility_type [:not-in ["sensitive" "retired"]]
                                          :semantic_type :type/Name)
            {:keys [fields-failed]}
            (reduce (fn [state field]
                      (let [result (classify! field state)]
                        (cond-> state
                          (instance? Exception result)
                          (update :fields-failed inc)

                          (= :type/Name (:semantic_type result))
                          (assoc :exists-name true))))
                    {:fields-failed 0 :exists-name (pos? existing-name-field)}
                    fields)]
        {:fields-classified (count fields)
         :fields-failed fields-failed}))))

(mu/defn ^:always-validate classify-table!
  "Run various classifiers on the `table`. These do things like inferring (and setting) entity type of `table`."
  [table :- i/TableInstance]
  (let [updated-table (sync-util/with-error-handling (format "Error running classifier on %s"
                                                             (sync-util/name-for-logging table))
                        (analyze/infer-entity-type-by-name table))]
    (if (instance? Exception updated-table)
      table
      (save-model-updates! table updated-table))))

(mu/defn classify-tables-for-db!
  "Classify all tables found in a given database"
  [database :- i/DatabaseInstance
   log-progress-fn]
  (let [tables (sync-util/reducible-sync-tables database)]
    (reduce (fn [acc table]
              (let [result (classify-table! table)]
                (log-progress-fn "classify-tables" table)
                (-> acc
                    (update :total-tables inc)
                    (cond-> result (update :tables-classified inc)))))
            {:tables-classified 0, :total-tables 0}
            tables)))

(mu/defn classify-fields-for-db!
  "Classify all fields found in a given database"
  [database :- i/DatabaseInstance
   log-progress-fn]
  (let [tables (sync-util/reducible-sync-tables database)]
    (transduce (map (fn [table]
                      (let [result (classify-fields! table)]
                        (log-progress-fn "classify-fields" table)
                        result)))
               (partial merge-with +)
               {:fields-classified 0, :fields-failed 0}
               tables)))
