(ns metabase-enterprise.serialization.v2.entity-ids
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.db :as mdb]
   [metabase.models]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; make sure all the models get loaded up so we can resolve them based on their table names.
;;;
;;; TODO -- what about enterprise models that have `entity_id`? Don't know of any yet. We'll have to cross that bridge
;;; when we get there.
(comment metabase.models/keep-me)

(defn- entity-id-table-names
  "Return a set of lower-cased names of all application database tables that have an `entity_id` column, excluding views."
  []
  (with-open [conn (.getConnection (mdb/app-db))]
    (let [dbmeta (.getMetaData conn)]
      (with-open [tables-rset (.getTables dbmeta nil nil nil (into-array String ["TABLE"]))]
        (let [non-view-tables (into #{} (map (comp u/lower-case-en :table_name)) (resultset-seq tables-rset))]
          (with-open [rset (.getColumns dbmeta nil nil nil (case (mdb/db-type)
                                                             :h2                "ENTITY_ID"
                                                             (:mysql :postgres) "entity_id"))]
            (let [entity-id-tables (into #{} (map (comp u/lower-case-en :table_name)) (resultset-seq rset))]
              (set/intersection non-view-tables entity-id-tables))))))))

(defn toucan-models
  "Return a list of all toucan models."
  []
  (->> (descendants :metabase/model)
       (filter #(= (namespace %) "model"))))

(defn- make-table-name->model
  "Create a map of (lower-cased) application DB table name -> corresponding Toucan model."
  []
  (into {}
        (for [model (toucan-models)
              :let  [table-name (some-> model t2/table-name name)]
              :when table-name
              ;; ignore any models defined in test namespaces.
              :when (not (str/includes? (namespace model) "test"))]
         [table-name model])))

(defn- entity-id-models
  "Return a set of all Toucan models that have an `entity_id` column."
  []
  (let [entity-id-table-names       (entity-id-table-names)
        table-name->model           (make-table-name->model)
        entity-id-table-name->model (into {}
                                          (map (fn [table-name]
                                                 (if-let [model (table-name->model table-name)]
                                                  [table-name model]
                                                  (throw (ex-info (trs "Model not found for table {0}" table-name)
                                                                  {:table-name table-name})))))
                                          entity-id-table-names)
        entity-id-models            (set (vals entity-id-table-name->model))]
    ;; make sure we've resolved all of the tables that have entity_id to their corresponding models.
    (when-not (= (count entity-id-table-names)
                 (count entity-id-models))
      (throw (ex-info (trs "{0} tables have entity_id; expected to resolve the same number of models, but only got {1}"
                           (count entity-id-table-names)
                           (count entity-id-models))
                      {:tables   entity-id-table-names
                       :resolved entity-id-table-name->model})))
    (set entity-id-models)))

(defn- seed-entity-id-for-instance! [model instance]
  (let [primary-key (first (t2/primary-keys model))
        pk-value    (get instance primary-key)]
    (try
      (when-not (some? pk-value)
        (throw (ex-info (format "Missing value for primary key column %s" (pr-str primary-key))
                        {:model       (name model)
                         :instance    instance
                         :primary-key primary-key})))
      (let [new-hash (serdes/identity-hash instance)]
        (log/infof "Update %s %s entity ID => %s" (name model) (pr-str pk-value) (pr-str new-hash))
        (t2/update! model pk-value {:entity_id new-hash}))
      {:update-count 1}
      (catch Throwable e
        (let [data (ex-data e)]
          (log/errorf e "Error updating entity ID for %s %s: %s %s" (name model) (pr-str pk-value) (ex-message e)
                      (or (some-> data pr-str) "")))
        {:error-count 1}))))

(defn- seed-entity-ids-for-model! [model]
  (log/infof "Seeding Entity IDs for model %s" (name model))
  (let [reducible-instances (t2/reducible-select model :entity_id nil)]
    (transduce
     (map (fn [instance]
            (seed-entity-id-for-instance! model instance)))
     (completing
      (partial merge-with +)
      (fn [{:keys [update-count error-count], :as results}]
        (when (pos? update-count)
          (log/infof "Updated %d %s instance(s) successfully." update-count (name model)))
        (when (pos? error-count)
          (log/infof "Failed to update %d %s instance(s) because of errors." error-count (name model)))
        results))
     {:update-count 0, :error-count 0}
     reducible-instances)))

(defn seed-entity-ids!
  "Create entity IDs for any instances of models that support them but do not have them, i.e. find instances of models
  that have an `entity_id` column whose `entity_id` is `nil` and populate that column.

  Returns truthy if all missing entity IDs were created successfully, and falsey if there were any errors."
  []
  (log/info "Seeding Entity IDs")
  (mdb/setup-db! :create-sample-content? false)
  (let [{:keys [error-count]} (transduce
                               (map seed-entity-ids-for-model!)
                               (completing (partial merge-with +))
                               {:update-count 0, :error-count 0}
                               (entity-id-models))]
    (zero? error-count)))

(defn- drop-entity-ids-for-model! [model]
  (log/infof "Dropping Entity IDs for model %s" (name model))
  (try
    (let [update-count (t2/update! model {:entity_id nil})]
      (when (pos? update-count)
        (log/infof "Updated %d %s instance(s) successfully." update-count (name model)))
      {:update-count update-count})
    (catch Throwable e
      (log/errorf e "Error dropping entity ID: %s" (ex-message e))
      {:error-count 1})))

(defn drop-entity-ids!
  "Delete entity IDs for any models that have them. See #34871.

  Returns truthy if all entity IDs were removed successfully, and falsey if there were any errors."
  []
  (log/info "Dropping Entity IDs")
  (mdb/setup-db! :create-sample-content? false)
  (let [{:keys [error-count]} (transduce
                               (map drop-entity-ids-for-model!)
                               (completing (partial merge-with +))
                               {:update-count 0, :error-count 0}
                               (entity-id-models))]
    (zero? error-count)))
