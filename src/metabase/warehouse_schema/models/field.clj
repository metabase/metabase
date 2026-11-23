(ns metabase.warehouse-schema.models.field
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.serialization.core :as serialization]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.app-db-copy :as warehouse-schema.app-db-copy]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.dependencies :as warehouse-schema.dependencies]
   [metabase.warehouse-schema.humanization :as humanization]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [metabase.warehouse-schema.xrays :as warehouse-schema.xrays]
   [metabase.warehouses.models.database :as database]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]
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

(defn- hierarchy-keyword-in
  "The transform that validates a value of the Field column `column-name` against `ancestor-types`; a HoneySQL
  expression, a vector, is passed through untouched, since a before-update hook writes the derived types as one."
  [column-name & {:keys [ancestor-types]}]
  (fn [k]
    (if (vector? k)
      k
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
        (u/qualified-name k)))))

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
  ;; Deliberately **not** deriving from `:hook/entity-id` because we should not be randomizing the `entity_id`s on
  ;; databases, tables or fields. Since the sync process can create them in multiple instances, randomizing them would
  ;; cause duplication rather than good matching if the two instances are later linked by serdes.
  #_(derive :hook/entity-id))

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

(defn nested-fields-pattern
  "The SQL LIKE pattern matching the NFC paths of the Fields nested in the JSON Field named `field-name`."
  [field-name]
  (str "[\"" field-name "\",%]"))

(t2/define-before-insert :model/Field
  [field]
  (let [field (merge field
                     {:display_name (:display_name field (humanization/name->human-readable-name (:name field)))}
                     (coercion-changes field field))]
    (enforce-effective-type-invariant field)))

;;; The before-update hook writes the types a Field takes from the columns an update changes as expressions the database
;;; evaluates against the stored row, built by [[warehouse-schema.db/derived-types-clause]], so that every writer gets
;;; them with no statement of the hook's own. [[enforce-effective-type-invariant]] and [[coercion-changes]] are what the
;;; expressions must equal, row by row.

(defn- add-derived-type-clauses
  "`field`, an update, with the types its changes derive. MySQL and MariaDB evaluate the assignments of a statement left to
  right, the later ones reading the columns the earlier ones set, so there the changes go back as a map in an order in
  which the effective type, which reads the stored strategy, comes before the strategy that is cleared."
  [field changes]
  (let [derived (warehouse-schema.db/derived-types-clause changes)]
    (if (and (= :mysql (mdb/db-type)) (contains? derived :coercion_strategy))
      (let [all (merge changes derived)]
        (apply array-map (concat [:effective_type (:effective_type all)]
                                 (mapcat identity (dissoc all :effective_type :coercion_strategy))
                                 [:coercion_strategy (:coercion_strategy all)])))
      (merge field derived))))

(t2/define-before-update :model/Field
  [field]
  (let [changes (t2/changes field)]
    (when (contains? changes :table_id)
      (throw (ex-info (tru "You cannot move a Field to another Table.") {:status-code 400})))
    (cond-> field
      (seq changes) (add-derived-type-clauses changes))))

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

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-fk-targets
  "Throw a 400 unless every one of `fields` satisfies this rule, the Databases of all of them read in two queries:

  - its foreign key target, a Field that exists, is a Field of the Database of its Table"
  [fields]
  (when (seq fields)
    (let [target-database-ids (warehouse-schema.db/field-database-ids (into #{} (map :fk_target_field_id) fields))
          table-database-ids  (warehouse-schema.db/table-database-ids (into #{} (map :table_id) fields))]
      (doseq [{:keys [table_id fk_target_field_id]} fields]
        (when-some [target-database-id (target-database-ids fk_target_field_id)]
          (api/checkp (= target-database-id (table-database-ids table_id))
                      :fk_target_field_id (tru "Target field must belong to the same database")))))))

(mu/defn create-fields! :- [:sequential ::warehouse-schema.schema/field]
  "Insert the Field `rows` and return the inserted instances, refusing a foreign key target outside the Database of a
  Field's Table."
  [rows :- [:sequential ::warehouse-schema.schema/field.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (u/prog1 (into []
                     (mapcat (fn [batch]
                               (check-fk-targets (filter :fk_target_field_id batch))
                               (warehouse-schema.db/insert-fields! (vec batch))))
                     (partition-all mdb/create-partition-size rows))
        (events/publish-event! :event/field-create (events/create-event <>))))))

(defmulti clear-for-deactivated-fields!
  "Clear what the rows of `model` hold that points at the deactivated Fields with `field-ids`, which a model whose
  namespace requires this one implements with its own write function."
  {:arglists '([model field-ids])}
  (fn [model _field-ids] model))

(defn- clear-user-settings-fk-targets!
  "Unset the user-set foreign keys to the Fields with `field-ids` in the settings of the Fields that target them."
  [field-ids]
  (t2/resolve-model :model/FieldUserSettings)
  (clear-for-deactivated-fields! :model/FieldUserSettings field-ids))

(defn- fields-by-id
  "The Fields with `ids`, `{id row}`, read in batches of [[mdb/delete-partition-size]] ids, so that any number of them
  stays under the parameter limit of a statement."
  [ids]
  (into {}
        (comp (mapcat #(warehouse-schema.db/fields (set %))) (map (juxt :id identity)))
        (partition-all mdb/delete-partition-size ids)))

(defn- updated-field
  "The Field `previous`, an instance as the function read it, as an update of `changes` leaves it, with the columns its
  before-update derives and the `:updated_at` it had."
  [previous changes]
  (-> (t2.before-update/before-update :model/Field (merge previous changes))
      (assoc :updated_at (:updated_at previous))))

(defn- add-change
  "`changes`, the changes of Fields as `{id {:previous-object :object}}`, with the update of the Field `previous` by
  `row`, the columns it sets, added; a Field changed twice keeps the row it had before the first change."
  [changes previous row]
  (let [{before :previous-object current :object} (get changes (:id previous))]
    (assoc changes (:id previous) {:previous-object (or before previous)
                                   :object          (updated-field (or current previous) row)})))

(defn- publish-field-updates!
  "Publish the `:event/field-update` event of `changes`, `{id {:previous-object :object}}`, leaving out those that
  change nothing."
  [changes]
  (when (seq changes)
    (let [stored (fields-by-id (keys changes))]
      (events/publish-event! :event/field-update
                             (events/update-event (update-vals changes :previous-object)
                                                  (mapv #(hash-map :id %) (keys changes))
                                                  {:objects (merge (update-vals changes :object) stored)})))))

(defn- clear-fk-targets!
  "Clear the foreign keys to the Fields with `field-ids` in the Fields that target them, and their FK semantic type,
  returning `changes` with those updates added."
  [changes field-ids]
  (let [targeting (warehouse-schema.db/fields-targeting (vec field-ids))]
    (if (empty? targeting)
      changes
      (do (warehouse-schema.db/clear-fk-targets-to-fields! field-ids)
          (reduce (fn [changes field]
                    (add-change changes field (cond-> {:fk_target_field_id nil}
                                                (= :type/FK (some-> (:semantic_type field) keyword))
                                                (assoc :semantic_type nil))))
                  changes
                  targeting)))))

(defn- deactivated!
  "Clear what points at the deactivated Fields with `field-ids`: the foreign keys to them, in the Fields' settings and
  rows, and the remappings that read them, returning `changes` with the updates of the Fields added."
  [changes field-ids]
  (if (empty? field-ids)
    changes
    (do (clear-user-settings-fk-targets! field-ids)
        (u/prog1 (clear-fk-targets! changes field-ids)
          (dimension/delete-dimensions! (mapv :id (warehouse-schema.db/dimensions-reading-fields (vec field-ids))))))))

(defn- like-regex
  "The regular expression matching what the SQL LIKE `pattern` does, `%` any run of characters, `_` any one and a
  backslash escaping the next."
  [pattern]
  (re-pattern (str "(?s)"
                   (loop [[c & more] pattern, out ""]
                     (cond
                       (nil? c)  out
                       (= c \%) (recur more (str out ".*"))
                       (= c \_) (recur more (str out "."))
                       (= c \\) (recur (rest more) (str out (java.util.regex.Pattern/quote (str (first more)))))
                       :else     (recur more (str out (java.util.regex.Pattern/quote (str c)))))))))

(defn- json-unfolding-changed!
  "Set the nested Fields of each of the JSON `fields` active when it now unfolds, and inactive when it no longer does,
  the last of the `fields` that a nested Field is nested under deciding, returning `changes` with those updates added;
  the nested Fields of all of them are read in one query and written in at most two statements."
  [changes fields]
  (let [fields (vec fields)
        nested (when (seq fields)
                 (warehouse-schema.db/nested-fields-matching
                  (mapv (fn [{:keys [table_id] field-name :name}] [table_id (nested-fields-pattern field-name)]) fields)))
        owners (mapv (fn [{:keys [table_id json_unfolding] field-name :name}]
                       {:table_id table_id :regex (like-regex (nested-fields-pattern field-name)) :active? (boolean json_unfolding)})
                     fields)
        active (fn [{:keys [table_id nfc_path]}]
                 (let [path (json/encode nfc_path)]
                   (:active? (last (filter #(and (= table_id (:table_id %)) (re-matches (:regex %) path)) owners)))))
        nested (keep #(when-some [active? (active %)] [% active?]) nested)]
    (doseq [[active? pairs] (group-by second nested)]
      (warehouse-schema.db/set-fields-active! (mapv (comp :id first) pairs) active?))
    (reduce (fn [changes [field active?]] (add-change changes field {:active active?})) changes nested)))

(defn- add-derived-types
  "`row`, an update of the Field `stored`, with the `:coercion_strategy` and `:effective_type` that the row it leaves
  takes: those that follow a changed strategy or base type, and the base type as effective type of a Field with no
  strategy whose stored effective type diverges, which only the stored row can tell."
  [stored row]
  (if (nil? stored)
    row
    (let [field   (merge stored row)
          derived (enforce-effective-type-invariant
                   (merge field (coercion-changes field (dissoc row :id))))]
      (into row
            (filter (fn [[k v]] (not= v (get field k))))
            (select-keys derived [:coercion_strategy :effective_type])))))

(defn- log-type-repairs
  "Log the warning of [[enforce-effective-type-invariant]] for each of `rows` that leaves its Field of `stored`, `{id
  row}`, with an effective type that its base type repairs."
  [stored rows]
  (run! #(add-derived-types (get stored (:id %)) %) rows))

(defn- stored-fields
  "The stored Fields that `rows` update, `{id row}`: those of `stored`, the rows the caller read, and the others read
  once."
  [rows stored]
  (let [missing (into #{} (comp (map :id) (remove #(contains? stored %))) rows)]
    (cond-> (or stored {})
      (seq missing) (merge (u/index-by :id (warehouse-schema.db/fields missing))))))

(defn- column-changed?
  "Whether `row`, the id of one of the `stored` Fields, `{id row}`, and its changes, sets `k` to another value than the
  stored one."
  [stored {:keys [id] :as row} k]
  (and (contains? row k)
       (contains? stored id)
       (not= (get row k) (get-in stored [id k]))))

(defn- merged-row
  "`row`, the id of one of the `stored` Fields, `{id row}`, and its changes, with the columns of the stored Field."
  [stored row]
  (merge (get stored (:id row)) row))

(defn- fk-target-rows
  "The Fields of `rows` that the update points at a new foreign key target, as they are once changed."
  [stored rows]
  (for [row rows
        :when (and (:fk_target_field_id row) (column-changed? stored row :fk_target_field_id))]
    (merged-row stored row)))

(defn- renamed-display-names
  "A map from id to the new display name of each of `rows` that changes it."
  [stored rows]
  (into {}
        (keep #(when (and (:display_name %) (column-changed? stored % :display_name)) [(:id %) (:display_name %)]))
        rows))

(defn- deactivated-ids
  "The ids of the `rows` that deactivate their Field."
  [rows]
  (into [] (comp (filter #(false? (:active %))) (map :id)) rows))

(defn- json-unfolding-rows
  "The Fields of `rows` that the update gives another `json_unfolding`, as they are once changed."
  [stored rows]
  (into [] (comp (filter #(column-changed? stored % :json_unfolding)) (map #(merged-row stored %))) rows))

(defn- add-row-changes
  "`changes`, the changes of Fields as `{id {:previous-object :object}}`, with the update of each of `rows` added."
  [changes stored rows]
  (reduce (fn [changes {:keys [id] :as row}]
            (if-let [previous (stored id)]
              (add-change changes previous (dissoc row :id))
              changes))
          changes
          rows))

(defn- check-field-updates
  "Throw unless every one of `rows`, the id of one of the `stored` Fields, `{id row}`, and its changes, satisfies this
  rule:

  - a new foreign key target, a Field that exists, is a Field of the Database of its Table"
  [stored rows]
  (check-fk-targets (fk-target-rows stored rows)))

(defn- write-field-updates!
  "Write each of `rows`, the id of a Field and the columns to change, over the `stored` Fields, `{id row}`, with the
  changes that follow them, returning `changes`, `{id {:previous-object :object}}`, with theirs added."
  [changes stored rows]
  (let [deactivated (deactivated! changes (deactivated-ids rows))
        _           (dimension/rename-dimensions-for-fields! (renamed-display-names stored rows))
        changes     (json-unfolding-changed! deactivated (json-unfolding-rows stored rows))]
    (log-type-repairs stored rows)
    (warehouse-schema.db/update-fields! rows)
    (add-row-changes changes stored rows)))

(mr/def ::write-opts
  "The options of an update of Fields: `:fields`, the Fields the caller already read, as the rows before it, so that it
  reads none."
  [:maybe [:map {:closed true}
           [:fields {:optional true} [:sequential ::warehouse-schema.schema/field]]]])

(mu/defn update-fields! :- [:sequential ::warehouse-schema.schema/field.update]
  "Apply each of `rows`, the id of a Field and the columns to change, in one transaction and batches of
  [[mdb/update-partition-size]], each read once unless the caller gives the stored rows as `:fields`, publish one event
  for all of them, and return them."
  ([rows :- [:sequential ::warehouse-schema.schema/field.update]]
   (update-fields! rows nil))
  ([rows             :- [:sequential ::warehouse-schema.schema/field.update]
    {:keys [fields]} :- ::write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (let [held (u/index-by :id fields)]
         (publish-field-updates!
          (reduce (fn [changes batch]
                    (let [stored (stored-fields batch held)]
                      (check-field-updates stored batch)
                      (write-field-updates! changes stored (vec batch))))
                  {}
                  (partition-all mdb/update-partition-size rows))))))
   (vec rows)))

(mu/defn change-case!
  "Set each of `columns`, such as `:name`, of the Fields with `field-ids` to its value in `kase`, `:lower` or `:upper`
  case, which the database computes: one read before, one statement and one read after, for the event."
  [field-ids :- [:sequential ::lib.schema.id/field]
   kase      :- [:enum :lower :upper]
   columns   :- [:sequential [:enum :name :display_name]]]
  (when (seq field-ids)
    (t2/with-transaction [_conn]
      (let [stored (fields-by-id field-ids)]
        (run! #(warehouse-schema.db/change-fields-case! (vec %) kase columns)
              (partition-all mdb/update-partition-size field-ids))
        (events/publish-event! :event/field-update
                               (events/update-event stored
                                                    (mapv #(hash-map :id %) (keys stored))
                                                    {:objects (fields-by-id (keys stored))}))))))

(mu/defn ids-of-database :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (warehouse-schema.db/field-ids-of-database database-id))

(defn- write-positions!
  "Set `column`, `:position` or `:custom_position`, of each Field in `field-id->position`, in one statement."
  [column field-id->position]
  (case column
    :position        (warehouse-schema.db/update-field-positions! field-id->position)
    :custom_position (warehouse-schema.db/update-field-custom-positions! field-id->position)))

(defn- position-changes
  "The changes, `{id {:previous-object :object}}`, of setting `column` of each of the `stored` Fields to its position in
  `field-id->position`."
  [column stored field-id->position]
  (reduce (fn [acc {:keys [id] :as previous}]
            (add-change acc previous {column (field-id->position id)}))
          {}
          stored))

(defn- set-position-column!
  "Set `column`, `:position` or `:custom_position`, of each Field in `field-id->position`, one statement per batch of
  [[mdb/update-partition-size]] Fields, and publish one event for all of them."
  [column field-id->position]
  (when (seq field-id->position)
    (t2/with-transaction [_conn]
      (let [stored (vals (fields-by-id (keys field-id->position)))]
        (run! #(write-positions! column (into {} %)) (partition-all mdb/update-partition-size field-id->position))
        (publish-field-updates! (position-changes column stored field-id->position))))))

(mu/defn set-positions!
  "Set the `position` of each Field in `field-id->position`, in one statement."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (set-position-column! :position field-id->position))

(mu/defn set-custom-positions!
  "Set the `custom_position` of each Field in `field-id->position`, in one statement."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (set-position-column! :custom_position field-id->position))

(defn- child-field-ids
  "The ids of the Fields nested directly under the Fields with `ids`, read in batches of [[mdb/delete-partition-size]]."
  [ids]
  (into #{} (mapcat #(warehouse-schema.db/child-field-ids (set %))) (partition-all mdb/delete-partition-size ids)))

(defn- field-ids-and-descendants
  "`ids` with the ids of every Field nested under them at any depth, read one level of nesting at a time."
  [ids]
  (loop [all (set ids), frontier (set ids)]
    (let [children (into #{} (remove all) (child-field-ids frontier))]
      (if (empty? children)
        all
        (recur (into all children) children)))))

(defn- deepest-first
  "The Fields `fields` grouped by how deep each is nested under the others, the deepest group first, so that no Field is
  deleted before the Fields nested under it."
  [fields]
  (let [parent-ids (into {} (map (juxt :id :parent_id)) fields)
        depth      (fn depth [id] (if-let [parent-id (parent-ids id)] (inc (depth parent-id)) 0))]
    (->> fields
         (group-by (comp depth :id))
         (sort-by key >)
         (map val))))

(defn- delete-level!
  "Delete the Fields `fields`, none nested under another, one statement per batch of [[mdb/delete-partition-size]]."
  [fields]
  (run! #(warehouse-schema.db/delete-fields! (mapv :id %)) (partition-all mdb/delete-partition-size fields)))

(mu/defn delete-fields! :- :nil
  "Delete the Fields with `ids` and the Fields nested under them, which a foreign key cannot cascade to, in one
  transaction: one event for all of them before the statements, which delete the most nested Fields first."
  [ids :- [:sequential ::lib.schema.id/field]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (when-let [fields (not-empty (vec (vals (fields-by-id (field-ids-and-descendants ids)))))]
        (events/publish-event! :event/field-delete (events/delete-event fields))
        (run! delete-level! (deepest-first fields)))))
  nil)

(mu/defn delete-fields-for-databases! :- :nil
  "Delete the Fields of the Tables of the Databases with `database-ids`, as those Databases are deleted, without reading
  them or publishing events: the childless ones first, one statement per level of nesting, and none at all when the
  Databases have no Fields, checked without a lock that would recreate the contention on MySQL."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (when (warehouse-schema.db/fields-exist-for-databases? database-ids)
    (loop []
      (when (pos? (warehouse-schema.db/delete-childless-fields-for-databases! database-ids))
        (recur))))
  nil)

(defmethod database/delete-for-databases! :model/Field
  [_model databases]
  (delete-fields-for-databases! (mapv :id databases)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Field [_model]
  {:skip?     false
   :select    warehouse-schema.db/copy-fields-select
   :transform warehouse-schema.app-db-copy/transform-field})

(defmethod change-log/spec :model/Field [_model]
  {:track [:name :base_type :semantic_type :active :description :preview_display :position :table_id :parent_id
           :display_name :visibility_type :fk_target_field_id :points_of_interest :caveats :database_type
           :has_field_values :settings :database_position :custom_position :effective_type :coercion_strategy
           :nfc_path :database_required :json_unfolding :database_is_auto_increment :database_partitioned
           :database_is_pk :database_is_nullable :database_is_generated :database_default :data_sensitivity]
   :skip  [:database_indexed :dimension_interestingness :fingerprint :fingerprint_version :last_analyzed
           :is_defective_duplicate :unique_field_helper]})

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
   :insert!       create-fields!
   :update!       update-fields!
   :delete!       delete-fields!
   :rows-by-refs  serialization/field-rows-by-refs})

(defmethod dependencies/spec :model/Field [_model]
  {:part-of      {:type :table :key :table_id}
   :part-columns warehouse-schema.dependencies/field-columns})

(defmethod xrays/spec :model/Field [_model]
  {:related    warehouse-schema.xrays/field-related
   :definition warehouse-schema.xrays/field-definition})
