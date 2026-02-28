(ns metabase-enterprise.product-analytics.test-util
  "Shared test utilities for Product Analytics tests."
  (:require
   [metabase-enterprise.product-analytics.setup :as pa.setup]
   [metabase.product-analytics.core :as pa]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn cleanup-pa-db!
  "Remove the Product Analytics virtual DB and collection."
  []
  (t2/delete! :model/Database :is_product_analytics true)
  (t2/delete! :model/Collection :entity_id pa/product-analytics-collection-entity-id))

(defn ensure-pa-db!
  "Install the PA virtual DB (temporarily grants the :product-analytics feature)."
  []
  (mt/with-premium-features #{:product-analytics}
    (pa.setup/ensure-product-analytics-db-installed!)))

(defmacro with-pa-db-cleanup
  "Cleans up the PA DB before and after `body`."
  [& body]
  `(do
     (cleanup-pa-db!)
     (try
       ~@body
       (finally
         (cleanup-pa-db!)))))
