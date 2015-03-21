(ns metabase.models.field-values
  (:require [cheshire.core :as cheshire]
            [korma.core :refer :all]
            [metabase.db :refer :all]
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
  (realize-json field-values :values :human_readable_values))

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
