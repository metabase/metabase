(ns metabase.driver.sqlserver-test
  (:require [metabase.test
             [data :as data]
             [util :refer [obj->json->obj]]]
            [metabase.test.data
             [datasets :refer [expect-with-engine]]
             [interface :refer [def-database-definition]]]))

;;; ------------------------------------------------------------ VARCHAR(MAX) ------------------------------------------------------------
;; VARCHAR(MAX) comes back from jTDS as a "ClobImpl" so make sure it gets encoded like a normal string by Cheshire
(def ^:private ^:const a-gene
  "Really long string representing a gene like \"GGAGCACCTCCACAAGTGCAGGCTATCCTGTCGAGTAAGGCCT...\""
  (apply str (repeatedly 1000 (partial rand-nth [\A \G \C \T]))))

(def-database-definition ^:private ^:const genetic-data
  ["genetic-data"
   [{:field-name "gene", :base-type {:native "VARCHAR(MAX)"}}]
   [[a-gene]]])

(expect-with-engine :sqlserver
  [[1 a-gene]]
  (-> (data/dataset metabase.driver.sqlserver-test/genetic-data
        (data/run-query genetic-data))
      :data :rows obj->json->obj)) ; convert to JSON + back so the Clob gets stringified
