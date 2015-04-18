(ns metabase.driver.sync
  "Generalized DB / Table syncing functions intended for use by specific driver implementations."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [medley.core :as m]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [field :refer [Field] :as field]
                             [table :refer [Table]])
            [metabase.util :as u]))

;; ## Generic QP Metadata Query

(defn- qp-query [{table-id :id, db-id :db_id} query-dict]
  (->> (driver/process-and-run {:database db-id
                                :type "query"
                                :query query-dict})
       :data
       :rows))


;; ## Database syncing fns

(defn sync-database-create-tables
  "Create new `Tables` for DATABASE + mark ones that no longer exist as inactive."
  {:arglists '([database active-table-names-set])}
  [{database-id :id} active-table-names]
  {:pre [(set? active-table-names)
         (every? string? active-table-names)]}
  (let [table-name->id (sel :many :field->id [Table :name] :active true :db_id database-id)]

    (log/debug "Marking old Tables as inactive...")
    (doseq [[table-name table-id] table-name->id]
      (when-not (contains? active-table-names table-name)
        (upd Table table-id :active false)))

    (log/debug "Creating new Tables...")
    (doseq [table-name active-table-names]
      (when-not (table-name->id table-name)
        (ins Table
          :db_id database-id
          :name table-name
          :active true)))))

(defn sync-active-tables
  "Run SYNC-TABLE-FNS against all the active Tables for DATABASE.
   Each function is ran in parallel against all active tables, and once it finishes, the next function is ran, etc."
  {:arglists '([database & sync-table-fns])}
  [{database-id :id :as database} & sync-table-fns]
  (let [tables (->> (sel :many Table :active true :db_id database-id)
                    (map #(assoc % :db (delay database))))] ; reuse DATABASE so we don't need to fetch it more than once

    (doseq [sync-fn sync-table-fns]
      (u/pdoseq [table tables]
        (u/try-apply sync-fn table)))))

;; ## Table syncing fns

;; ### sync-table-create-fields

(defn sync-table-create-fields
  "Create new `Fields` for TABLE as needed, and mark old ones as inactive.

    (sync-table-create-fields table {\"ID\" :IntegerField, \"Name\" :TextField, ...})"
  [{table-id :id :as table} active-field-name->base-type]
  {:pre [(map? active-field-name->base-type)
         (every? string? (keys active-field-name->base-type))
         (every? (partial contains? field/base-types) (vals active-field-name->base-type))]}
  (let [active-field-names (set (keys active-field-name->base-type))
        field-name->id (sel :many :field->id [Field :name] :active true :table_id table-id)]

    ;; Mark old Fields as inactive
    (doseq [[field-name field-id] field-name->id]
      (when-not (contains? active-field-names field-name)
        (upd Field field-id :active false)))

    ;; Create new Fields as needed
    (doseq [[field-name base-type] active-field-name->base-type]
      (when-not (field-name->id field-name)
        (ins Field
          :table_id table-id
          :name field-name
          :base_type base-type)))))

;; ### table row count

(defn- update-table-row-count!
  "Update TABLE's row count with the value from `(row-count-fn table)`."
  [{table-id :id table-name :name :as table} row-count-fn]
  (let [row-count (row-count-fn table)]
    (assert (integer? row-count))
    (if (= (:rows table) row-count) (log/debug (format "Table '%s' row count remains constant at %d." table-name row-count))
        (do (upd Table table-id :rows row-count)
            (log/debug (format "Updated row count for Table '%s': new value is %d." table-name row-count))))))

(defn qp-table-rows-count
  "Fetch the row count of TABLE via the QP."
  [table]
  (-> (qp-query table {:source_table (:id table)
                       :aggregation ["count"]})
      first first))

;; ### table PKs

(defn- update-table-pks!
  "Mark primary-key `Fields` for TABLE as `special_type = id` if they don't already have a `special_type`."
  [{table-id :id table-name :name :as table} pks-fn]
  (let [pks (pks-fn table)]
    (assert (set? pks))
    (assert (every? string? pks))
    (doseq [{field-name :name field-id :id} (sel :many :fields [Field :name :id] :table_id table-id :special_type nil :name [in pks])]
      (log/info (format "Field '%s.%s' is a primary key. Marking it as such." table-name field-name))
      (upd Field field-id :special_type :id))))

(defn sync-table-metadata [table & {:keys [pks-fn
                                           row-count-fn]
                                    :or {row-count-fn qp-table-rows-count}}]
  (u/try-apply update-table-pks! table pks-fn)
  (u/try-apply update-table-row-count! table row-count-fn))


;; ## field syncing fns

;; ### mark-url-field!

(def ^:const ^:private percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be marked as `special_type = :url`."
  0.95)

(defn- mark-url-field!
  "If FIELD is a `CharField` or `TextField`, doesn't yet have a `special_type`, and at least
   `percent-valid-url-threshold` of the non-nil values of FIELD are URLs (determined by PERCENT-URLS-FN),
   mark it as `special_type = url`."
  [{special-type :special_type, base-type :base_type, field-name :name, field-id :id, :as field} percent-urls-fn]
  (when (and (not special-type)
             (contains? #{:CharField :TextField} base-type))
    (let [percent-urls (percent-urls-fn field)]
      (assert (float? percent-urls))
      (assert (>= percent-urls 0.0))
      (assert (<= percent-urls 100.0))
      (when (> percent-urls percent-valid-url-threshold)
        (log/info (format "Field '%s.%s' is %d%% URLs. Marking it as a URL." (:name @(:table field)) field-name (int (math/round (* 100 percent-urls)))))
        (upd Field field-id :special_type :url)))))

;; ### mark-no-preview-display-field!

(def ^:const ^:private average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(defn- mark-no-preview-display-field!
  "Check FIELD to see if it has a large average length and should be marked as `preview_display = false`.
   This is only done for textual fields, i.e. ones with `special_type` of `:CharField` or `:TextField`."
  [{base-type :base_type, field-id :id, preview-display :preview_display, :as field} avg-length-fn]
  (println "BASE TYPE:" base-type)
  (when (and preview-display
             (contains? #{:CharField :TextField} base-type))
    (let [avg-len (avg-length-fn field)]
      (assert (number? avg-len))
      (when (> avg-len average-length-no-preview-threshold)
        (log/info (format "Field '%s.%s' has an average length of %d. Not displaying it in previews." (:name @(:table field)) (:name field) avg-len))
        (upd Field field-id :preview_display false)))))


;; ### mark-category-field!

(def ^:const ^:private low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)

(defn- mark-category-field! [{field-name :name, field-id :id, special-type :special_type, :as field} cardinality-fn]
  (when-not special-type
    (let [cardinality (cardinality-fn field)]
      (when (< cardinality low-cardinality-threshold)
        (log/info (format "Field '%s.%s' has %d unique values. Marking it as a category." (:name @(:table field)) field-name cardinality))
        (upd Field field-id :special_type :category)))))

(defn qp-field-distinct-count
  "Fetch the distinct count of FIELD via the QP."
  [{table :table :as field}]
  {:pre [(delay? table)]}
  (let [table @table]
    (-> (qp-query table {:source_table (:id table)
                         :aggregation ["distinct" (:id field)]})
        first first)))


;; ### sync-field-metadata

(defn sync-field-metadata [field & {:keys [avg-length-fn
                                           cardinality-fn
                                           percent-urls-fn]
                                    :or {cardinality-fn qp-field-distinct-count}}]
  (u/try-apply mark-url-field! field percent-urls-fn)
  (u/try-apply mark-no-preview-display-field! field avg-length-fn)
  (u/try-apply mark-category-field! field cardinality-fn))

(defn sync-active-fields-metadata
  "Run SYNC-FIELD-METADATA (in parallel) against all active `Fields` for TABLE."
  [{table-id :id :as table} & {:as metadata-fns}]
  {:pre [(integer? table-id)]}
  (let [fields (->> (sel :many Field :active true :table_id table-id)
                    (map #(assoc % :table (delay table))))] ; reuse TABLE so we don't need to fetch from DB again
    (u/pdoseq [field fields]
      (m/mapply sync-field-metadata field metadata-fns))))
