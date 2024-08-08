(ns metabase.models.field
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.db :as mdb]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :as database]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field-values :as field-values :refer [FieldValues]]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Type Mappings --------------------------------------------------

(def visibility-types
  "Possible values for `Field.visibility_type`."
  #{:normal         ; Default setting.  field has no visibility restrictions.
    :details-only   ; For long blob like columns such as JSON.  field is not shown in some places on the frontend.
    :hidden         ; Lightweight hiding which removes field as a choice in most of the UI.  should still be returned in queries.
    :sensitive      ; Strict removal of field from all places except data model listing.  queries should error if someone attempts to access.
    :retired})      ; For fields that no longer exist in the physical db.  automatically set by Metabase.  QP should error if encountered in a query.


;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def Field
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]]; now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the Field symbol in our codebase."
  :model/Field)

(methodical/defmethod t2/table-name :model/Field [_model] :metabase_field)

(methodical/defmethod t2/model-for-automagic-hydration [:default :destination]          [_model _k]  :model/Field)
(methodical/defmethod t2/model-for-automagic-hydration [:default :field]                [_model _k]  :model/Field)
(methodical/defmethod t2/model-for-automagic-hydration [:default :origin]               [_model _k]  :model/Field)
(methodical/defmethod t2/model-for-automagic-hydration [:default :human_readable_field] [_model _k]  :model/Field)

(defn- hierarchy-keyword-in [column-name & {:keys [ancestor-types]}]
  (fn [k]
    (when-let [k (keyword k)]
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

(def ^:private transform-field-effective-type
  {:in  (hierarchy-keyword-in  :effective_type :ancestor-types [:type/*])
   :out (hierarchy-keyword-out :effective_type :ancestor-types [:type/*], :fallback-type :type/*)})

(def ^:private transform-field-semantic-type
  {:in  (hierarchy-keyword-in  :semantic_type :ancestor-types [:Semantic/* :Relation/*])
   :out (hierarchy-keyword-out :semantic_type :ancestor-types [:Semantic/* :Relation/*], :fallback-type nil)})

(def ^:private transform-field-coercion-strategy
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

(t2/deftransforms :model/Field
  {:base_type         transform-field-base-type
   :effective_type    transform-field-effective-type
   :coercion_strategy transform-field-coercion-strategy
   :semantic_type     transform-field-semantic-type
   :visibility_type   mi/transform-keyword
   :has_field_values  mi/transform-keyword
   :fingerprint       transform-json-fingerprints
   :settings          mi/transform-json
   :nfc_path          mi/transform-json})

(doto :model/Field
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/define-after-select :model/Field
  [field]
  (dissoc field :is_defective_duplicate :unique_field_helper))

(t2/define-before-insert :model/Field
  [field]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name field))}]
    (merge defaults field)))

(t2/define-before-update :model/Field
  [field]
  (u/prog1 (t2/changes field)
    (when (false? (:active <>))
      (t2/update! :model/Field {:fk_target_field_id (:id field)} {:semantic_type      nil
                                                                  :fk_target_field_id nil}))))

(t2/define-before-delete :model/Field
  [field]
  ; Cascading deletes through parent_id cannot be done with foreign key constraints in the database
  ; because parent_id constributes to a generated column, and MySQL doesn't support columns with cascade delete
  ;; foreign key constraints in generated columns. #44866
  (t2/delete! :model/Field :parent_id (:id field)))

(defn- field->db-id
  [{table-id :table_id, {db-id :db_id} :table}]
  (or db-id (database/table-id->database-id table-id)))

(defmethod mi/can-read? :model/Field
  ([instance]
   (and (data-perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/view-data
         :unrestricted
         (field->db-id instance)
         (:table_id instance))
        (data-perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/create-queries
         :query-builder
         (field->db-id instance)
         (:table_id instance))))
  ([model pk]
   (mi/can-read? (t2/select-one model pk))))

(defenterprise current-user-can-write-field?
  "OSS implementation. Returns a boolean whether the current user can write the given field."
  metabase-enterprise.advanced-permissions.common
  [_instance]
  (mi/superuser?))

(defmethod mi/can-write? :model/Field
  ([instance]
   (current-user-can-write-field? instance))
  ([model pk]
   (mi/can-write? (t2/select-one model pk))))

(defmethod serdes/hash-fields :model/Field
  [_field]
  [:name (serdes/hydrated-hash :table)])


;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn values
  "Return the `FieldValues` associated with this `field`."
  [{:keys [id]}]
  (t2/select [FieldValues :field_id :values], :field_id id :type :full))

(mu/defn nested-field-names->field-id :- [:maybe ms/PositiveInt]
  "Recusively find the field id for a nested field name, return nil if not found.
  Nested field here refer to a field that has another field as its parent_id, like nested field in Mongo DB.

  This is to differentiate from the json nested field in, which the path is defined in metabase_field.nfc_path."
  [table-id    :- ms/PositiveInt
   field-names :- [:sequential ms/NonBlankString]]
  (loop [field-names field-names
         field-id    nil]
    (if (seq field-names)
      (let [field-name (first field-names)
            field-id   (t2/select-one-pk :model/Field :name field-name :parent_id field-id :table_id table-id)]
        (if field-id
          (recur (rest field-names) field-id)
          nil))
      field-id)))

(defn- select-field-id->instance
  "Select instances of `model` related by `field_id` FK to a Field in `fields`, and return a map of Field ID -> model
  instance. This only returns a single instance for each Field! Duplicates are discarded!

    (select-field-id->instance [(Field 1) (Field 2)] FieldValues)
    ;; -> {1 #FieldValues{...}, 2 #FieldValues{...}}

  (select-field-id->instance [(Field 1) (Field 2)] FieldValues :type :full)
    -> returns Fieldvalues of type :full for fields: [(Field 1) (Field 2)] "
  [fields model & conditions]
  (let [field-ids (set (map :id fields))]
    (m/index-by :field_id (when (seq field-ids)
                            (apply t2/select model :field_id [:in field-ids] conditions)))))

(mi/define-batched-hydration-method with-values
  :values
  "Efficiently hydrate the `FieldValues` for a collection of `fields`."
  [fields]
  ;; In 44 we added a new concept of Advanced FieldValues, so FieldValues are no longer have an one-to-one relationship
  ;; with Field. See the doc in [[metabase.models.field-values]] for more.
  ;; We filter down to only :type =:full values, as they contain configured labels which must be preserved. The Advanced
  ;; FieldValues can then be regenerated without loss given these Full entities.
  (let [id->field-values (select-field-id->instance fields FieldValues :type :full)]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(mi/define-batched-hydration-method with-normal-values
  :normal_values
  "Efficiently hydrate the `FieldValues` for visibility_type normal `fields`."
  [fields]
  (let [id->field-values (select-field-id->instance (filter field-values/field-should-have-field-values? fields)
                                                    [FieldValues :id :human_readable_values :values :field_id]
                                                    :type :full)]
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
  (let [id->dimensions (select-field-id->instance fields Dimension)]
    (for [field fields
          :let  [dimension (get id->dimensions (:id field))]]
      (assoc field :dimensions (if dimension [dimension] [])))))

(methodical/defmethod t2.hydrate/simple-hydrate [#_model :default #_k :has_field_values]
  "Infer what the value of the `has_field_values` should be for Fields where it's not set. See documentation for
  [[metabase.lib.schema.metadata/column-has-field-values-options]] for a more detailed explanation of what these
  values mean.

  This does one important thing: if `:has_field_values` is already present and set to `:auto-list`, it is replaced by
  `:list` -- presumably because the frontend doesn't need to know `:auto-list` even exists?
  See [[lib.field/infer-has-field-values]] for more info."
  [_model k field]
  (when field
    (let [has-field-values (lib.field/infer-has-field-values (lib.metadata.jvm/instance->metadata field :metadata/column))]
      (assoc field k has-field-values))))

(methodical/defmethod t2.hydrate/needs-hydration? [#_model :default #_k :has_field_values]
  "Always (re-)hydrate `:has_field_values`. This is used to convert an existing value of `:auto-list` to
  `:list` (see [[infer-has-field-values]])."
  [_model _k _field]
  true)

(defn readable-fields-only
  "Efficiently checks if each field is readable and returns only readable fields"
  [fields]
  (for [field (t2/hydrate fields :table)
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
                                           (readable-fields-only (t2/select Field :id [:in target-field-ids]))))]
    (for [field fields
          :let  [target-id (:fk_target_field_id field)]]
      (assoc field :target (id->target-field target-id)))))

(defn hydrate-target-with-write-perms
  "Hydrates :target on field, but if the `:fk_target_field_id` field is not writable, `:target` will be nil."
  [field]
  (let [target-field-id (when (isa? (:semantic_type field) :type/FK)
                          (:fk_target_field_id field))
        target-field    (when-let [target-field (and target-field-id (t2/select-one Field :id target-field-id))]
                          (when (mi/can-write? (t2/hydrate target-field :table))
                            target-field))]
    (assoc field :target target-field)))

(defn qualified-name-components
  "Return the pieces that represent a path to `field`, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (vec (if-let [parent (t2/select-one Field :id parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name, schema :schema} (t2/select-one ['Table :name :schema], :id table-id)]
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
     (t2/select-one-fn :table_id Field, :id field-id))))

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
  (t2/select-one 'Table, :id table_id))

;;; ------------------------------------------------- Serialization -------------------------------------------------

;; In order to retrieve the dependencies for a field its table_id needs to be serialized as [database schema table],
;; a trio of strings with schema maybe nil.
(defmethod serdes/generate-path "Field" [_ {table_id :table_id field :name}]
  (let [table (when (number? table_id)
                   (t2/select-one 'Table :id table_id))
        db    (when table
                (t2/select-one-fn :name 'Database :id (:db_id table)))
        [db schema table] (if (number? table_id)
                            [db (:schema table) (:name table)]
                            ;; If table_id is not a number, it's already been exported as a [db schema table] triple.
                            table_id)]
    (filterv some? [{:model "Database" :id db}
                    (when schema {:model "Schema" :id schema})
                    {:model "Table"    :id table}
                    {:model "Field"    :id field}])))

(defmethod serdes/entity-id "Field" [_ {:keys [name]}]
  name)

(defmethod serdes/load-find-local "Field"
  [path]
  (let [table (serdes/load-find-local (pop path))]
    (t2/select-one Field :name (-> path last :id) :table_id (:id table))))

(defmethod serdes/extract-query "Field" [_model-name opts]
  (let [d          (t2/select Dimension)
        dimensions (->> d
                        (group-by :field_id))]
    (eduction (map #(assoc % :dimensions (get dimensions (:id %))))
              (t2/reducible-select Field {:where (:where opts true)}))))

(defmethod serdes/dependencies "Field" [field]
  ;; Fields depend on their parent Table, plus any foreign Fields referenced by their Dimensions.
  ;; Take the path, but drop the Field section to get the parent Table's path instead.
  (let [this  (serdes/path field)
        table (pop this)
        fks   (some->> field :fk_target_field_id serdes/field->path)
        human (->> (:dimensions field)
                   (keep :human_readable_field_id)
                   (map serdes/field->path)
                   set)]
    (cond-> (set/union #{table} human)
      fks   (set/union #{fks})
      true  (disj this))))

(defmethod serdes/make-spec "Field" [_model-name opts]
  {:copy      [:active :base_type :caveats :coercion_strategy :custom_position :database_indexed
               :database_is_auto_increment :database_partitioned :database_position :database_required :database_type
               :description :display_name :effective_type :has_field_values :is_defective_duplicate :json_unfolding
               :name :nfc_path :points_of_interest :position :preview_display :semantic_type :settings
               :unique_field_helper :visibility_type]
   :skip      [:fingerprint :fingerprint_version :last_analyzed]
   :transform {:created_at         (serdes/date)
               :table_id           (serdes/fk :model/Table)
               :fk_target_field_id (serdes/fk :model/Field)
               :parent_id          (serdes/fk :model/Field)
               :dimensions         (serdes/nested :model/Dimension :field_id opts)}})

(defmethod serdes/storage-path "Field" [field _]
  (-> (serdes/path field)
      drop-last
      serdes/storage-table-path-prefix
      (concat ["fields" (:name field)])))
