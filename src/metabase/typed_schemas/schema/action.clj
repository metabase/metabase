(ns metabase.typed-schemas.schema.action
  "Typed schema generation for actions that belong to no model."
  (:require
   [metabase.actions.core :as actions]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.db :as typed-schemas.db]
   [metabase.typed-schemas.schema.common :as schema.common]
   [metabase.typed-schemas.schema.model :as schema.model]))

(set! *warn-on-reflection* true)

(defn action-schemas
  "Returns schema entries for the readable query actions without a model among `database-ids` (nil for unscoped)."
  [database-ids]
  (let [rows            (filter mi/can-read? (typed-schemas.db/model-less-query-actions database-ids))
        details-by-id   (when (seq rows)
                          (into {} (map (juxt :id identity)) (actions/select-actions-for-ids nil (mapv :id rows))))
        details         (keep #(get details-by-id (:id %)) rows)
        destination-ids (schema.common/destination-db-ids (into #{} (keep :database_id) details))]
    (into []
          (comp (remove #(contains? destination-ids (:database_id %)))
                (map schema.model/action-detail-schema))
          details)))
