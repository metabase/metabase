(ns dev.create-metrics
  "Development script to create sample metrics using metabase.lib to author MBQL queries.
   These metrics target the Sample Database."
  (:require
   [metabase.lib-be.metadata.jvm :as lib-be.metadata]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn sample-database
  "Returns the Sample Database record, or nil if not found."
  []
  (t2/select-one :model/Database :is_sample true))

(defn sample-database-id
  "Returns the ID of the Sample Database."
  []
  (:id (sample-database)))

(defn- metadata-provider
  "Creates a metadata provider for the sample database."
  [db-id]
  (lib-be.metadata/application-database-metadata-provider db-id))

(defn- table-by-name
  "Finds a table by name in the metadata provider."
  [mp table-name]
  (->> (lib.metadata/tables mp)
       (filter #(= (:name %) table-name))
       first))

(defn- field-by-name
  "Finds a field by name in a table."
  [mp table-id field-name]
  (->> (lib.metadata/fields mp table-id)
       (filter #(= (:name %) field-name))
       first))

(defn- create-metric!
  "Creates a metric card with the given parameters."
  [{:keys [name description query]}]
  (let [creator (t2/select-one :model/User :is_superuser true)]
    (card/create-card!
     {:name          name
      :description   description
      :type          :metric
      :dataset_query query
      :display       :scalar}
     creator)))

;;; --------------------------------------------------- Metric Definitions ---------------------------------------------------

(defn total-orders-metric
  "Metric: Total number of orders."
  [mp]
  (let [orders-table (table-by-name mp "ORDERS")]
    {:name        "Total Orders"
     :description "Count of all orders in the system"
     :query       (-> (lib/query mp orders-table)
                      (lib/aggregate (lib/count)))}))

(defn total-revenue-metric
  "Metric: Total revenue from all orders."
  [mp]
  (let [orders-table (table-by-name mp "ORDERS")
        total-field  (field-by-name mp (:id orders-table) "TOTAL")]
    {:name        "Total Revenue"
     :description "Sum of all order totals"
     :query       (-> (lib/query mp orders-table)
                      (lib/aggregate (lib/sum (lib/ref total-field))))}))

(defn average-order-value-metric
  "Metric: Average order value."
  [mp]
  (let [orders-table (table-by-name mp "ORDERS")
        total-field  (field-by-name mp (:id orders-table) "TOTAL")]
    {:name        "Average Order Value"
     :description "Average total per order"
     :query       (-> (lib/query mp orders-table)
                      (lib/aggregate (lib/avg (lib/ref total-field))))}))

(defn total-customers-metric
  "Metric: Total number of unique customers (people)."
  [mp]
  (let [people-table (table-by-name mp "PEOPLE")]
    {:name        "Total Customers"
     :description "Count of all customers"
     :query       (-> (lib/query mp people-table)
                      (lib/aggregate (lib/count)))}))

(defn total-products-metric
  "Metric: Total number of products."
  [mp]
  (let [products-table (table-by-name mp "PRODUCTS")]
    {:name        "Total Products"
     :description "Count of all products in catalog"
     :query       (-> (lib/query mp products-table)
                      (lib/aggregate (lib/count)))}))

(defn average-product-rating-metric
  "Metric: Average product rating across all reviews."
  [mp]
  (let [reviews-table (table-by-name mp "REVIEWS")
        rating-field  (field-by-name mp (:id reviews-table) "RATING")]
    {:name        "Average Product Rating"
     :description "Average rating from all product reviews"
     :query       (-> (lib/query mp reviews-table)
                      (lib/aggregate (lib/avg (lib/ref rating-field))))}))

(defn total-reviews-metric
  "Metric: Total number of product reviews."
  [mp]
  (let [reviews-table (table-by-name mp "REVIEWS")]
    {:name        "Total Reviews"
     :description "Count of all product reviews"
     :query       (-> (lib/query mp reviews-table)
                      (lib/aggregate (lib/count)))}))

(defn total-quantity-sold-metric
  "Metric: Total quantity of items sold across all orders."
  [mp]
  (let [orders-table   (table-by-name mp "ORDERS")
        quantity-field (field-by-name mp (:id orders-table) "QUANTITY")]
    {:name        "Total Quantity Sold"
     :description "Sum of quantities across all orders"
     :query       (-> (lib/query mp orders-table)
                      (lib/aggregate (lib/sum (lib/ref quantity-field))))}))

;;; --------------------------------------------------- Public API ---------------------------------------------------

(defn all-metric-definitions
  "Returns all metric definitions."
  [mp]
  [(total-orders-metric mp)
   (total-revenue-metric mp)
   (average-order-value-metric mp)
   (total-customers-metric mp)
   (total-products-metric mp)
   (average-product-rating-metric mp)
   (total-reviews-metric mp)
   (total-quantity-sold-metric mp)])

(defn create-sample-metrics!
  "Creates all sample metrics targeting the Sample Database.
   Returns a vector of the created metric cards.

   Usage:
     (dev.create-metrics/create-sample-metrics!)"
  []
  (if-let [db-id (sample-database-id)]
    (lib-be.metadata/with-metadata-provider-cache
      (let [mp      (metadata-provider db-id)
            metrics (all-metric-definitions mp)]
        (log/infof "Creating %d metrics for Sample Database (id=%d)..." (count metrics) db-id)
        (mapv (fn [metric-def]
                (log/infof "Creating metric: %s" (:name metric-def))
                (create-metric! metric-def))
              metrics)))
    (throw (ex-info "Sample Database not found. Please ensure it's loaded." {}))))

(defn delete-sample-metrics!
  "Deletes all metrics created by this script (by name matching).

   Usage:
     (dev.create-metrics/delete-sample-metrics!)"
  []
  (let [metric-names #{"Total Orders" "Total Revenue" "Average Order Value"
                       "Total Customers" "Total Products" "Average Product Rating"
                       "Total Reviews" "Total Quantity Sold"}]
    (t2/delete! :model/Card :name [:in metric-names] :type :metric)))

(comment
  ;; Create all sample metrics
  (create-sample-metrics!)

  ;; Delete all sample metrics
  (delete-sample-metrics!)

  ;; Inspect a single metric query
  (let [db-id (sample-database-id)
        mp    (metadata-provider db-id)]
    (total-orders-metric mp))

  ;; List tables in sample database
  (let [db-id (sample-database-id)
        mp    (metadata-provider db-id)]
    (map :name (lib.metadata/tables mp))))
