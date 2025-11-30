(ns metabase-enterprise.metabot-v3.tools.query-analysis
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   ^{:clj-kondo/ignore [:metabase/modules]} [metabase.lib-be.models.transforms :as lib-be.transforms]
   ^{:clj-kondo/ignore [:metabase/modules]} [metabase.lib.walk.util :as lib.walk.util]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(defn- fetch-table-metadata
  [table-ids]
  (if (empty? table-ids)
    []
    (->> (t2/select [:model/Table :id :name :entity_type] :id [:in table-ids])
         (filter mi/can-read?)
         (mapv (fn [table]
                 {:id (:id table)
                  :name (:name table)
                  :type (if (= (:entity_type table) :model) :model :table)})))))

(defn- fetch-card-metadata
  [card-ids]
  (->> (t2/select [:model/Card :id :name :type :card_schema :collection_id]
                  :id [:in card-ids])
       (filter mi/can-read?)
       (mapv #(select-keys % [:id :name :type]))))

(defn analyze-query
  "Analyze an MBQL query and return metadata about referenced tables and cards.

  Takes a map with `:query` key containing an MBQL query map.
  Returns a map with `:structured_output` containing:
  - `:source_tables` - tables directly referenced in the query
  - `:source_cards` - cards (models/metrics) referenced in the query
  - `:implicitly_joined_tables` - tables joined via field references

  Each item includes only basic metadata (id, name, type) and respects user permissions."
  [{:keys [query]}]
  (try
    (let [normalized-query (lib-be.transforms/normalize-query query)
          source-table-ids (lib.walk.util/all-source-table-ids normalized-query)
          source-card-ids (lib.walk.util/all-source-card-ids normalized-query)
          implicitly-joined-table-ids (lib.walk.util/all-implicitly-joined-table-ids normalized-query)
          source-tables (fetch-table-metadata source-table-ids)
          source-cards (fetch-card-metadata source-card-ids)
          implicitly-joined-tables (fetch-table-metadata implicitly-joined-table-ids)]
      {:structured_output {:source_tables source-tables
                           :source_cards source-cards
                           :implicitly_joined_tables implicitly-joined-tables}})
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
