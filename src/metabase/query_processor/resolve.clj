(ns metabase.query-processor.resolve
  "Resolve references to `Fields`, `Tables`, and `Databases` in an expanded query dictionary."
  (:refer-clojure :exclude [resolve])
  (:require [clojure
             [set :as set]
             [walk :as walk]]
            [medley.core :as m]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.models
             [field :as field]
             [table :refer [Table]]]
            [metabase.query-processor.interface :as i]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [metabase.query_processor.interface DateTimeField DateTimeValue ExpressionRef Field FieldPlaceholder RelativeDatetime RelativeDateTimeValue Value ValuePlaceholder]))

;; # ---------------------------------------------------------------------- UTIL FNS ------------------------------------------------------------

(defn rename-mb-field-keys
  "Rename the keys in a Metabase `Field` to match the format of those in Query Expander `Fields`."
  [field]
  (set/rename-keys (into {} field) {:id              :field-id
                                    :name            :field-name
                                    :display_name    :field-display-name
                                    :special_type    :special-type
                                    :visibility_type :visibility-type
                                    :base_type       :base-type
                                    :table_id        :table-id
                                    :parent_id       :parent-id}))

;;; # ------------------------------------------------------------ IRESOLVE PROTOCOL ------------------------------------------------------------

(defprotocol ^:private IResolve
  (^:private unresolved-field-id ^Integer [this]
   "Return the unresolved Field ID associated with this object, if any.")

  (^:private fk-field-id ^Integer [this]
   "Return a the FK Field ID (for joining) associated with this object, if any.")

  (^:private resolve-field [this, ^clojure.lang.IPersistentMap field-id->field]
   "This method is called when walking the Query after fetching `Fields`.
    Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
    return their expanded form. Other objects should just return themselves.")

  (resolve-table [this, ^clojure.lang.IPersistentMap fk-id+table-id->tables]
   "Called when walking the Query after `Fields` have been resolved and `Tables` have been fetched.
    Objects like `Fields` can add relevant information like the name of their `Table`."))

(def ^:private IResolveDefaults
  {:unresolved-field-id (constantly nil)
   :fk-field-id         (constantly nil)
   :resolve-field       (fn [this _] this)
   :resolve-table       (fn [this _] this)})

(u/strict-extend Object IResolve IResolveDefaults)
(u/strict-extend nil    IResolve IResolveDefaults)


;;; ## ------------------------------------------------------------ FIELD ------------------------------------------------------------

(defn- field-unresolved-field-id [{:keys [parent parent-id]}]
  (or (unresolved-field-id parent)
      (when (instance? FieldPlaceholder parent)
        parent-id)))

(defn- field-resolve-field [{:keys [parent parent-id], :as this} field-id->field]
  (cond
    parent    (or (when (instance? FieldPlaceholder parent)
                    (when-let [resolved (resolve-field parent field-id->field)]
                      (assoc this :parent resolved)))
                  this)
    parent-id (assoc this :parent (or (field-id->field parent-id)
                                      (i/map->FieldPlaceholder {:field-id parent-id})))
    :else     this))

(defn- field-resolve-table [{:keys [table-id fk-field-id field-id], :as this} fk-id+table-id->table]
  {:pre [(map? fk-id+table-id->table) (every? vector? (keys fk-id+table-id->table))]}
  (let [table (or (fk-id+table-id->table [fk-field-id table-id])
                  ;; if we didn't find a matching table check and see whether we're trying to use a field from another table without wrapping it in an fk-> form
                  (doseq [[fk table] (keys fk-id+table-id->table)
                          :when      (and fk (= table table-id))]
                    (throw (Exception. (format "Invalid query: Field %d belongs to table %d. Since %d is not the source table, it must be wrapped in a fk-> form, e.g. [fk-> %d %d]."
                                               field-id table-id table-id fk field-id))))
                  ;; Otherwise, we're using what is most likely an invalid Field ID; complain about it and give a list of tables that are valid
                  (throw (Exception. (format "Query expansion failed: could not find table %d (FK ID = %d). Resolved tables ([fk-id table-id]): %s" table-id fk-field-id (keys fk-id+table-id->table)))))]
    (assoc this
      :table-name  (:name table)
      :schema-name (:schema table))))

(u/strict-extend Field
  IResolve (merge IResolveDefaults
                  {:unresolved-field-id field-unresolved-field-id
                   :resolve-field       field-resolve-field
                   :resolve-table       field-resolve-table}))


;;; ## ------------------------------------------------------------ FIELD PLACEHOLDER ------------------------------------------------------------

(defn- field-ph-resolve-field [{:keys [field-id datetime-unit fk-field-id], :as this} field-id->field]
  (if-let [{:keys [base-type special-type], :as field} (some-> (field-id->field field-id)
                                                               i/map->Field
                                                               (assoc :fk-field-id fk-field-id))]
    ;; try to resolve the Field with the ones available in field-id->field
    (let [datetime-field? (or (isa? base-type :type/DateTime)
                              (isa? special-type :type/DateTime))]
      (if-not datetime-field?
        field
        (i/map->DateTimeField {:field field
                               :unit  (or datetime-unit :day)}))) ; default to `:day` if a unit wasn't specified
    ;; If that fails just return ourselves as-is
    this))

(u/strict-extend FieldPlaceholder
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
    (s/validate Value (i/map->Value {:field this, :value value})))

  ExpressionRef
  (parse-value [this value]
    (s/validate Value (i/map->Value {:field this, :value value})))

  DateTimeField
  (parse-value [this value]
    (cond
      (u/date-string? value)
      (s/validate DateTimeValue (i/map->DateTimeValue {:field this, :value (u/->Timestamp value)}))

      (instance? RelativeDatetime value)
      (do (s/validate RelativeDatetime value)
          (s/validate RelativeDateTimeValue (i/map->RelativeDateTimeValue {:field this, :amount (:amount value), :unit (:unit value)})))

      (nil? value)
      nil

      :else
      (throw (Exception. (format "Invalid value '%s': expected a DateTime." value))))))

(defn- value-ph-resolve-field [{:keys [field-placeholder value]} field-id->field]
  (let [resolved-field (resolve-field field-placeholder field-id->field)]
    (when-not resolved-field
      (throw (Exception. (format "Unable to resolve field: %s" field-placeholder))))
    (parse-value resolved-field value)))

(u/strict-extend ValuePlaceholder
  IResolve (merge IResolveDefaults
                  {:resolve-field value-ph-resolve-field}))


;;; # ------------------------------------------------------------ IMPL ------------------------------------------------------------

(defn- collect-ids-with [f expanded-query-dict]
  (let [ids (transient #{})]
    (walk/postwalk (fn [form]
                     (when-let [id (f form)]
                       (conj! ids id)))
                   expanded-query-dict)
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
    (when (neg? max-iterations)
      (throw (Exception. "Failed to resolve fields: too many iterations.")))
    (let [field-ids (collect-unresolved-field-ids expanded-query-dict)]
      (if-not (seq field-ids)
        ;; If there are no more Field IDs to resolve we're done.
        expanded-query-dict
        ;; Otherwise fetch + resolve the Fields in question
        (let [fields (->> (u/key-by :id (db/select [field/Field :name :display_name :base_type :special_type :visibility_type :table_id :parent_id :description :id]
                                          :visibility_type [:not= "sensitive"]
                                          :id [:in field-ids]))
                          (m/map-vals rename-mb-field-keys)
                          (m/map-vals #(assoc % :parent (when-let [parent-id (:parent-id %)]
                                                          (i/map->FieldPlaceholder {:field-id parent-id})))))]
          (->>
           ;; Now record the IDs of Tables these fields references in the :table-ids property of the expanded query dict.
           ;; Those will be used for Table resolution in the next step.
           (update expanded-query-dict :table-ids set/union (set (map :table-id (vals fields))))
           ;; Walk the query and resolve all fields
           (walk/postwalk (u/rpartial resolve-field fields))
           ;; Recurse in case any new (nested) unresolved fields were found.
           (recur (dec max-iterations))))))))

(defn- fk-field-ids->info [source-table-id fk-field-ids]
  (when (seq fk-field-ids)
    (db/query {:select    [[:source-fk.name      :source-field-name]
                           [:source-fk.id        :source-field-id]
                           [:target-pk.id        :target-field-id]
                           [:target-pk.name      :target-field-name]
                           [:target-table.id     :target-table-id]
                           [:target-table.name   :target-table-name]
                           [:target-table.schema :target-table-schema]]
               :from      [[field/Field :source-fk]]
               :left-join [[field/Field :target-pk] [:= :source-fk.fk_target_field_id :target-pk.id]
                           [Table :target-table]    [:= :target-pk.table_id :target-table.id]]
               :where     [:and [:in :source-fk.id      (set fk-field-ids)]
                                [:=  :source-fk.table_id     source-table-id]
                                (mdb/isa :source-fk.special_type :type/FK)]})))

(defn- fk-field-ids->joined-tables
  "Fetch info for PK/FK `Fields` for the JOIN-TABLES referenced in a Query."
  [source-table-id fk-field-ids]
  (when (seq fk-field-ids)
    (vec (for [{:keys [source-field-name source-field-id target-field-id target-field-name target-table-id target-table-name target-table-schema]} (fk-field-ids->info source-table-id fk-field-ids)]
           (i/map->JoinTable {:table-id     target-table-id
                              :table-name   target-table-name
                              :schema       target-table-schema
                              :pk-field     (i/map->JoinTableField {:field-id   target-field-id
                                                                    :field-name target-field-name})
                              :source-field (i/map->JoinTableField {:field-id   source-field-id
                                                                    :field-name source-field-name})
                              ;; some DBs like Oracle limit the length of identifiers to 30 characters so only take the first 30 here
                              :join-alias  (apply str (take 30 (str target-table-name "__via__" source-field-name)))})))))

(defn- resolve-tables
  "Resolve the `Tables` in an EXPANDED-QUERY-DICT."
  [{{source-table-id :source-table} :query, :keys [table-ids fk-field-ids], :as expanded-query-dict}]
  {:pre [(integer? source-table-id)]}
  (let [table-ids             (conj table-ids source-table-id)
        source-table          (or (db/select-one [Table :schema :name :id], :id source-table-id)
                                  (throw (Exception. (format "Query expansion failed: could not find source table %d." source-table-id))))
        joined-tables         (fk-field-ids->joined-tables source-table-id fk-field-ids)
        fk-id+table-id->table (into {[nil source-table-id] source-table}
                                    (for [{:keys [source-field table-id join-alias]} joined-tables]
                                      {[(:field-id source-field) table-id] {:name join-alias
                                                                            :id   table-id}}))]
    (as-> expanded-query-dict <>
      (assoc-in <> [:query :source-table] source-table)
      (assoc-in <> [:query :join-tables]  joined-tables)
      (walk/postwalk #(resolve-table % fk-id+table-id->table) <>))))


;;; # ------------------------------------------------------------ PUBLIC INTERFACE ------------------------------------------------------------

(defn resolve
  "Resolve placeholders by fetching `Fields`, `Databases`, and `Tables` that are referred to in EXPANDED-QUERY-DICT."
  [expanded-query-dict]
  (some-> expanded-query-dict
          record-fk-field-ids
          resolve-fields
          resolve-tables))
