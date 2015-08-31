(ns metabase.driver.query-processor.resolve
  "Resolve references to `Fields`, `Tables`, and `Databases` in an expanded query dictionary."
  (:refer-clojure :exclude [resolve])
  (:require (clojure [set :as set]
                     [walk :as walk])
            [medley.core :as m]
            [swiss.arrows :refer [-<>]]
            [metabase.db :refer [sel]]
            (metabase.driver.query-processor [interface :refer :all]
                                             [parse :as parse])
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]]))
  (:import (metabase.driver.query_processor.interface Field
                                                      FieldPlaceholder
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

;;; # ------------------------------------------------------------ MULTIMETHODS - INTERNAL ------------------------------------------------------------

;; Return the unresolved Field ID associated with this object, if any.
(defmulti unresolved-field-id class)

(defmethod unresolved-field-id :default [_]
  nil)

;; Return a the FK Field ID (for joining) associated with this object, if any.
(defmulti fk-field-id class)

(defmethod fk-field-id :default [_]
  nil)

;; This method is called when walking the Query after fetching `Fields`.
;; Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
;; return their expanded form. Other objects should just return themselves.
(defmulti resolve-field (fn [this field-id->fields]
                          (class this)))

(defmethod resolve-field :default [this _]
  this)

;; Called when walking the Query after `Fields` have been resolved and `Tables` have been fetched.
;; Objects like `Fields` can add relevant information like the name of their `Table`.
(defmulti resolve-table (fn [this table-id->tables]
                          (class this)))

(defmethod resolve-table :default [this _]
  this)


;; ## Field
(defmethod unresolved-field-id Field [{:keys [parent parent-id]}]
  (or (unresolved-field-id parent)
      (when (instance? FieldPlaceholder parent)
        parent-id)))

(defmethod resolve-field Field [{:keys [parent parent-id], :as this} field-id->fields]
  (cond
    parent    (or (when (instance? FieldPlaceholder parent)
                    (when-let [resolved (resolve-field parent field-id->fields)]
                      (assoc this :parent resolved)))
                  this)
    parent-id (assoc this :parent (or (field-id->fields parent-id)
                                      (map->FieldPlaceholder {:field-id parent-id})))
    :else     this))

(defmethod resolve-table Field [{:keys [table-id], :as this} table-id->table]
  (assoc this :table-name (:name (or (table-id->table table-id)
                                     (throw (Exception. (format "Query expansion failed: could not find table %d." table-id)))))))


;; ## FieldPlaceholder
(defmethod unresolved-field-id FieldPlaceholder [{:keys [field-id]}]
    field-id)

(defmethod fk-field-id FieldPlaceholder [{:keys [fk-field-id]}]
  fk-field-id)

(defmethod resolve-field FieldPlaceholder [{:keys [field-id, datetime-unit], :as this} field-id->fields]
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


;; ## ValuePlaceholder
(defmethod resolve-field ValuePlaceholder [{:keys [field-placeholder value], :as this} field-id->fields]
  (let [resolved-field (resolve-field field-placeholder field-id->fields)]
    (when-not resolved-field
      (throw (Exception. (format "Unable to resolve field: %s" field-placeholder))))
    (parse/parse-value resolved-field value)))


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
      (vec (for [{table-id :id, table-name :name} join-tables]
             (let [{pk-field-id :id, pk-field-name :name} (join-table-id->pk-field table-id)]
               (map->JoinTable {:table-id     table-id
                                :table-name   table-name
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
        table-id->table (sel :many :id->fields [Table :name :id] :id [in table-ids])
        join-tables     (vals (dissoc table-id->table source-table-id))]

    (-<> expanded-query-dict
         (assoc-in [:query :source-table] (or (table-id->table source-table-id)
                                              (throw (Exception. (format "Query expansion failed: could not find source table %d." source-table-id)))))
         (assoc-in [:query :join-tables]  (join-tables-fetch-field-info source-table-id join-tables fk-field-ids))
         (walk/postwalk #(resolve-table % table-id->table) <>))))


;;; # ------------------------------------------------------------ PUBLIC INTERFACE ------------------------------------------------------------

(defn resolve [expanded-query-dict]
  (some-> expanded-query-dict
          record-fk-field-ids
          resolve-fields
          resolve-database
          resolve-tables))
