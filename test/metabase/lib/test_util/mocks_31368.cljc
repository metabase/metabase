(ns metabase.lib.test-util.mocks-31368
  "Repro for `[MLv2] Handle MLv1 field references for columns from questions/models in MLv2` (#31368)"
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(def ^:private legacy-card-query
  {:database (meta/id)
   :type     :query
   :query    {:source-table (meta/id :orders)
              :joins        [{:fields       :all
                              :source-table (meta/id :products)
                              :alias        "Products"
                              :condition    [:=
                                             [:field (meta/id :orders :product-id) nil]
                                             [:field (meta/id :products :id) {:join-alias "Products"}]]}]}})

(defn- legacy-card-metadata []
  ;; legacy result metadata will already include the Join name in the `:display-name`, so simulate that. Make
  ;; sure we're not including it twice.
  (for [col (lib/returned-columns
             (lib/query meta/metadata-provider legacy-card-query))]
    (cond-> col
      (:source-alias col)
      (update :display-name (fn [display-name]
                              (str (:source-alias col) " → " display-name))))))

(defn query-with-legacy-source-card
  "An MLv2 query that has a `:source-card` that has a legacy query, and legacy metadata."
  [has-result-metadata?]
  (let [metadata-provider (lib.tu/mock-metadata-provider
                           meta/metadata-provider
                           {:cards [(cond-> {:id            1
                                             :database-id   (meta/id)
                                             :name          "Card 1"
                                             :dataset-query legacy-card-query}
                                      has-result-metadata? (assoc :result-metadata (legacy-card-metadata)))]})]
    (lib/query metadata-provider (lib.metadata/card metadata-provider 1))))
