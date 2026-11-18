(ns metabase.warehouse-schema.models.field
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.serialization.core :as serialization]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.app-db-copy :as warehouse-schema.app-db-copy]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.humanization :as humanization]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [metabase.warehouse-schema.xrays :as warehouse-schema.xrays]
   [metabase.warehouses.models.database :as database]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(comment metabase.lib.schema.metadata/keep-me)

(p/import-def metabase.lib.schema.metadata/column-visibility-types visibility-types)

(def data-sensitivity-types
  "Possible values for a Field's `:data_sensitivity`, most severe first. See
  [[metabase.lib.schema.metadata/column-data-sensitivity-types]]."
  metabase.lib.schema.metadata/column-data-sensitivity-types)

(methodical/defmethod t2/table-name :model/Field [_model] :metabase_field)

(methodical/defmethod t2/model-for-automagic-hydration [:default :destination]          [_model _k]  :model/Field)
(methodical/defmethod t2/model-for-automagic-hydration [:default :field]                [_model _k]  :model/Field)
(methodical/defmethod t2/model-for-automagic-hydration [:default :origin]               [_model _k]  :model/Field)
(methodical/defmethod t2/model-for-automagic-hydration [:default :human_readable_field] [_model _k]  :model/Field)

(defn- hierarchy-keyword-in [column-name & {:keys [ancestor-types]}]
  (fn [k]
    (when-let [k (some-> k keyword)]
      (when-not (some
                 (partial isa? k)
                 ancestor-types)
        (let [message (tru "Invalid value for Field column {0}: {1} is not a descendant of any of these types: {2}"
                           (pr-str column-name) (pr-str k) (pr-str ancestor-types))]
          (throw (ex-info message
                          {:status-code       400
                           :errors            {column-name message}
                           :value             k
                           :allowed-ancestors ancestor-types}))))
      (u/qualified-name k))))

(defn- hierarchy-keyword-out [column-name & {:keys [fallback-type ancestor-types]}]
  (fn [s]
    (when (seq s)
      (let [k (keyword s)]
        (if (some
             (partial isa? k)
             ancestor-types)
          k
          (do
            (log/warnf "Invalid Field %s %s: falling back to %s" column-name k fallback-type)
            fallback-type))))))

(def ^:private transform-field-base-type
  {:in  (hierarchy-keyword-in  :base_type :ancestor-types [:type/*])
   :out (hierarchy-keyword-out :base_type :ancestor-types [:type/*], :fallback-type :type/*)})

(def transform-field-effective-type
  "Transform effective_type"
  {:in  (hierarchy-keyword-in  :effective_type :ancestor-types [:type/*])
   :out (hierarchy-keyword-out :effective_type :ancestor-types [:type/*], :fallback-type :type/*)})

(def transform-field-semantic-type
  "Transform semantic_type"
  {:in  (hierarchy-keyword-in  :semantic_type :ancestor-types [:Semantic/* :Relation/*])
   :out (hierarchy-keyword-out :semantic_type :ancestor-types [:Semantic/* :Relation/*], :fallback-type nil)})

(def transform-field-coercion-strategy
  "Transform coercion_strategy"
  {:in  (hierarchy-keyword-in  :coercion_strategy :ancestor-types [:Coercion/*])
   :out (hierarchy-keyword-out :coercion_strategy :ancestor-types [:Coercion/*], :fallback-type nil)})

(defn- maybe-parse-semantic-numeric-values [maybe-double-value]
  (if (string? maybe-double-value)
    (or (u/ignore-exceptions (Double/parseDouble maybe-double-value)) maybe-double-value)
    maybe-double-value))

(defn- update-semantic-numeric-values
  "When fingerprinting decimal columns, NaN and Infinity values are possible. Serializing these values to JSON just
  yields a string, not a value double. This function will attempt to coerce any of those values to double objects"
  [fingerprint]
  (m/update-existing-in fingerprint [:type :type/Number]
                        (partial m/map-vals maybe-parse-semantic-numeric-values)))

(def ^:private transform-json-fingerprints
  {:in  mi/json-in
   :out (comp update-semantic-numeric-values mi/json-out-with-keywordization)})

(def ^:private field-transforms
  {:base_type         transform-field-base-type
   :effective_type    transform-field-effective-type
   :coercion_strategy transform-field-coercion-strategy
   :semantic_type     transform-field-semantic-type
   :visibility_type   mi/transform-keyword
   :has_field_values  mi/transform-keyword
   :data_sensitivity  mi/transform-keyword
   :fingerprint       transform-json-fingerprints
   :settings          mi/transform-json
   :nfc_path          mi/transform-json
   :json_unfolding    mi/transform-boolean})

(t2/deftransforms :model/Field field-transforms)

(doto :model/Field
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/events)
  ;; Deliberately **not** deriving from `:hook/entity-id` because we should not be randomizing the `entity_id`s on
  ;; databases, tables or fields. Since the sync process can create them in multiple instances, randomizing them would
  ;; cause duplication rather than good matching if the two instances are later linked by serdes.
  #_(derive :hook/entity-id))

(defmethod events/spec :model/Field
  [_model]
  {:create :event/field-create
   :update :event/field-update
   :delete :event/field-delete})

(defmethod change-log/spec :model/Field [_model]
  {:track [:name :base_type :semantic_type :active :description :preview_display :position :table_id :parent_id
           :display_name :visibility_type :fk_target_field_id :points_of_interest :caveats :database_type
           :has_field_values :settings :database_position :custom_position :effective_type :coercion_strategy
           :nfc_path :database_required :json_unfolding :database_is_auto_increment :database_partitioned
           :database_is_pk :database_is_nullable :database_is_generated :database_default :data_sensitivity]
   :skip  [:database_indexed :dimension_interestingness :fingerprint :fingerprint_version :last_analyzed
           :is_defective_duplicate :unique_field_helper]})

(defmethod app-db-copy/spec :model/Field [_model]
  {:skip?     false
   :select    warehouse-schema.db/copy-fields-select
   :transform warehouse-schema.app-db-copy/transform-field})

(t2/define-after-select :model/Field
  [field]
  (dissoc field :is_defective_duplicate :unique_field_helper))

(defn- enforce-effective-type-invariant
  "GHY-3388 invariant: a Field row with no coercion_strategy must have effective_type=base_type.
   When effective_type is set but diverges from base_type without a coercion to justify it, this
   normalizes effective_type to match base_type (and logs a warning so the silent fix is visible).
   Does not touch rows where coercion_strategy is set (legitimate divergence), where effective_type
   is nil (separate concern, GHY-3367 territory), or where either type is not a valid descendant of
   :type/* (so the transform's invalid-type validation still fires)."
  [field]
  (let [coercion      (:coercion_strategy field)
        effective-raw (:effective_type field)
        base-raw      (:base_type field)
        effective     (some-> effective-raw keyword)
        base          (some-> base-raw keyword)]
    (if (and (nil? coercion)
             effective
             base
             (isa? effective :type/*)
             (isa? base :type/*)
             (not= effective base))
      (do (log/warnf "Field %s: effective_type %s ≠ base_type %s with no coercion_strategy. Normalizing effective_type to match base_type."
                     (or (:id field) (:name field) "<new>")
                     effective
                     base)
          (assoc field :effective_type base-raw))
      field)))

(defn- coercion-strategy
  "The `:coercion_strategy` of `field` as a keyword, or nil when it has none or one the column does not take."
  [field]
  (let [coercion (some-> (:coercion_strategy field) keyword)]
    (when (isa? coercion :Coercion/*)
      coercion)))

(defn- coercion-changes
  "The `:coercion_strategy` and `:effective_type` to write for `field` given the columns `changes` writes: the effective
  type of a newly set strategy that comes without one, and neither once the `:base_type` moves away from the strategy."
  [{:keys [base_type] :as field} changes]
  (when-let [coercion (coercion-strategy field)]
    (cond
      (and (contains? changes :coercion_strategy) (not (contains? changes :effective_type)))
      {:effective_type (types/effective-type-for-coercion coercion)}

      (and (contains? changes :base_type)
           (not (contains? changes :coercion_strategy))
           (not (types/is-coercible-from? coercion (keyword base_type))))
      {:coercion_strategy nil, :effective_type base_type})))

(defn- check-fk-target
  "Throws a 400 unless the `:fk_target_field_id` of `field` is a Field of the Database of its Table."
  [{:keys [table_id fk_target_field_id]}]
  (let [target-database-id (get (warehouse-schema.db/field-database-ids #{fk_target_field_id}) fk_target_field_id)]
    (api/checkp target-database-id :fk_target_field_id (tru "Invalid target field"))
    (api/checkp (= target-database-id (warehouse-schema.db/table-database-id table_id))
                :fk_target_field_id (tru "Target field must belong to the same database"))))

(defn nested-fields-pattern
  "The SQL LIKE pattern matching the NFC paths of the Fields nested in the JSON Field named `field-name`."
  [field-name]
  (str "[\"" field-name "\",%]"))

(t2/define-before-insert :model/Field
  [field]
  (let [field (merge field
                     {:display_name (:display_name field (humanization/name->human-readable-name (:name field)))}
                     (coercion-changes field field))]
    (when (:fk_target_field_id field)
      (check-fk-target field))
    (enforce-effective-type-invariant field)))

(t2/define-before-update :model/Field
  [{:keys [id table_id] :as field}]
  (let [changes (t2/changes field)
        field   (merge field (coercion-changes field changes))]
    (when (contains? changes :table_id)
      (throw (ex-info (tru "You cannot move a Field to another Table.") {:status-code 400})))
    (when (and (contains? changes :fk_target_field_id) (:fk_target_field_id field))
      (check-fk-target field))
    (when (false? (:active changes))
      (warehouse-schema.db/clear-user-settings-fk-targets-to-field! id)
      (warehouse-schema.db/clear-fk-targets-to-field! id)
      (warehouse-schema.db/delete-dimensions-reading-field! id))
    (when (:display_name changes)
      (warehouse-schema.db/rename-dimension-for-field! id (:display_name field)))
    (when (contains? changes :json_unfolding)
      (warehouse-schema.db/set-nested-fields-active! table_id
                                                     (nested-fields-pattern (:name field))
                                                     (boolean (:json_unfolding field))))
    (enforce-effective-type-invariant field)))

(t2/define-before-delete :model/Field
  [field]
  ;; Cascading deletes through parent_id cannot be done with foreign key constraints in the database
  ;; because parent_id contributes to a generated column, and MySQL doesn't support columns with cascade delete
  ;; foreign key constraints in generated columns. #44866
  (warehouse-schema.db/delete-child-fields! (:id field)))

(defn- check-permission-keys
  "Throws unless `field` has its Table, hydrated or by `:table_id`, which its permission hydrations read."
  [field]
  (api/check-500 (or (some? (:table field)) (some? (:table_id field))) "No :table_id is set for a Field."))

(defn- hydrate-table-permission
  "Sets on each of `fields` the answer of its Table for `k`, `:can_read` or `:can_query`, the Tables answered
  together."
  [k fields]
  (let [rows   (into [] (remove nil?) fields)
        _      (run! check-permission-keys rows)
        tables (into {} (keep (fn [{:keys [table]}] (when table [(:id table) table]))) rows)
        ids    (into [] (comp (map :table_id) (remove nil?) (remove tables) (distinct)) rows)
        tables (cond-> tables
                 (seq ids) (into (map (juxt :id identity)) (warehouse-schema.db/tables-by-ids ids)))
        flags  (into {} (map (juxt :id (if (= k :can_read) mi/can-read? mi/can-query?))) (t2/hydrate (vals tables) k))]
    (for [field fields]
      (when field
        (let [answer (boolean (get flags (or (:id (:table field)) (:table_id field))))]
          (if (= k :can_read)
            (vary-meta field assoc k answer)
            (assoc field k answer)))))))

(methodical/defmethod t2/batched-hydrate [:model/Field :can_read]
  "Whether the current user can read each of `fields`, which they can when they read its Table."
  [_model k fields]
  (hydrate-table-permission k fields))

(methodical/defmethod t2/batched-hydrate [:model/Field :can_query]
  "Whether the current user can query each of `fields`, which they can when they query its Table."
  [_model k fields]
  (hydrate-table-permission k fields))

(defenterprise current-user-can-write-field?
  "OSS implementation: whether the current user, a superuser, can write the field `instance`, which nobody can when a
  read-only instance syncs its table."
  metabase-enterprise.advanced-permissions.common
  [instance]
  (let [table (or (:table instance)
                  (warehouse-schema.db/table (:table_id instance)))]
    (and (collection/remote-sync-writable-table? table)
         (mi/superuser?))))

(methodical/defmethod t2/batched-hydrate [:model/Field :can_write]
  "Whether the current user can change the metadata of each of `fields`, their Tables hydrated first."
  [_model k fields]
  (let [writable (u/index-by :id (comp boolean current-user-can-write-field?) (t2/hydrate (remove nil? fields) :table))]
    (for [field fields]
      (when field
        (assoc field k (boolean (get writable (:id field))))))))

;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn values
  "Return the `FieldValues` associated with this `field`."
  [{:keys [id]}]
  (warehouse-schema.db/full-field-values-rows id))

(mu/defn nested-field-names->field-id :- [:maybe ms/PositiveInt]
  "Recursively find the field id for a nested field name, return nil if not found.
  Nested field here refer to a field that has another field as its parent_id, like nested field in Mongo DB.

  This is to differentiate from the json nested field in, which the path is defined in metabase_field.nfc_path."
  [table-id    :- ms/PositiveInt
   field-names :- [:sequential ms/NonBlankString]]
  (loop [field-names field-names
         field-id    nil]
    (if (seq field-names)
      (let [field-name (first field-names)
            field-id   (warehouse-schema.db/field-id-by-name table-id field-id field-name)]
        (if field-id
          (recur (rest field-names) field-id)
          nil))
      field-id)))

(defn- index-by-field-id
  "Call `fetch-fn` with the IDs of `fields` and return a map of Field ID -> the fetched instance related to it by its
  `field_id` FK. This only returns a single instance for each Field! Duplicates are discarded!

    (index-by-field-id [(Field 1) (Field 2)] warehouse-schema.db/dimensions-for-fields)
    ;; -> {1 #Dimension{...}, 2 #Dimension{...}}"
  [fields fetch-fn]
  (let [field-ids (set (map :id fields))]
    (m/index-by :field_id (when (seq field-ids)
                            (fetch-fn field-ids)))))

(mi/define-batched-hydration-method with-values
  :values
  "Efficiently hydrate the `FieldValues` for a collection of `fields`."
  [fields]
  ;; In 44 we added a new concept of Advanced FieldValues, so FieldValues are no longer have an one-to-one relationship
  ;; with Field. See the doc in [[metabase.warehouse-schema.models.field-values]] for more.
  ;; We filter down to only :type =:full values, as they contain configured labels which must be preserved. The Advanced
  ;; FieldValues can then be regenerated without loss given these Full entities.
  (let [id->field-values (index-by-field-id fields #(warehouse-schema.db/full-field-values-by-field :model/FieldValues %))]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(mi/define-batched-hydration-method with-normal-values
  :normal_values
  "Efficiently hydrate the `FieldValues` for visibility_type normal `fields`."
  [fields]
  (let [id->field-values (index-by-field-id (filter field-values/field-should-have-field-values? fields)
                                            #(warehouse-schema.db/full-field-values-by-field
                                              [:model/FieldValues :id :human_readable_values :values :field_id]
                                              %))]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(mi/define-batched-hydration-method with-dimensions
  :dimensions
  "Efficiently hydrate the `Dimension` for a collection of `fields`.

  NOTE! Despite the name, this only returns at most one dimension. This is for historic reasons; see #13350 for more
  details.

  Despite the weirdness, this used to be even worse -- due to a bug in the code, this originally returned a *map* if
  there was a matching Dimension, or an empty vector if there was not. In 0.46.0 I fixed this to return either a
  vector with the matching Dimension, or an empty vector. At least the response shape is consistent now. Maybe in the
  future we can change this key to `:dimension` and return it that way. -- Cam"
  [fields]
  (let [id->dimensions (index-by-field-id fields warehouse-schema.db/dimensions-for-fields)]
    (for [field fields
          :let  [dimension (get id->dimensions (:id field))]]
      (assoc field :dimensions (if dimension [dimension] [])))))

(defn- field->has-field-values-input
  "Build the minimal Lib-style column map that [[lib/infer-has-field-values]] reads.

  Going through [[metabase.lib-be.core/instance->metadata]] here would run a full Malli coercion over the ~90-key
  `::lib.schema.metadata/column` schema for every Field, which dominates the cost of endpoints that hydrate whole
  databases. The three keys below are the only ones `infer-has-field-values` looks at, and `deftransforms` has already
  keywordized them. `mu/defn` still validates this map in dev and test."
  [field]
  {:base-type        (:base_type field)
   :effective-type   (:effective_type field)
   :has-field-values (:has_field_values field)})

(methodical/defmethod t2.hydrate/simple-hydrate [#_model :default #_k :has_field_values]
  "Infer what the value of the `has_field_values` should be for Fields where it's not set. See documentation for
  [[metabase.lib.schema.metadata/column-has-field-values-options]] for a more detailed explanation of what these
  values mean.

  This does one important thing: if `:has_field_values` is already present and set to `:auto-list`, it is replaced by
  `:list` -- presumably because the frontend doesn't need to know `:auto-list` even exists?
  See [[lib/infer-has-field-values]] for more info."
  [_model k field]
  (when field
    (assoc field k (lib/infer-has-field-values (field->has-field-values-input field)))))

(methodical/defmethod t2.hydrate/needs-hydration? [#_model :default #_k :has_field_values]
  "Always (re-)hydrate `:has_field_values`. This is used to convert an existing value of `:auto-list` to
  `:list` (see [[lib/infer-has-field-values]])."
  [_model _k _field]
  true)

(defn readable-fields-only
  "The readable `fields`, checked against their hydrated Tables."
  [fields]
  (for [field (t2/hydrate fields :table :can_read)
        :when (mi/can-read? field)]
    (dissoc field :table)))

(mi/define-batched-hydration-method with-targets
  :target
  "Efficiently hydrate the FK target fields for a collection of `fields`."
  [fields]
  (let [target-field-ids (set (for [field fields
                                    :when (and (isa? (:semantic_type field) :type/FK)
                                               (:fk_target_field_id field))]
                                (:fk_target_field_id field)))
        id->target-field (m/index-by :id (when (seq target-field-ids)
                                           (readable-fields-only (warehouse-schema.db/fields target-field-ids))))]
    (for [field fields
          :let  [target-id (:fk_target_field_id field)]]
      (assoc field :target (id->target-field target-id)))))

(defn qualified-name-components
  "Return the pieces that represent a path to `field`, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (vec (if-let [parent (warehouse-schema.db/field parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name, schema :schema} (warehouse-schema.db/table-name-and-schema table-id)]
                 (conj (when schema
                         [schema])
                       table-name))))
        field-name))

(defn qualified-name
  "Return a combined qualified name for `field`, e.g. `table_name.parent_field_name.field_name`."
  [field]
  (str/join \. (qualified-name-components field)))

(def ^{:arglists '([field-id])} field-id->table-id
  "Return the ID of the Table this Field belongs to."
  (mdb/memoize-for-application-db
   (fn [field-id]
     {:pre [(integer? field-id)]}
     (warehouse-schema.db/field-table-id field-id))))

(defn field-id->database-id
  "Return the ID of the Database this Field belongs to."
  [field-id]
  {:pre [(integer? field-id)]}
  (let [table-id (field-id->table-id field-id)]
    (database/table-id->database-id table-id)))

(defn table
  "Return the `Table` associated with this `Field`."
  {:arglists '([field])}
  [{:keys [table_id]}]
  (warehouse-schema.db/table table_id))

(methodical/defmethod t2/batched-hydrate [:model/Field :parent]
  [_model k fields]
  (mi/instances-with-hydrated-data
   fields k
   #(warehouse-schema.db/fields-by-id (map :parent_id fields))
   :parent_id))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod xrays/spec :model/Field [_model]
  {:related    warehouse-schema.xrays/field-related
   :definition warehouse-schema.xrays/field-definition})

(defmethod serialization/spec :model/Field [_]
  {:schema        ::warehouse-schema.schema/external-field
   :identity      [:table_id :parent_id :name]
   :copy          [:active :base_type :caveats :coercion_strategy :data_sensitivity :database_default
                   :database_indexed :database_is_auto_increment :database_is_generated :database_is_nullable
                   :database_is_pk :database_partitioned :database_position :database_required :database_type
                   :description :display_name :effective_type :has_field_values
                   :json_unfolding :name :nfc_path :points_of_interest :position :preview_display :semantic_type
                   :settings :visibility_type]
   :skip          [:custom_position :dimension_interestingness :fingerprint :fingerprint_version :last_analyzed
                   :is_defective_duplicate :unique_field_helper]
   :children      {:dimensions :model/Dimension}
   :transform     {:table_id           serialization/table-transform
                   :fk_target_field_id serialization/field-transform
                   :parent_id          serialization/field-transform}
   :defaults      {:active                     true
                   :database_is_auto_increment false
                   :database_required          false
                   :json_unfolding             false
                   :preview_display            true}
   :entity-ref    warehouse-schema.serialization/field-entity-ref
   :storage-paths warehouse-schema.serialization/field-storage-paths
   :rows-by-refs  serialization/field-rows-by-refs})
