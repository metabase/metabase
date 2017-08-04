(ns metabase.models.field
  (:require [clojure
             [data :as d]
             [string :as s]]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models
             [dimension :refer [Dimension]]
             [field-values :as fv :refer [FieldValues]]
             [humanization :as humanization]
             [interface :as i]
             [permissions :as perms]]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ------------------------------------------------------------ Type Mappings ------------------------------------------------------------

(def ^:const visibility-types
  "Possible values for `Field.visibility_type`."
  #{:normal         ; Default setting.  field has no visibility restrictions.
    :details-only   ; For long blob like columns such as JSON.  field is not shown in some places on the frontend.
    :hidden         ; Lightweight hiding which removes field as a choice in most of the UI.  should still be returned in queries.
    :sensitive      ; Strict removal of field from all places except data model listing.  queries should error if someone attempts to access.
    :retired})      ; For fields that no longer exist in the physical db.  automatically set by Metabase.  QP should error if encountered in a query.



;;; ------------------------------------------------------------ Entity & Lifecycle ------------------------------------------------------------

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

;; For the time being permissions to access a field are the same as permissions to access its parent table
;; TODO - this can be memoized because a Table's `:db_id` and `:schema` are guaranteed to never change, as is a Field's `:table_id`
(defn- perms-objects-set [{table-id :table_id} _]
  {:pre [(integer? table-id)]}
  (let [{schema :schema, database-id :db_id} (db/select-one ['Table :schema :db_id] :id table-id)]
    #{(perms/object-path database-id schema table-id)}))

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


;;; ------------------------------------------------------------ Hydration / Util Fns ------------------------------------------------------------


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

(defn with-targets
  "Efficiently hydrate the FK target fields for a collection of FIELDS."
  {:batched-hydrate :target}
  [fields]
  (let [target-field-ids (set (for [field fields
                                    :when (and (isa? (:special_type field) :type/FK)
                                               (:fk_target_field_id field))]
                                (:fk_target_field_id field)))
        id->target-field (u/key-by :id (when (seq target-field-ids)
                                         (filter i/can-read? (db/select Field :id [:in target-field-ids]))))]
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
