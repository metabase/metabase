(ns metabase.driver.query-processor.resolve
  "Resolve references to `Fields`, `Tables`, and `Databases` in an expanded query dictionary."
  (:refer-clojure :exclude [resolve])
  (:require (clojure [set :as set]
                     [walk :as walk])
            [medley.core :as m]
            [swiss.arrows :refer [-<>]]
            [metabase.db :refer [sel]]
            [metabase.driver.query-processor.interface :refer :all]
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

;;; # ------------------------------------------------------------ IRESOLVE PROTOCOL (INTERNAL) ------------------------------------------------------------

(defprotocol IResolve
  "Methods called during `Field` and `Table` resolution. Placeholder types should implement this protocol."
  (unresolved-field-id [this]
    "Return the unresolved Field ID associated with this object, if any.")
  (fk-field-id [this]
    "Return a the FK Field ID (for joining) associated with this object, if any.")
  (resolve-field [this field-id->fields]
    "This method is called when walking the Query after fetching `Fields`.
     Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
     return their expanded form. Other objects should just return themselves.")
  (resolve-table [this table-id->tables]
    "Called when walking the Query after `Fields` have been resolved and `Tables` have been fetched.
     Objects like `Fields` can add relevant information like the name of their `Table`."))

(extend Object
  IResolve {:unresolved-field-id (constantly nil)
            :fk-field-id         (constantly nil)
            :resolve-field       (fn [this _] this)
            :resolve-table       (fn [this _] this)})

(extend nil
  IResolve {:unresolved-field-id (constantly nil)
            :fk-field-id         (constantly nil)
            :resolve-field       (constantly nil)
            :resolve-table       (constantly nil)})

(extend-protocol IResolve
  Field
  (unresolved-field-id [{:keys [parent parent-id]}]
    (or (unresolved-field-id parent)
        parent-id))

  (fk-field-id [_] nil)

  (resolve-field [{:keys [parent parent-id], :as this} field-id->fields]
    (cond
      parent    (if (= (type parent) Field)
                  this
                  (resolve-field parent field-id->fields))
      parent-id (assoc this :parent (or (field-id->fields parent-id)
                                        (map->FieldPlaceholder {:field-id parent-id})))
      :else     this))

  (resolve-table [{:keys [table-id], :as this} table-id->table]
    (assoc this :table-name (:name (or (table-id->table table-id)
                                       (throw (Exception. (format "Query expansion failed: could not find table %d." table-id)))))))


  FieldPlaceholder
  (unresolved-field-id [{:keys [field-id]}]
    field-id)

  (fk-field-id [{:keys [fk-field-id]}]
    fk-field-id)

  (resolve-field [this field-id->fields]
    (or
     ;; try to resolve the Field with the ones available in field-id->fields
     (some->> (field-id->fields (:field-id this))
              (merge (select-keys this [:value]))
              map->Field)
     ;; If that fails just return ourselves as-is
     this))


  ValuePlaceholder
  (unresolved-field-id [{:keys [field-id]}]
    field-id)

  (fk-field-id [_] nil)

  (resolve-field [this field-id->fields]
    (let [resolved-field (field-id->fields (:field-id this))]
      (when-not resolved-field
        (throw (Exception. (format "Unable to resolve field: %d" (:field-id this)))))
      (map->Value (merge this (select-keys resolved-field [:base-type :special-type :field-id :field-name]))))))


;;; # ------------------------------------------------------------ IMPL ------------------------------------------------------------

(defn- collect-ids-with [f expanded-query-dict]
  (let [ids (transient #{})]
    (->> expanded-query-dict
         (walk/postwalk (fn [form]
                          (when-let [id (f form)]
                            (conj! ids id)))))
    (let [ids (persistent! ids)]
      (when (seq ids) ids))))
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
  (let [field-ids (collect-unresolved-field-ids expanded-query-dict)]
    (if-not field-ids
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
         recur)))))

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
