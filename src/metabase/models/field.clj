(ns metabase.models.field
  (:require [clojure
             [data :as d]
             [string :as s]]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models
             [field-values :refer [FieldValues]]
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
                                       :description     :clob})
          :properties     (constantly {:timestamped? true})
          :pre-insert     pre-insert
          :pre-update     pre-update
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set  perms-objects-set
          :can-read?          (partial i/current-user-has-full-permissions? :read)
          :can-write?         i/superuser?}))


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

(defn with-values
  "Efficiently hydrate the `FieldValues` for a collection of FIELDS."
  {:batched-hydrate :values}
  [fields]
  (let [field-ids        (set (map :id fields))
        id->field-values (u/key-by :field_id (when (seq field-ids)
                                               (db/select FieldValues :field_id [:in field-ids])))]
    (for [field fields]
      (assoc field :values (get id->field-values (:id field) [])))))

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


;;; ------------------------------------------------------------ Sync Util Type Inference Fns ------------------------------------------------------------

(def ^:private ^:const pattern+base-types+special-type
  "Tuples of `[name-pattern set-of-valid-base-types special-type]`.
   Fields whose name matches the pattern and one of the base types should be given the special type.

   *  Convert field name to lowercase before matching against a pattern
   *  Consider a nil set-of-valid-base-types to mean \"match any base type\""
  (let [bool-or-int #{:type/Boolean :type/Integer}
        float       #{:type/Float}
        int-or-text #{:type/Integer :type/Text}
        text        #{:type/Text}]
    [[#"^.*_lat$"       float       :type/Latitude]
     [#"^.*_lon$"       float       :type/Longitude]
     [#"^.*_lng$"       float       :type/Longitude]
     [#"^.*_long$"      float       :type/Longitude]
     [#"^.*_longitude$" float       :type/Longitude]
     [#"^.*_rating$"    int-or-text :type/Category]
     [#"^.*_type$"      int-or-text :type/Category]
     [#"^.*_url$"       text        :type/URL]
     [#"^_latitude$"    float       :type/Latitude]
     [#"^active$"       bool-or-int :type/Category]
     [#"^city$"         text        :type/City]
     [#"^country$"      text        :type/Country]
     [#"^countryCode$"  text        :type/Country]
     [#"^currency$"     int-or-text :type/Category]
     [#"^first_name$"   text        :type/Name]
     [#"^full_name$"    text        :type/Name]
     [#"^gender$"       int-or-text :type/Category]
     [#"^last_name$"    text        :type/Name]
     [#"^lat$"          float       :type/Latitude]
     [#"^latitude$"     float       :type/Latitude]
     [#"^lon$"          float       :type/Longitude]
     [#"^lng$"          float       :type/Longitude]
     [#"^long$"         float       :type/Longitude]
     [#"^longitude$"    float       :type/Longitude]
     [#"^name$"         text        :type/Name]
     [#"^postalCode$"   int-or-text :type/ZipCode]
     [#"^postal_code$"  int-or-text :type/ZipCode]
     [#"^rating$"       int-or-text :type/Category]
     [#"^role$"         int-or-text :type/Category]
     [#"^sex$"          int-or-text :type/Category]
     [#"^state$"        text        :type/State]
     [#"^status$"       int-or-text :type/Category]
     [#"^type$"         int-or-text :type/Category]
     [#"^url$"          text        :type/URL]
     [#"^zip_code$"     int-or-text :type/ZipCode]
     [#"^zipcode$"      int-or-text :type/ZipCode]]))

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? (u/rpartial isa? :type/*) base-types))
    (assert (isa? special-type :type/*))))

(defn- infer-field-special-type
  "If `name` and `base-type` matches a known pattern, return the `special_type` we should assign to it."
  [field-name base-type]
  (when (and (string? field-name)
             (keyword? base-type))
    (or (when (= "id" (s/lower-case field-name)) :type/PK)
        (some (fn [[name-pattern valid-base-types special-type]]
                (when (and (some (partial isa? base-type) valid-base-types)
                           (re-matches name-pattern (s/lower-case field-name)))
                  special-type))
              pattern+base-types+special-type))))


;;; ------------------------------------------------------------ Sync Util CRUD Fns ------------------------------------------------------------

(defn update-field-from-field-def!
  "Update an EXISTING-FIELD from the given FIELD-DEF."
  {:arglists '([existing-field field-def])}
  [{:keys [id], :as existing-field} {field-name :name, :keys [base-type special-type pk? parent-id]}]
  (u/prog1 (assoc existing-field
             :base_type    base-type
             :display_name (or (:display_name existing-field)
                               (humanization/name->human-readable-name field-name))
             :special_type (or (:special_type existing-field)
                               special-type
                               (when pk?
                                 :type/PK)
                               (infer-field-special-type field-name base-type))

             :parent_id    parent-id)
    ;; if we have a different base-type or special-type, then update
    (when (first (d/diff <> existing-field))
      (db/update! Field id
        :display_name (:display_name <>)
        :base_type    base-type
        :special_type (:special_type <>)
        :parent_id    parent-id))))

(defn create-field-from-field-def!
  "Create a new `Field` from the given FIELD-DEF."
  {:arglists '([table-id field-def])}
  [table-id {field-name :name, :keys [base-type special-type pk? parent-id raw-column-id]}]
  {:pre [(integer? table-id) (string? field-name) (isa? base-type :type/*)]}
  (let [special-type (or special-type
                       (when pk? :type/PK)
                       (infer-field-special-type field-name base-type))]
    (db/insert! Field
      :table_id      table-id
      :raw_column_id raw-column-id
      :name          field-name
      :display_name  (humanization/name->human-readable-name field-name)
      :base_type     base-type
      :special_type  special-type
      :parent_id     parent-id)))
