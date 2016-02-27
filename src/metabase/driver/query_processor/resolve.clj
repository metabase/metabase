(ns metabase.driver.query-processor.resolve
  "Resolve references to `Fields`, `Tables`, and `Databases` in an expanded query dictionary."
  (:refer-clojure :exclude [resolve])
  (:require (clojure [set :as set]
                     [walk :as walk])
            [medley.core :as m]
            [schema.core :as s]
            [metabase.db :refer [sel]]
            [metabase.driver.query-processor.interface :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.util :as u])
  (:import (metabase.driver.query_processor.interface DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      FieldPlaceholder
                                                      RelativeDatetime
                                                      RelativeDateTimeValue
                                                      Value
                                                      ValuePlaceholder)))

;; # ---------------------------------------------------------------------- UTIL FNS ------------------------------------------------------------

(defn rename-mb-field-keys
  "Rename the keys in a Metabase `Field` to match the format of those in Query Expander `Fields`."
  [field]
  (set/rename-keys field {:id              :field-id
                          :name            :field-name
                          :display_name    :field-display-name
                          :special_type    :special-type
                          :base_type       :base-type
                          :preview_display :preview-display
                          :table_id        :table-id
                          :parent_id       :parent-id}))

;;; # ------------------------------------------------------------ IRESOLVE PROTOCOL ------------------------------------------------------------

(defprotocol ^:private IResolve
  (^:private unresolved-field-id ^Integer [this]
   "Return the unresolved Field ID associated with this object, if any.")
  (^:private fk-field-id ^Integer [this]
   "Return a the FK Field ID (for joining) associated with this object, if any.")
  (^:private resolve-field [this, ^clojure.lang.IPersistentMap field-id->fields]
   "This method is called when walking the Query after fetching `Fields`.
    Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
    return their expanded form. Other objects should just return themselves.a")
  (resolve-table [this, ^clojure.lang.IPersistentMap table-id->tables]
   "Called when walking the Query after `Fields` have been resolved and `Tables` have been fetched.
    Objects like `Fields` can add relevant information like the name of their `Table`."))

(def ^:private IResolveDefaults
  {:unresolved-field-id (constantly nil)
   :fk-field-id         (constantly nil)
   :resolve-field       (fn [this _] this)
   :resolve-table       (fn [this _] this)})

(extend Object IResolve IResolveDefaults)
(extend nil    IResolve IResolveDefaults)


;;; ## ------------------------------------------------------------ FIELD ------------------------------------------------------------

(defn- field-unresolved-field-id [{:keys [parent parent-id]}]
  (or (unresolved-field-id parent)
      (when (instance? FieldPlaceholder parent)
        parent-id)))

(defn- field-resolve-field [{:keys [parent parent-id], :as this} field-id->fields]
  (cond
    parent    (or (when (instance? FieldPlaceholder parent)
                    (when-let [resolved (resolve-field parent field-id->fields)]
                      (assoc this :parent resolved)))
                  this)
    parent-id (assoc this :parent (or (field-id->fields parent-id)
                                      (map->FieldPlaceholder {:field-id parent-id})))
    :else     this))

(defn- field-resolve-table [{:keys [table-id], :as this} table-id->table]
  (let [table (or (table-id->table table-id)
                  (throw (Exception. (format "Query expansion failed: could not find table %d." table-id))))]
    (assoc this
           :table-name  (:name table)
           :schema-name (:schema table))))

(extend Field
  IResolve (merge IResolveDefaults
                  {:unresolved-field-id field-unresolved-field-id
                   :resolve-field       field-resolve-field
                   :resolve-table       field-resolve-table}))


;;; ## ------------------------------------------------------------ FIELD PLACEHOLDER ------------------------------------------------------------

(defn- field-ph-resolve-field [{:keys [field-id, datetime-unit], :as this} field-id->fields]
  (if-let [{:keys [base-type special-type], :as field} (some-> (field-id->fields field-id)
                                                               map->Field)]
    ;; try to resolve the Field with the ones available in field-id->fields
    (let [datetime-field? (or datetime-unit
                              (contains? #{:DateField :DateTimeField} base-type)
                              (contains? #{:timestamp_seconds :timestamp_milliseconds} special-type))]
      (if-not datetime-field?
        field
        (map->DateTimeField {:field field
                             :unit  (or datetime-unit :day)})))
    ;; If that fails just return ourselves as-is
    this))

(extend FieldPlaceholder
  IResolve (merge IResolveDefaults
                  {:unresolved-field-id :field-id
                   :fk-field-id         :fk-field-id
                   :resolve-field       field-ph-resolve-field}))


;;; ## ------------------------------------------------------------ VALUE PLACEHOLDER ------------------------------------------------------------

(defprotocol ^:private IParseValueForField
  (^:private parse-value [this value]
    "Parse a value for a given type of `Field`."))

(extend-protocol IParseValueForField
  Field
  (parse-value [this value]
    (s/validate Value (map->Value {:field this, :value value})))

  DateTimeField
  (parse-value [this value]
    (cond
      (u/date-string? value)
      (s/validate DateTimeValue (map->DateTimeValue {:field this, :value (u/->Timestamp value)}))

      (instance? RelativeDatetime value)
      (do (s/validate RelativeDatetime value)
          (s/validate RelativeDateTimeValue (map->RelativeDateTimeValue {:field this, :amount (:amount value), :unit (:unit value)})))

      (nil? value)
      nil

      :else
      (throw (Exception. (format "Invalid value '%s': expected a DateTime." value))))))

(defn- value-ph-resolve-field [{:keys [field-placeholder value]} field-id->fields]
  (let [resolved-field (resolve-field field-placeholder field-id->fields)]
    (when-not resolved-field
      (throw (Exception. (format "Unable to resolve field: %s" field-placeholder))))
    (parse-value resolved-field value)))

(extend ValuePlaceholder
  IResolve (merge IResolveDefaults
                  {:resolve-field value-ph-resolve-field}))


;;; # ------------------------------------------------------------ IMPL ------------------------------------------------------------

(defn- collect-ids-with [f expanded-query-dict]
  (let [ids (transient #{})]
    (->> expanded-query-dict
         (walk/postwalk (fn [form]
                          (when-let [id (f form)]
                            (conj! ids id)))))
    (persistent! ids)))
(def ^:private collect-unresolved-field-ids (partial collect-ids-with unresolved-field-id))
(def ^:private collect-fk-field-ids         (partial collect-ids-with fk-field-id))

(defn- record-fk-field-ids
  "Record `:fk-field-id` referenced in the Query."
  [expanded-query-dict]
  (assoc expanded-query-dict :fk-field-ids (collect-fk-field-ids expanded-query-dict)))

(defn- resolve-fields
  "Resolve the `Fields` in an EXPANDED-QUERY-DICT.
   Record `:table-ids` referenced in the Query."
  [expanded-query-dict]
  (loop [max-iterations 5, expanded-query-dict expanded-query-dict]
    (when (< max-iterations 0)
      (throw (Exception. "Failed to resolve fields: too many iterations.")))
    (let [field-ids (collect-unresolved-field-ids expanded-query-dict)]
      (if-not (seq field-ids)
        ;; If there are no more Field IDs to resolve we're done.
        expanded-query-dict
        ;; Otherwise fetch + resolve the Fields in question
        (let [fields (->> (sel :many :id->fields [field/Field :name :display_name :base_type :special_type :preview_display :table_id :parent_id :description]
                               :id [in field-ids])
                          (m/map-vals rename-mb-field-keys)
                          (m/map-vals #(assoc % :parent (when-let [parent-id (:parent-id %)]
                                                          (map->FieldPlaceholder {:field-id parent-id})))))]
          (->>
           ;; Now record the IDs of Tables these fields references in the :table-ids property of the expanded query dict.
           ;; Those will be used for Table resolution in the next step.
           (update expanded-query-dict :table-ids set/union (set (map :table-id (vals fields))))
           ;; Walk the query and resolve all fields
           (walk/postwalk #(resolve-field % fields))
           ;; Recurse in case any new (nested) unresolved fields were found.
           (recur (dec max-iterations))))))))

(defn- resolve-database
  "Resolve the `Database` in question for an EXPANDED-QUERY-DICT."
  [{database-id :database, :as expanded-query-dict}]
  (assoc expanded-query-dict :database (sel :one :fields [Database :name :id :engine :details] :id database-id)))

(defn- join-tables-fetch-field-info
  "Fetch info for PK/FK `Fields` for the JOIN-TABLES referenced in a Query."
  [source-table-id join-tables fk-field-ids]
  (when (seq join-tables)
    (when-not (seq fk-field-ids)
      (throw (Exception. "You must use the fk-> form to reference Fields that are not part of the source_table.")))
    (let [ ;; Build a map of source table FK field IDs -> field names
          fk-field-id->field-name      (sel :many :id->field [field/Field :name], :id [in fk-field-ids], :table_id source-table-id, :special_type "fk")

          ;; Build a map of join table PK field IDs -> source table FK field IDs
          pk-field-id->fk-field-id     (sel :many :field->field [ForeignKey :destination_id :origin_id],
                                            :origin_id [in (set (keys fk-field-id->field-name))])

          ;; Build a map of join table ID -> PK field info
          join-table-id->pk-field      (let [pk-fields (sel :many :fields [field/Field :id :table_id :name], :id [in (set (keys pk-field-id->fk-field-id))])]
                                         (zipmap (map :table_id pk-fields) pk-fields))]

      ;; Now build the :join-tables clause
      (vec (for [{table-id :id, table-name :name, schema :schema} join-tables]
             (let [{pk-field-id :id, pk-field-name :name} (join-table-id->pk-field table-id)]
               (map->JoinTable {:table-id     table-id
                                :table-name   table-name
                                :schema       schema
                                :pk-field     (map->JoinTableField {:field-id   pk-field-id
                                                                    :field-name pk-field-name})
                                :source-field (let [fk-id (pk-field-id->fk-field-id pk-field-id)]
                                                (map->JoinTableField {:field-id   fk-id
                                                                      :field-name (fk-field-id->field-name fk-id)}))})))))))

(defn- resolve-tables
  "Resolve the `Tables` in an EXPANDED-QUERY-DICT."
  [{{source-table-id :source-table} :query, database-id :database, :keys [table-ids fk-field-ids], :as expanded-query-dict}]
  {:pre [(integer? source-table-id)]}
  (let [table-ids       (conj table-ids source-table-id)
        table-id->table (sel :many :id->fields [Table :schema :name :id], :id [in table-ids])
        join-tables     (vals (dissoc table-id->table source-table-id))]
    (as-> expanded-query-dict <>
      (assoc-in <> [:query :source-table] (or (table-id->table source-table-id)
                                              (throw (Exception. (format "Query expansion failed: could not find source table %d." source-table-id)))))
      (assoc-in <> [:query :join-tables]  (join-tables-fetch-field-info source-table-id join-tables fk-field-ids))
      (walk/postwalk #(resolve-table % table-id->table) <>))))


;;; # ------------------------------------------------------------ PUBLIC INTERFACE ------------------------------------------------------------

(defn resolve
  "Resolve placeholders by fetching `Fields`, `Databases`, and `Tables` that are referred to in EXPANDED-QUERY-DICT."
  [expanded-query-dict]
  (some-> expanded-query-dict
          record-fk-field-ids
          resolve-fields
          resolve-database
          resolve-tables))
