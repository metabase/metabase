(ns metabase.query-processor.middleware.resolve
  "Resolve references to `Fields`, `Tables`, and `Databases` in an expanded query dictionary. During the `expand`
  phase of the Query Processor, forms like `[:field-id 10]` are replaced with placeholder objects of types like
  `FieldPlaceholder` or similar. During this phase, we'll take those placeholder objects and fetch information from
  the DB and replace them with actual objects like `Field`."
  (:refer-clojure :exclude [resolve])
  (:require [clojure
             [set :as set]
             [walk :as walk]]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.util.date :as du]
            [metabase.models
             [database :refer [Database]]
             [field :as field]
             [setting :as setting]
             [table :refer [Table]]]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]
            [metabase.util.date :as du]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]])
  (:import java.util.TimeZone
           [metabase.query_processor.interface DateTimeField DateTimeValue ExpressionRef Field FieldLiteral FieldPlaceholder
            RelativeDatetime RelativeDateTimeValue TimeField TimeValue Value ValuePlaceholder]))

;;; ---------------------------------------------------- UTIL FNS ----------------------------------------------------

(defn rename-mb-field-keys
  "Rename the keys in a Metabase `Field` to match the format of those in Query Expander `Fields`."
  [field]
  (set/rename-keys (into {} field) {:id              :field-id
                                    :name            :field-name
                                    :display_name    :field-display-name
                                    :special_type    :special-type
                                    :visibility_type :visibility-type
                                    :database_type   :database-type
                                    :base_type       :base-type
                                    :table_id        :table-id
                                    :parent_id       :parent-id}))

(defn- rename-dimension-keys
  [dimension]
  (set/rename-keys (into {} dimension)
                   {:id                      :dimension-id
                    :name                    :dimension-name
                    :type                    :dimension-type
                    :field_id                :field-id
                    :human_readable_field_id :human-readable-field-id
                    :created_at              :created-at
                    :updated_at              :updated-at}))

(defn- rename-field-value-keys
  [field-values]
  (set/rename-keys (into {} field-values)
                   {:id                    :field-value-id
                    :field_id              :field-id
                    :human_readable_values :human-readable-values
                    :updated_at            :updated-at
                    :created_at            :created-at}))

(defn convert-db-field
  "Converts a field map from that database to a Field instance"
  [db-field]
  (-> db-field
      rename-mb-field-keys
      i/map->Field
      (update :values (fn [vals]
                        (if (seq vals)
                          (-> vals rename-field-value-keys i/map->FieldValues)
                          vals)))
      (update :dimensions (fn [dims]
                            (if (seq dims)
                              (-> dims rename-dimension-keys i/map->Dimensions)
                              dims)))))

;;; ----------------------------------------------- IRESOLVE PROTOCOL ------------------------------------------------

(defprotocol ^:private IResolve
  (^:private unresolved-field-id ^Integer [this]
   "Return the unresolved Field ID associated with this object, if any.")

  (^:private fk-field-id ^Integer [this]
   "Return a the FK Field ID (for joining) associated with this object, if any.")

  (^:private resolve-field [this, ^clojure.lang.IPersistentMap field-id->field]
   "This method is called when walking the Query after fetching `Fields`.
    Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and return their expanded form. Other
    objects should just return themselves.")

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


;;; ----------------------------------------------------- FIELD ------------------------------------------------------

(defn- field-unresolved-field-id
  "Return the ID of a unresolved Fields belonging to a Field. (This means we'll just return the ID of the parent if
  it's not yet resolved.)"
  [{:keys [parent parent-id]}]
  (or (unresolved-field-id parent)
      (when (instance? FieldPlaceholder parent)
        parent-id)))

(defn- field-resolve-field
  "Attempt to resolve the `:parent` of a `Field`, if there is one, if it's a `FieldPlaceholder`."
  [{:keys [parent parent-id], :as this} field-id->field]
  (cond
    parent    (or (when (instance? FieldPlaceholder parent)
                    (when-let [resolved (resolve-field parent field-id->field)]
                      (assoc this :parent resolved)))
                  this)
    parent-id (assoc this :parent (or (field-id->field parent-id)
                                      (i/map->FieldPlaceholder {:field-id parent-id})))
    :else     this))

(defn- field-resolve-table
  "Resolve the `Table` belonging to a resolved `Field`. (This is only used for resolving Tables referred to via
  foreign keys.)"
  [{:keys [table-id fk-field-id field-id], :as this} fk-id+table-id->table]
  ;; TODO - use schema for this instead of preconditions :D
  {:pre [(map? fk-id+table-id->table) (every? vector? (keys fk-id+table-id->table))]}
  (let [table (or (fk-id+table-id->table [fk-field-id table-id])
                  ;; if we didn't find a matching table check and see whether we're trying to use a field from another
                  ;; table without wrapping it in an fk-> form
                  (doseq [[fk table] (keys fk-id+table-id->table)
                          :when      (and fk (= table table-id))]
                    (throw (Exception. (format (str "Invalid query: Field %d belongs to table %d. Since %d is not "
                                                    "the source table, it must be wrapped in a fk-> form, e.g. "
                                                    "[fk-> %d %d].")
                                               field-id table-id table-id fk field-id))))
                  ;; Otherwise, we're using what is most likely an invalid Field ID; complain about it and give a list
                  ;; of tables that are valid
                  (throw (Exception. (format (str "Query expansion failed: could not find table %d (FK ID = %d). "
                                                  "Resolved tables ([fk-id table-id]): %s")
                                             table-id fk-field-id (keys fk-id+table-id->table)))))]
    (assoc this
      :table-name  (:name table)
      :schema-name (:schema table))))

(u/strict-extend Field
  IResolve (merge IResolveDefaults
                  {:unresolved-field-id field-unresolved-field-id
                   :resolve-field       field-resolve-field
                   :resolve-table       field-resolve-table}))


;;; ----------------------------------------------- FIELD PLACEHOLDER ------------------------------------------------

(defn- resolve-binned-field [binning-strategy binning-param field]
  (let [binned-field (i/map->BinnedField {:field    field
                                          :strategy binning-strategy})]
    (case binning-strategy
      :num-bins
      (assoc binned-field :num-bins binning-param)

      :bin-width
      (assoc binned-field :bin-width binning-param)

      :default
      binned-field

      :else
      (throw (Exception. (format "Unregonized binning strategy '%s'" binning-strategy))))))

(defn- merge-non-nils
  "Like `clojure.core/merge` but only merges non-nil values"
  [& maps]
  (apply merge-with #(or %2 %1) maps))

(defn- field-ph-resolve-field
  "Attempt to resolve the `Field` for a `FieldPlaceholder`. Return a resolved `Field` or `DateTimeField`."
  [{:keys [field-id datetime-unit binning-strategy binning-param], :as this} field-id->field]
  (if-let [{:keys [base-type special-type], :as field} (some-> (field-id->field field-id)
                                                               convert-db-field
                                                               (merge-non-nils (select-keys this [:fk-field-id :remapped-from :remapped-to :field-display-name])))]
    ;; try to resolve the Field with the ones available in field-id->field
    (cond
      (and (or (isa? base-type :type/DateTime)
               (isa? special-type :type/DateTime))
           (not (isa? base-type :type/Time)))
      (i/map->DateTimeField {:field field
                             :unit  (or datetime-unit :day)}) ; default to `:day` if a unit wasn't specified

      (isa? base-type :type/Time)
      (i/map->TimeField {:field field})

      binning-strategy
      (resolve-binned-field binning-strategy binning-param field)

      :else field)
    ;; If that fails just return ourselves as-is
    this))

(u/strict-extend FieldPlaceholder
  IResolve (merge IResolveDefaults
                  {:unresolved-field-id :field-id
                   :fk-field-id         :fk-field-id
                   :resolve-field       field-ph-resolve-field}))


;;; ----------------------------------------------- VALUE PLACEHOLDER ------------------------------------------------

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
    (let [parsed-string-date (some-> value du/->Timestamp)]
      (cond
        parsed-string-date
        (s/validate DateTimeValue (i/map->DateTimeValue {:field this, :value parsed-string-date}))

        (instance? RelativeDatetime value)
        (do (s/validate RelativeDatetime value)
            (s/validate RelativeDateTimeValue (i/map->RelativeDateTimeValue
                                               {:field this, :amount (:amount value), :unit (:unit value)})))

        (nil? value)
        nil

        :else
        (throw (Exception. (format "Invalid value '%s': expected a DateTime." value))))))

  TimeField
  (parse-value [this value]
    (let [tz-id              ^String (setting/get :report-timezone)
          tz                 (when tz-id
                               (TimeZone/getTimeZone tz-id))
          parsed-string-time (some-> value
                                     (du/str->time tz))]
      (cond
        parsed-string-time
        (s/validate TimeValue (i/map->TimeValue {:field this, :value parsed-string-time :timezone-id tz-id}))

        (nil? value)
        nil

        :else
        (throw (Exception. (format "Invalid value '%s': expected a Time." value)))))))

(defn- value-ph-resolve-field
  "Attempt to resolve the `Field` for a `ValuePlaceholder`. Return a resolved `Value` or `DateTimeValue`."
  [{:keys [field-placeholder value]} field-id->field]
  (let [resolved-field (resolve-field field-placeholder field-id->field)]
    (when-not resolved-field
      (throw (Exception. (format "Unable to resolve field: %s" field-placeholder))))
    (parse-value resolved-field value)))

(u/strict-extend ValuePlaceholder
  IResolve (merge IResolveDefaults
                  {:resolve-field value-ph-resolve-field}))


;;; ------------------------------------------------------ IMPL ------------------------------------------------------

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

(defn- add-parent-placeholder-if-needed
  "If `field` has a `:parent-id` add a `FieldPlaceholder` for its parent."
  [field]
  (assoc field :parent (when-let [parent-id (:parent-id field)]
                         (i/map->FieldPlaceholder {:field-id parent-id}))))

(defn- fetch-fields
  "Fetch a sequence of Fields with appropriate information from the database for the IDs in `field-ids`, excluding
  'sensitive' Fields. Then hydrate information that will be used by the QP and transform the keys so they're
  Clojure-style as expected by the rest of the QP code."
  [field-ids]
  (as-> (db/select [field/Field :name :display_name :base_type :special_type :visibility_type :table_id :parent_id
                    :description :id :fingerprint :database_type]
          :visibility_type [:not= "sensitive"]
          :id              [:in field-ids]) fields
    ;; hydrate values & dimensions for the `fields` we just fetched from the DB
    (hydrate fields :values :dimensions)
    ;; now for each Field call `rename-mb-field-keys` on it to take underscored DB-style names and replace them with
    ;; hyphenated Clojure-style names. (I know, this is a questionable step!)
    (map rename-mb-field-keys fields)
    ;; now add a FieldPlaceholder for its parent if the Field has a parent-id so it can get resolved on the next pass
    (map add-parent-placeholder-if-needed fields)))

(defn- resolve-fields
  "Resolve the `Fields` in an EXPANDED-QUERY-DICT. Record `:table-ids` referenced in the Query."
  [expanded-query-dict]
  (loop [max-iterations 5, expanded-query-dict expanded-query-dict]
    (when (neg? max-iterations)
      (throw (Exception. "Failed to resolve fields: too many iterations.")))
    (let [field-ids (collect-unresolved-field-ids expanded-query-dict)]
      (if-not (seq field-ids)
        ;; If there are no more Field IDs to resolve we're done.
        expanded-query-dict
        ;; Otherwise fetch + resolve the Fields in question
        (let [fields (fetch-fields field-ids)]
          (->>
           ;; Now record the IDs of Tables these fields references in the :table-ids property of the expanded query
           ;; dict. Those will be used for Table resolution in the next step.
           (update expanded-query-dict :table-ids set/union (set (map :table-id fields)))
           ;; Walk the query and resolve all fields
           (walk/postwalk (u/rpartial resolve-field (u/key-by :field-id fields)))
           ;; Recurse in case any new (nested) unresolved fields were found.
           (recur (dec max-iterations))))))))

(defn- fk-field-ids->info
  "Given a SOURCE-TABLE-ID and collection of FK-FIELD-IDS, return a sequence of maps containing IDs and identifiers
  for those FK fields and their target tables and fields. FK-FIELD-IDS are IDs of fields that belong to the source
  table. For example, SOURCE-TABLE-ID might be 'checkins' and FK-FIELD-IDS might have the IDs for 'checkins.user_id'
  and the like."
  [source-table-id fk-field-ids]
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
               :where     [:and [:in :source-fk.id       (set fk-field-ids)]
                                [:=  :source-fk.table_id source-table-id]
                                (mdb/isa :source-fk.special_type :type/FK)]})))

(defn- fk-field-ids->joined-tables
  "Fetch info for PK/FK `Fields` for the JOIN-TABLES referenced in a Query."
  [source-table-id fk-field-ids]
  (when (seq fk-field-ids)
    (vec (for [{:keys [source-field-name source-field-id target-field-id target-field-name target-table-id
                       target-table-name target-table-schema]} (fk-field-ids->info source-table-id fk-field-ids)]
           (i/map->JoinTable {:table-id     target-table-id
                              :table-name   target-table-name
                              :schema       target-table-schema
                              :pk-field     (i/map->JoinTableField {:field-id   target-field-id
                                                                    :field-name target-field-name})
                              :source-field (i/map->JoinTableField {:field-id   source-field-id
                                                                    :field-name source-field-name})
                              ;; some DBs like Oracle limit the length of identifiers to 30 characters so only take
                              ;; the first 30 here
                              :join-alias  (apply str (take 30 (str target-table-name "__via__" source-field-name)))})))))

(defn- resolve-tables
  "Resolve the `Tables` in an EXPANDED-QUERY-DICT."
  [{:keys [table-ids fk-field-ids], :as expanded-query-dict}]
  (let [{source-table-id :id :as source-table} (qputil/get-in-normalized expanded-query-dict [:query :source-table])]
    (if-not source-table-id
      ;; if we have a `source-query`, recurse and resolve tables in that
      (update-in expanded-query-dict [:query :source-query] (fn [source-query]
                                                              (if (:native source-query)
                                                                source-query
                                                                (:query (resolve-tables (assoc expanded-query-dict
                                                                                          :query source-query))))))
      ;; otherwise we can resolve tables in the (current) top-level
      (let [table-ids             (conj table-ids source-table-id)
            joined-tables         (fk-field-ids->joined-tables source-table-id fk-field-ids)
            fk-id+table-id->table (into {[nil source-table-id] source-table}
                                        (for [{:keys [source-field table-id join-alias]} joined-tables]
                                          {[(:field-id source-field) table-id] {:name join-alias
                                                                                :id   table-id}}))]
        (as-> expanded-query-dict <>
          (assoc-in <> [:query :join-tables]  joined-tables)
          (walk/postwalk #(resolve-table % fk-id+table-id->table) <>))))))

(defn- resolve-field-literals
  "When resolving a field, we connect a `field-id` with a `Field` in our metadata tables. This is a similar process
  for `FieldLiteral`s, except we are attempting to connect a `FieldLiteral` with an associated entry in the
  `result_metadata` attached to the query (typically from the `Card` of a nested query)."
  [{:keys [result_metadata] :as expanded-query-dict}]
  (let [name->fingerprint (zipmap (map :name result_metadata)
                                  (map :fingerprint result_metadata))]
    (qputil/postwalk-pred #(instance? FieldLiteral %)
                          (fn [{:keys [binning-strategy binning-param] :as node}]
                            (let [fingerprint     (get name->fingerprint (:field-name node))
                                  node-with-print (assoc node :fingerprint fingerprint)]
                              (cond
                                ;; We can't bin without min/max values found from a fingerprint
                                (and binning-strategy (not fingerprint))
                                (throw (Exception. "Binning not supported on a field literal with no fingerprint"))

                                (and fingerprint binning-strategy)
                                (resolve-binned-field binning-strategy binning-param node-with-print)

                                :else
                                node-with-print)))
                          expanded-query-dict)))


;;; ------------------------------------------------ PUBLIC INTERFACE ------------------------------------------------

(defn resolve
  "Resolve placeholders by fetching `Fields`, `Databases`, and `Tables` that are referred to in EXPANDED-QUERY-DICT."
  [expanded-query-dict]
  (some-> expanded-query-dict
          record-fk-field-ids
          resolve-fields
          resolve-field-literals
          resolve-tables))

(defn resolve-middleware
  "Wraps the `resolve` function in a query-processor middleware"
  [qp]
  (fn [{database-id :database, :as query}]
    (let [resolved-db (db/select-one [Database :name :id :engine :details :timezone], :id database-id)
          query       (if (qputil/mbql-query? query)
                        (resolve query)
                        query)]
      (qp (assoc query :database resolved-db)))))
