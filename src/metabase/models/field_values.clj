(ns metabase.models.field-values
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as cheshire]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.db.metadata-queries :as metadata]
            (metabase.models [hydrate :refer [realize-json]])
            [metabase.util :as u]))

(defentity FieldValues
  (table :metabase_fieldvalues))

;; columns:
;; *  :id
;; *  :field_id
;; *  :updated_at             WHY! I *DESPISE* THESE USELESS FIELDS
;; *  :created_at
;; *  :values                 (JSON-encoded array like ["table" "scalar" "pie"])
;; *  :human_readable_values  (JSON-encoded map like {:table "Table" :scalar "Scalar"}

(defmethod post-select FieldValues [_ {:keys [values human_readable_values] :as field-values}]
  (-> field-values
      (realize-json :values :human_readable_values)
      (update-in [:human_readable_values] (fn [hr-values]          ; return an empty map for :human_readable_values in cases where it is nil
                                            (or hr-values {})))))

(defmethod pre-insert FieldValues [_ {:keys [values human_readable_values] :as field-values}]
  (when values
    (assert (sequential? values)))
  (when human_readable_values
    (assert (map? human_readable_values)))
  (assoc field-values
         :created_at            (u/new-sql-timestamp)
         :updated_at            (u/new-sql-timestamp)
         :values                (cheshire/generate-string values)
         :human_readable_values (cheshire/generate-string human_readable_values))) ; why is there no counterpart to realize-json ?

(defmethod pre-update FieldValues [_ {:keys [values human_readable_values] :as field-values}]
  (when values
    (assert (sequential? values)))
  (when human_readable_values
    (assert (map? human_readable_values)))
  (cond-> (assoc field-values :updated_at (u/new-sql-timestamp))
    values (assoc :values (cheshire/generate-string values))
    human_readable_values (assoc :human_readable_values (cheshire/generate-string human_readable_values))))


;; ## `FieldValues` Helper Functions

(defn create-field-values
  "Create `FieldValues` for a `Field`."
  {:arglists '([field]
               [field human-readable-values])}
  [{field-id :id :as field} & [human-readable-values]]
  {:pre [(integer? field-id)
         (:table field)]}                                              ; need to pass a full `Field` object with delays beause the `metadata/` functions need those
  (log/debug (format "Creating FieldValues for Field %d..." field-id))
  (ins FieldValues
    :field_id field-id
    :values (metadata/field-distinct-values field)
    :human_readable_values human-readable-values))

(defn create-field-values-if-needed
  "Create `FieldValues` for a `Field` if they don't already exist."
  {:arglists '([field]
               [field human-readable-values])}
  [{field-id :id :as field} & [human-readable-values]]
  {:pre [(integer? field-id)
         (:table field)]}
  (when-not (exists? FieldValues :field_id field-id)
    (create-field-values field human-readable-values)))
