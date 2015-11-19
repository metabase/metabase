(ns metabase.models.field-values
  (:require [clojure.tools.logging :as log]
            [korma.core :refer :all, :exclude [defentity update]]
            (metabase [db :refer :all]
                      [util :as u])
            [metabase.models.interface :refer :all]))

;; ## Entity + DB Multimethods

(defentity FieldValues
  [(table :metabase_fieldvalues)
   timestamped
   (types :human_readable_values :json, :values :json)]

  (post-select [_ field-values]
    (update-in field-values [:human_readable_values] #(or % {}))))

;; columns:
;; *  :id
;; *  :field_id
;; *  :updated_at             WHY! I *DESPISE* THESE USELESS FIELDS
;; *  :created_at
;; *  :values                 (JSON-encoded array like ["table" "scalar" "pie"])
;; *  :human_readable_values  (JSON-encoded map like {:table "Table" :scalar "Scalar"}

;; ## `FieldValues` Helper Functions

(defn field-should-have-field-values?
  "Should this `Field` be backed by a corresponding `FieldValues` object?"
  {:arglists '([field])}
  [{:keys [base_type special_type field_type] :as field}]
  {:pre [field_type
         (contains? field :base_type)
         (contains? field :special_type)]}
  (and (not= (keyword field_type) :sensitive)
       (not (contains? #{:DateField :DateTimeField :TimeField} (keyword base_type)))
       (or (contains? #{:category :city :state :country} (keyword special_type))
           (= (keyword base_type) :BooleanField))))

(defn- create-field-values
  "Create `FieldValues` for a `Field`."
  {:arglists '([field] [field human-readable-values])}
  [{field-id :id, field-name :name, :as field} & [human-readable-values]]
  {:pre [(integer? field-id)
         (:table field)]} ; need to pass a full `Field` object with delays beause the `metadata/` functions need those
  (log/debug (format "Creating FieldValues for Field %s..." (or field-name field-id))) ; use field name if available
  (ins FieldValues
    :field_id              field-id
    :values                (@(resolve 'metabase.db.metadata-queries/field-distinct-values) field)
    :human_readable_values human-readable-values))

(defn update-field-values!
  "Update the `FieldValues` for FIELD, creating them if needed"
  [{field-id :id, :as field}]
  {:pre [(integer? field-id)
         (field-should-have-field-values? field)]}
  (if-let [field-values (sel :one FieldValues :field_id field-id)]
    (upd FieldValues (:id field-values)
      :values (@(resolve 'metabase.db.metadata-queries/field-distinct-values) field))
    (create-field-values field)))

(defn create-field-values-if-needed
  "Create `FieldValues` for a `Field` if they *should* exist but don't already exist.
   Returns the existing or newly created `FieldValues` for `Field`."
  {:arglists '([field]
               [field human-readable-values])}
  [{field-id :id :as field} & [human-readable-values]]
  {:pre [(integer? field-id)
         (:table field)]}
  (when (field-should-have-field-values? field)
    (or (sel :one FieldValues :field_id field-id)
        (create-field-values field human-readable-values))))
