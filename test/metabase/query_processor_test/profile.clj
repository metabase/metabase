(ns metabase.query-processor-test.profile
  (:require
   [metabase.query-processor :as qp]
   [metabase.qp :as qp2]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [metabase.util :as u]
   [metabase.db.query :as mdb.query]
   [clojure.string :as str]
   [metabase.driver :as driver]))

(require 'criterium.core)

(def query
  (mt/dataset sample-dataset
    (-> (mt/mbql-query orders
          {:source-table $$orders
           :joins        [{:fields       :all
                           :source-table $$products
                           :condition    [:= $product_id &Products.products.id]
                           :alias        "Products"}]
           :order-by     [[:asc $id]]
           :limit        2})
        (mt/nest-query 4))))

;; NOCOMMIT
(defn x []
  #_(qp/compile query)
  (toucan2.core/with-call-count [call-count]
    (let [result (u/profile "Compile [old QP]"
                   (qp/compile query))]
      (println "DB CALLS =>" (call-count))
      (update result :query (comp str/split-lines mdb.query/format-sql))))
  #_(criterium.core/bench
     (qp/compile query)))

(defn y []
  #_(qp/compile query)
  (toucan2.core/with-call-count [call-count]
    (let [result (u/profile "Compile [QP2]"
                   (binding [driver/*driver* :h2/mbql5]
                     (qp2/compile query)))]
      (println "DB CALLS =>" (call-count))
      (update result :query (comp str/split-lines mdb.query/format-sql))))
  #_(criterium.core/bench
   (qp/compile query)))

(require 'metabase.driver.sql)
(require 'metabase.driver.sql.mbql5)

(driver/register! :h2/mbql5 :parent #{:h2 :sql/mbql5})

;; 2023-08-19 03:31:10,208 INFO metabase.util :: Compile [old QP] took 787.7 ms
;; DB CALLS => 7

;; 2023-08-19 03:46:05,256 INFO metabase.util :: Compile [QP2] took 109.7 ms
;; DB CALLS => 5
