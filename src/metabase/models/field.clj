(ns metabase.models.field
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.db.connection :as mdb.connection]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.humanization :as humanization]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [trs tru]]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(comment mdb.connection/keep-me) ;; for [[memoize/ttl]]

;;; ------------------------------------------------- Type Mappings --------------------------------------------------

(def visibility-types
  "Possible values for `Field.visibility_type`."
  #{:normal         ; Default setting.  field has no visibility restrictions.
    :details-only   ; For long blob like columns such as JSON.  field is not shown in some places on the frontend.
    :hidden         ; Lightweight hiding which removes field as a choice in most of the UI.  should still be returned in queries.
    :sensitive      ; Strict removal of field from all places except data model listing.  queries should error if someone attempts to access.
    :retired})      ; For fields that no longer exist in the physical db.  automatically set by Metabase.  QP should error if encountered in a query.

(def has-field-values-options
  "Possible options for `has_field_values`. This column is used to determine whether we keep FieldValues for a Field,
  and which type of widget should be used to pick values of this Field when filtering by it in the Query Builder."
  ;; AUTOMATICALLY-SET VALUES, SET DURING SYNC
  ;;
  ;; `nil` -- means infer which widget to use based on logic in `with-has-field-values`; this will either return
  ;; `:search` or `:none`.
  ;;
  ;; This is the default state for Fields not marked `auto-list`. Admins cannot explicitly mark a Field as
  ;; `has_field_values` `nil`. This value is also subject to automatically change in the future if the values of a
  ;; Field change in such a way that it can now be marked `auto-list`. Fields marked `nil` do *not* have FieldValues
  ;; objects.
  ;;
  #{;; The other automatically-set option. Automatically marked as a 'List' Field based on cardinality and other factors
    ;; during sync. Store a FieldValues object; use the List Widget. If this Field goes over the distinct value
    ;; threshold in a future sync, the Field will get switched back to `has_field_values = nil`.
    :auto-list
    ;;
    ;; EXPLICITLY-SET VALUES, SET BY AN ADMIN
    ;;
    ;; Admin explicitly marked this as a 'Search' Field, which means we should *not* keep FieldValues, and should use
    ;; Search Widget.
    :search
    ;; Admin explicitly marked this as a 'List' Field, which means we should keep FieldValues, and use the List
    ;; Widget. Unlike `auto-list`, if this Field grows past the normal cardinality constraints in the future, it will
    ;; remain `List` until explicitly marked otherwise.
    :list
    ;; Admin explicitly marked that this Field shall always have a plain-text widget, neither allowing search, nor
    ;; showing a list of possible values. FieldValues not kept.
    :none})


;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Field :metabase_field)

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
            (log/warn (trs "Invalid Field {0} {1}: falling back to {2}" column-name k fallback-type))
            fallback-type))))))

(models/add-type! ::base-type
  :in  (hierarchy-keyword-in  :base_type :ancestor-types [:type/*])
  :out (hierarchy-keyword-out :base_type :ancestor-types [:type/*], :fallback-type :type/*))

(models/add-type! ::effective-type
  :in  (hierarchy-keyword-in  :effective_type :ancestor-types [:type/*])
  :out (hierarchy-keyword-out :effective_type :ancestor-types [:type/*], :fallback-type :type/*))

(models/add-type! ::semantic-type
  :in  (hierarchy-keyword-in  :semantic_type :ancestor-types [:Semantic/* :Relation/*])
  :out (hierarchy-keyword-out :semantic_type :ancestor-types [:Semantic/* :Relation/*], :fallback-type nil))

(models/add-type! ::coercion-strategy
  :in  (hierarchy-keyword-in  :coercion_strategy :ancestor-types [:Coercion/*])
  :out (hierarchy-keyword-out :coercion_strategy :ancestor-types [:Coercion/*], :fallback-type nil))

(defn- pre-insert [field]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name field))}]
    (merge defaults field)))

;;; Field permissions
;; There are several API endpoints where large instances can return many thousands of Fields. Normally Fields require
;; a DB call to fetch information about their Table, because a Field's permissions set is the same as its parent
;; Table's. To make API endpoints perform well, we have use two strategies:
;; 1)  If a Field's Table is already hydrated, there is no need to manually fetch the information a second time
;; 2)  Failing that, we cache the corresponding permissions sets for each *Table ID* for a few seconds to minimize the
;;     number of DB calls that are made. See discussion below for more details.

(defn- perms-objects-set*
  [db-id schema table-id read-or-write]
  #{(case read-or-write
      :read  (perms/data-perms-path db-id schema table-id)
      :write (perms/data-model-write-perms-path db-id schema table-id))})

(def ^:private ^{:arglists '([table-id read-or-write])} cached-perms-object-set
  "Cached lookup for the permissions set for a table with `table-id`. This is done so a single API call or other unit of
  computation doesn't accidentally end up in a situation where thousands of DB calls end up being made to calculate
  permissions for a large number of Fields. Thus, the cache only persists for 5 seconds.

  Of course, no DB lookups are needed at all if the Field already has a hydrated Table. However, mistakes are
  possible, and I did not extensively audit every single code pathway that uses sequences of Fields and permissions,
  so this caching is added as a failsafe in case Table hydration wasn't done.

  Please note this only caches one entry PER TABLE ID. Thus, even a million Tables (which is more than I hope we ever
  see), would require only a few megs of RAM, and again only if every single Table was looked up in a span of 5
  seconds."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[table-id read-or-write]]
                         [(mdb.connection/unique-identifier) table-id read-or-write])}
   (fn [table-id read-or-write]
     (let [{schema :schema, db-id :db_id} (db/select-one ['Table :schema :db_id] :id table-id)]
       (perms-objects-set* db-id schema table-id read-or-write)))
   :ttl/threshold 5000))

(defn- perms-objects-set
  "Calculate set of permissions required to access a Field. For the time being permissions to access a Field are the
   same as permissions to access its parent Table."
  [{table-id :table_id, {db-id :db_id, schema :schema} :table} read-or-write]
  {:arglists '([field read-or-write])}
  (if db-id
    ;; if Field already has a hydrated `:table`, then just use that to generate perms set (no DB calls required)
    (perms-objects-set* db-id schema table-id read-or-write)
    ;; otherwise we need to fetch additional info about Field's Table. This is cached for 5 seconds (see above)
    (cached-perms-object-set table-id read-or-write)))

(defn- maybe-parse-semantic-numeric-values [maybe-double-value]
  (if (string? maybe-double-value)
    (u/ignore-exceptions (Double/parseDouble maybe-double-value))
    maybe-double-value))

(defn- update-semantic-numeric-values
  "When fingerprinting decimal columns, NaN and Infinity values are possible. Serializing these values to JSON just
  yields a string, not a value double. This function will attempt to coerce any of those values to double objects"
  [fingerprint]
  (m/update-existing-in fingerprint [:type :type/Number]
                        (partial m/map-vals maybe-parse-semantic-numeric-values)))

(models/add-type! :json-for-fingerprints
  :in  mi/json-in
  :out (comp update-semantic-numeric-values mi/json-out-with-keywordization))


(u/strict-extend (class Field)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:destination :field :origin :human_readable_field])
          :types          (constantly {:base_type         ::base-type
                                       :effective_type    ::effective-type
                                       :coercion_strategy ::coercion-strategy
                                       :semantic_type     ::semantic-type
                                       :visibility_type   :keyword
                                       :has_field_values  :keyword
                                       :fingerprint       :json-for-fingerprints
                                       :settings          :json
                                       :nfc_path          :json})
          :properties     (constantly {:timestamped? true})
          :pre-insert     pre-insert})

  mi/IObjectPermissions
  (merge mi/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
          :can-read?         (partial mi/current-user-has-partial-permissions? :read)
          :can-write?        (partial mi/current-user-has-full-permissions? :write)})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:name (serdes.hash/hydrated-hash :table)])})


;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn target
  "Return the FK target `Field` that this `Field` points to."
  [{:keys [semantic_type fk_target_field_id]}]
  (when (and (isa? semantic_type :type/FK)
             fk_target_field_id)
    (Field fk_target_field_id)))

(defn values
  "Return the `FieldValues` associated with this `field`."
  [{:keys [id]}]
  (db/select [FieldValues :field_id :values], :field_id id))

(defn- select-field-id->instance
  "Select instances of `model` related by `field_id` FK to a Field in `fields`, and return a map of Field ID -> model
  instance. This only returns a single instance for each Field! Duplicates are discarded!

    (select-field-id->instance [(Field 1) (Field 2)] FieldValues)
    ;; -> {1 #FieldValues{...}, 2 #FieldValues{...}}

  (select-field-id->instance [(Field 1) (Field 2)] FieldValues :type :full)
    -> returns Fieldvalues of type :full for fields: [(Field 1) (Field 2)] "
  [fields model & conditions]
  (let [field-ids (set (map :id fields))]
    (u/key-by :field_id (when (seq field-ids)
                          (apply db/select model :field_id [:in field-ids] conditions)))))

(defn nfc-field->parent-identifier
  "Take a nested field column field corresponding to something like an inner key within a JSON column,
  and then get the parent column's identifier from its own identifier and the nfc path stored in the field.

  Suppose you have the child with corresponding identifier

  (metabase.util.honeysql-extensions/identifier :field \"blah -> boop\")

  Ultimately, this is just a way to get the parent identifier

  (metabase.util.honeysql-extensions/identifier :field \"blah\")"
  [field-identifier field]
  (let [nfc-path          (:nfc_path field)
        parent-components (-> (:components field-identifier)
                              (vec)
                              (pop)
                              (conj (first nfc-path)))]
    (apply hx/identifier (cons :field parent-components))))

(defn with-values
  "Efficiently hydrate the `FieldValues` for a collection of `fields`."
  {:batched-hydrate :values}
  [fields]
  ;; In 44 we added a new concept of Advanced FieldValues, so FieldValues are no longer have an one-to-one relationship
  ;; with Field. See the doc in [[metabase.models.field-values]] for more.
  ;; Adding an explicity filter by :type =:full for FieldValues here bc I believe this hydration does not concern
  ;; the new Advanced FieldValues.
  (let [id->field-values (select-field-id->instance fields FieldValues :type :full)]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(defn with-normal-values
  "Efficiently hydrate the `FieldValues` for visibility_type normal `fields`."
  {:batched-hydrate :normal_values}
  [fields]
  (let [id->field-values (select-field-id->instance (filter field-values/field-should-have-field-values? fields)
                                                    [FieldValues :id :human_readable_values :values :field_id]
                                                    :type :full)]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(defn with-dimensions
  "Efficiently hydrate the `Dimension` for a collection of `fields`."
  {:batched-hydrate :dimensions}
  [fields]
  ;; TODO - it looks like we obviously thought this code would return *all* of the Dimensions for a Field, not just
  ;; one! This code is obviously wrong! It will either assoc a single Dimension or an empty vector under the
  ;; `:dimensions` key!!!!
  ;; TODO - consult with tom and see if fixing this will break any hacks that surely must exist in the frontend to deal
  ;; with this
  (let [id->dimensions (select-field-id->instance fields Dimension)]
    (for [field fields]
      (assoc field :dimensions (get id->dimensions (:id field) [])))))

(defn- is-searchable?
  "Is this `field` a Field that you should be presented with a search widget for (to search its values)? If so, we can
  give it a `has_field_values` value of `search`."
  [{base-type :base_type}]
  ;; For the time being we will consider something to be "searchable" if it's a text Field since the `starts-with`
  ;; filter that powers the search queries (see `metabase.api.field/search-values`) doesn't work on anything else
  (or (isa? base-type :type/Text)
      (isa? base-type :type/TextLike)))

(defn- infer-has-field-values
  "Determine the value of `has_field_values` we should return for a `Field` As of 0.29.1 this doesn't require any DB
  calls! :D"
  [{has-field-values :has_field_values, :as field}]
  (or
   ;; if `has_field_values` is set in the DB, use that value; but if it's `auto-list`, return the value as `list` to
   ;; avoid confusing FE code, which can remain blissfully unaware that `auto-list` is a thing
   (when has-field-values
     (if (= (keyword has-field-values) :auto-list)
       :list
       has-field-values))
   ;; otherwise if it does not have value set in DB we will infer it
   (if (is-searchable? field)
     :search
     :none)))

(defn with-has-field-values
  "Infer what the value of the `has_field_values` should be for Fields where it's not set. See documentation for
  `has-field-values-options` above for a more detailed explanation of what these values mean."
  {:batched-hydrate :has_field_values}
  [fields]
  (for [field fields]
    (when field
      (assoc field :has_field_values (infer-has-field-values field)))))

(defn readable-fields-only
  "Efficiently checks if each field is readable and returns only readable fields"
  [fields]
  (for [field (hydrate fields :table)
        :when (mi/can-read? field)]
    (dissoc field :table)))

(defn with-targets
  "Efficiently hydrate the FK target fields for a collection of `fields`."
  {:batched-hydrate :target}
  [fields]
  (let [target-field-ids (set (for [field fields
                                    :when (and (isa? (:semantic_type field) :type/FK)
                                               (:fk_target_field_id field))]
                                (:fk_target_field_id field)))
        id->target-field (u/key-by :id (when (seq target-field-ids)
                                         (readable-fields-only (db/select Field :id [:in target-field-ids]))))]
    (for [field fields
          :let  [target-id (:fk_target_field_id field)]]
      (assoc field :target (id->target-field target-id)))))


(defn qualified-name-components
  "Return the pieces that represent a path to `field`, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (vec (if-let [parent (Field parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id table-id)]
                 (conj (when schema
                         [schema])
                       table-name))))
        field-name))

(defn json-field?
  "Return true if field is a JSON field, false if not."
  [field]
  (some? (:nfc_path field)))

(defn qualified-name
  "Return a combined qualified name for `field`, e.g. `table_name.parent_field_name.field_name`."
  [field]
  (str/join \. (qualified-name-components field)))

(def ^{:arglists '([field-id])} field-id->table-id
  "Return the ID of the Table this Field belongs to."
  (mdb.connection/memoize-for-application-db
   (fn [field-id]
     {:pre [(integer? field-id)]}
     (db/select-one-field :table_id Field, :id field-id))))

(defn field-id->database-id
  "Return the ID of the Database this Field belongs to."
  [field-id]
  {:pre [(integer? field-id)]}
  (let [table-id (field-id->table-id field-id)]
    ((requiring-resolve 'metabase.models.table/table-id->database-id) table-id)))

(defn table
  "Return the `Table` associated with this `Field`."
  {:arglists '([field])}
  [{:keys [table_id]}]
  (db/select-one 'Table, :id table_id))

;;; ------------------------------------------------- Serialization -------------------------------------------------

;; In order to retrieve the dependencies for a field its table_id needs to be serialized as [database schema table],
;; a trio of strings with schema maybe nil.
(defmethod serdes.base/serdes-generate-path "Field" [_ {table_id :table_id field :name}]
  (let [table (when (number? table_id)
                   (db/select-one 'Table :id table_id))
        db    (when table
                (db/select-one-field :name 'Database :id (:db_id table)))
        [db schema table] (if (number? table_id)
                            [db (:schema table) (:name table)]
                            ;; If table_id is not a number, it's already been exported as a [db schema table] triple.
                            table_id)]
    (filterv some? [{:model "Database" :id db}
                    (when schema {:model "Schema" :id schema})
                    {:model "Table"    :id table}
                    {:model "Field"    :id field}])))

(defmethod serdes.base/serdes-entity-id "Field" [_ {:keys [name]}]
  name)

(defmethod serdes.base/serdes-dependencies "Field" [field]
  ;; Take the path, but drop the Field section to get the parent Table's path instead.
  [(pop (serdes.base/serdes-path field))])

(defmethod serdes.base/extract-one "Field"
  [_ _ field]
  (-> (serdes.base/extract-one-basics "Field" field)
      (update :table_id serdes.util/export-table-fk)))

(defmethod serdes.base/load-xform "Field"
  [field]
  (-> (serdes.base/load-xform-basics field)
      (update :table_id serdes.util/import-table-fk)))

(defmethod serdes.base/load-find-local "Field"
  [path]
  (let [db-name            (-> path first :id)
        schema-name        (when (= 3 (count path))
                             (-> path second :id))
        [{table-name :id}
         {field-name :id}] (take-last 2 path)
        db-id              (db/select-one-field :id 'Database :name db-name)
        table-id           (db/select-one-field :id 'Table :name table-name :db_id db-id :schema schema-name)]
    (db/select-one-field :id Field :name field-name :table_id table-id)))
