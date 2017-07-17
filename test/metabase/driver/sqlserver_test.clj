(ns metabase.driver.sqlserver-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver
             [generic-sql :as sql]
             [sqlserver :as sqlserver]]
            [metabase.test
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


;;; Test that additional connection string options work (#5296)
(expect
  {:ssl          "off"
   :instance     nil
   :appName      "Metabase <version>"
   :password     "toucans"
   :classname    "net.sourceforge.jtds.jdbc.Driver"
   :subprotocol  "jtds:sqlserver"
   :useNTLMv2    false
   :domain       nil
   :loginTimeout 5
   :user         "cam"
   :subname      "//localhost:1433/birddb;trustServerCertificate=false"}
  (-> (sql/connection-details->spec
       (sqlserver/->SQLServerDriver)
       {:user               "cam"
        :password           "toucans"
        :db                 "birddb"
        :host               "localhost"
        :port               1433
        :additional-options "trustServerCertificate=false"})
      ;; the MB version Is subject to change between test runs, so replace the part like `v.0.25.0` with `<version>`
      (update :appName #(str/replace % #"\s.*$" " <version>"))))
