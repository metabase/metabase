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

(def ^:const visibility-types
  "Possible values for `Field.visibility_type`."
  #{:normal         ; Default setting.  field has no visibility restrictions.
    :details-only   ; For long blob like columns such as JSON.  field is not shown in some places on the frontend.
    :hidden         ; Lightweight hiding which removes field as a choice in most of the UI.  should still be returned in queries.
    :sensitive      ; Strict removal of field from all places except data model listing.  queries should error if someone attempts to access.
    :retired})      ; For fields that no longer exist in the physical db.  automatically set by Metabase.  QP should error if encountered in a query.


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
         {:hydration-keys (constantly [:destination :field :origin])
          :types          (constantly {:base_type       :keyword
                                       :special_type    :keyword
                                       :visibility_type :keyword
                                       :description     :clob
                                       :fingerprint     :json})
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

(defn- keyed-by-field-ids
  "Queries for `MODEL` instances related by `FIELDS`, returns a map
  keyed by :field_id"
  [fields model]
  (let [field-ids (set (map :id fields))]
    (u/key-by :field_id (when (seq field-ids)
                          (db/select model :field_id [:in field-ids])))))

(defn with-values
  "Efficiently hydrate the `FieldValues` for a collection of FIELDS."
  {:batched-hydrate :values}
  [fields]
  (let [id->field-values (keyed-by-field-ids fields FieldValues)]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(defn with-normal-values
  "Efficiently hydrate the `FieldValues` for visibility_type normal FIELDS."
  {:batched-hydrate :normal_values}
  [fields]
  (let [id->field-values (keyed-by-field-ids (filter fv/field-should-have-field-values? fields)
                                             [FieldValues :id :human_readable_values :values :field_id])]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

(defn with-dimensions
  "Efficiently hydrate the `Dimension` for a collection of FIELDS."
  {:batched-hydrate :dimensions}
  [fields]
  (let [id->dimensions (keyed-by-field-ids fields Dimension)]
    (for [field fields]
      (assoc field :dimensions (get id->dimensions (:id field) [])))))

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
