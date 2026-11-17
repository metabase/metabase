(ns metabase.lib.test-util.metadata-providers.with-cards-for-queries
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.test-util.metadata-providers.mock
    :as lib.tu.metadata-providers.mock]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn metadata-provider-with-cards-for-queries :- ::lib.schema.metadata/metadata-provider
  "Create a metadata provider that adds a Card for each query in `queries`. Cards do not include result
  metadata. Cards have IDs starting at `1` and increasing sequentially."
  [parent-metadata-provider :- ::lib.schema.metadata/metadata-provider
   queries                  :- [:sequential {:min 1} ::lib.schema.metadata/card.query]]
  (lib.tu.metadata-providers.mock/mock-metadata-provider
   parent-metadata-provider
   {:cards (into []
                 (map-indexed
                  (fn [i {database-id :database, :as query}]
                    {:id            (inc i)
                     :name          (lib.util/format "Card %d" (inc i))
                     :database-id   (or (when (pos-int? database-id)
                                          database-id)
                                        (u/the-id (lib.metadata/database parent-metadata-provider)))
                     :table-id      (if (:lib/type query)
                                      (lib.util/source-table-id query)
                                      (let [table-id (get-in query [:query :source-table])]
                                        (when (pos-int? table-id)
                                          table-id)))
                     :dataset-query query}))
                 queries)}))
