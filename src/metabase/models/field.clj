(ns metabase.models.field
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as s]
            [metabase.models
             [dimension :refer [Dimension]]
             [field-values :as fv :refer [FieldValues]]
             [humanization :as humanization]
             [interface :as i]
             [permissions :as perms]]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

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

(defn- check-valid-types [{base-type :base_type, special-type :special_type}]
  (when base-type
    (assert (isa? (keyword base-type) :type/*)
      (str "Invalid base type: " base-type)))
  (when special-type
    (assert (isa? (keyword special-type) :type/*)
      (str "Invalid special type: " special-type))))

(defn- pre-insert [field]
  (check-valid-types field)
  (let [defaults {:display_name (humanization/name->human-readable-name (:name field))}]
    (merge defaults field)))

(defn- pre-update [field]
  (u/prog1 field
    (check-valid-types field)))

(defn- pre-delete [{:keys [id]}]
  (db/delete! Field :parent_id id)
  (db/delete! 'FieldValues :field_id id)
  (db/delete! 'MetricImportantField :field_id id))


;;; Field permissions
;; There are several API endpoints where large instances can return many thousands of Fields. Normally Fields require
;; a DB call to fetch information about their Table, because a Field's permissions set is the same as its parent
;; Table's. To make API endpoints perform well, we have use two strategies:
;; 1)  If a Field's Table is already hydrated, there is no need to manually fetch the information a second time
;; 2)  Failing that, we cache the corresponding permissions sets for each *Table ID* for a few seconds to minimize the
;;     number of DB calls that are made. See discussion below for more details.

(def ^:private ^{:arglists '([table-id])} perms-objects-set*
  "Cached lookup for the permissions set for a table with TABLE-ID. This is done so a single API call or other unit of
   computation doesn't accidentally end up in a situation where thousands of DB calls end up being made to calculate
   permissions for a large number of Fields. Thus, the cache only persists for 5 seconds.

   Of course, no DB lookups are needed at all if the Field already has a hydrated Table. However, mistakes are
   possible, and I did not extensively audit every single code pathway that uses sequences of Fields and permissions,
   so this caching is added as a failsafe in case Table hydration wasn't done.

   Please note this only caches one entry PER TABLE ID. Thus, even a million Tables (which is more than I hope we ever
   see), would require only a few megs of RAM, and again only if every single Table was looked up in a span of 5
   seconds."
  (memoize/ttl
   (fn [table-id]
     (let [{schema :schema, database-id :db_id} (db/select-one ['Table :schema :db_id] :id table-id)]
       #{(perms/object-path database-id schema table-id)}))
   :ttl/threshold 5000))

(defn- perms-objects-set
  "Calculate set of permissions required to access a Field. For the time being permissions to access a Field are the
   same as permissions to access its parent Table, and there are not separate permissions for reading/writing."
  [{table-id :table_id, {db-id :db_id, schema :schema} :table} _]
  {:arglists '([field read-or-write])}
  (if db-id
    ;; if Field already has a hydrated `:table`, then just use that to generate perms set (no DB calls required)
    #{(perms/object-path db-id schema table-id)}
    ;; otherwise we need to fetch additional info about Field's Table. This is cached for 5 seconds (see above)
    (perms-objects-set* table-id)))


(u/strict-extend (class Field)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:destination :field :origin :human_readable_field])
          :types          (constantly {:base_type        :keyword
                                       :special_type     :keyword
                                       :visibility_type  :keyword
                                       :description      :clob
                                       :has_field_values :keyword
                                       :fingerprint      :json
                                       :settings         :json})
          :properties     (constantly {:timestamped? true})
          :pre-insert     pre-insert
          :pre-update     pre-update
          :pre-delete     pre-delete})

  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
          :can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        i/superuser?}))


;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn target
  "Return the FK target `Field` that this `Field` points to."
  [{:keys [special_type fk_target_field_id]}]
  (when (and (isa? special_type :type/FK)
             fk_target_field_id)
    (Field fk_target_field_id)))

(defn values
  "Return the `FieldValues` associated with this FIELD."
  [{:keys [id]}]
  (db/select [FieldValues :field_id :values], :field_id id))

(defn- select-field-id->instance
  "Select instances of `model` related by `field_id` FK to a Field in `fields`, and return a map of Field ID -> model
  instance. This only returns a single instance for each Field! Duplicates are discarded!

    (select-field-id->instance [(Field 1) (Field 2)] FieldValues)
    ;; -> {1 #FieldValues{...}, 2 #FieldValues{...}}"
  [fields model]
  (let [field-ids (set (map :id fields))]
    (u/key-by :field_id (when (seq field-ids)
                          (db/select model :field_id [:in field-ids])))))

(defn with-values
  "Efficiently hydrate the `FieldValues` for a collection of FIELDS."
  {:batched-hydrate :values}
  [fields]
  (let [id->field-values (select-field-id->instance fields FieldValues)]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(defn with-normal-values
  "Efficiently hydrate the `FieldValues` for visibility_type normal FIELDS."
  {:batched-hydrate :normal_values}
  [fields]
  (let [id->field-values (select-field-id->instance (filter fv/field-should-have-field-values? fields)
                                                    [FieldValues :id :human_readable_values :values :field_id])]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(defn with-dimensions
  "Efficiently hydrate the `Dimension` for a collection of FIELDS."
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
        :when (i/can-read? field)]
    (dissoc field :table)))

(defn with-targets
  "Efficiently hydrate the FK target fields for a collection of FIELDS."
  {:batched-hydrate :target}
  [fields]
  (let [target-field-ids (set (for [field fields
                                    :when (and (isa? (:special_type field) :type/FK)
                                               (:fk_target_field_id field))]
                                (:fk_target_field_id field)))
        id->target-field (u/key-by :id (when (seq target-field-ids)
                                         (readable-fields-only (db/select Field :id [:in target-field-ids]))))]
    (for [field fields
          :let  [target-id (:fk_target_field_id field)]]
      (assoc field :target (id->target-field target-id)))))


(defn qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (vec (if-let [parent (Field parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id table-id)]
                 (conj (when schema
                         [schema])
                       table-name))))
        field-name))

(defn qualified-name
  "Return a combined qualified name for FIELD, e.g. `table_name.parent_field_name.field_name`."
  [field]
  (s/join \. (qualified-name-components field)))

(defn table
  "Return the `Table` associated with this `Field`."
  {:arglists '([field])}
  [{:keys [table_id]}]
  (db/select-one 'Table, :id table_id))

(defn unix-timestamp?
  "Is field a UNIX timestamp?"
  [{:keys [base_type special_type]}]
  (and (isa? base_type :type/Integer)
       (isa? special_type :type/DateTime)))
