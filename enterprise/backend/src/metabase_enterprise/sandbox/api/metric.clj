(ns metabase-enterprise.sandbox.api.metric
  "Enterprise sandbox filtering for metric dimensions.
   Overrides `metabase.metrics.permissions/sandbox-restricted-fields` to restrict
   dimensions from sandboxed tables to only fields in the sandbox source card."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- source-card-allowed-field-ids
  "Extract the set of allowed field IDs from a sandbox source card's result_metadata.
   Tries field IDs first; falls back to resolving column names against the table's fields
   (for native query source cards whose result_metadata lacks :id).
   Returns nil when result_metadata is absent (attribute-only sandbox or missing card)."
  [table-id {:keys [result_metadata]}]
  (when (seq result_metadata)
    (let [by-id (into #{} (keep u/id) result_metadata)]
      (if (seq by-id)
        by-id
        ;; Native card fallback: resolve column names → field IDs via the table
        (let [col-names    (into #{} (keep :name) result_metadata)
              name->fid    (when (seq col-names)
                             (into {}
                                   (map (juxt :name :id))
                                   (t2/select [:model/Field :id :name]
                                              :table_id table-id
                                              :name [:in col-names])))]
          (not-empty (set (vals name->fid))))))))

(defenterprise sandbox-restricted-fields
  "For sandboxed tables, returns {table-id -> #{allowed-field-ids}} for tables with
   column-level sandbox restrictions. Tables not in the map have no column restriction.
   Returns nil if no sandboxes apply.

   Uses :feature :none so this code runs even when the :sandboxes feature is unavailable.
   When the feature is off but sandboxes are configured, returns empty sets to block all
   dimensions from sandboxed tables (fail closed). When the feature is on, resolves
   allowed fields from source card result_metadata."
  :feature :none
  [table-ids]
  (when-let [sandboxes (seq (filter #(contains? table-ids (:table_id %))
                                    (perms/sandboxes-for-user)))]
    (if-not (premium-features/has-feature? :sandboxes)
      ;; Feature unavailable — block all dimensions from every sandboxed table
      (into {} (map (fn [{:keys [table_id]}] [table_id #{}])) sandboxes)
      ;; Feature available — resolve allowed fields from source cards
      (let [card-ids    (into #{} (keep :card_id) sandboxes)
            cards-by-id (when (seq card-ids)
                          (into {}
                                (map (juxt :id identity))
                                (t2/select [:model/Card :id :result_metadata :card_schema]
                                           :id [:in card-ids])))]
        (not-empty
         (into {}
               (keep (fn [{:keys [table_id card_id]}]
                       (if-not card_id
                         ;; Attribute-only sandbox — no column restriction
                         nil
                         ;; Source-card sandbox — resolve allowed fields, or block all if unresolvable
                         [table_id (or (source-card-allowed-field-ids table_id (get cards-by-id card_id))
                                       #{})])))
               sandboxes))))))
