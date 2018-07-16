(ns metabase.driver.sybase-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver
             [generic-sql :as sql]
             [sybase :as sybase]]
            [metabase.test
             [data :as data]
             [util :refer [obj->json->obj] :as tu]]
            [metabase.test.data
             [datasets :refer [expect-with-engine]]
             [interface :refer [def-database-definition]]]))

;;; ------------------------------------------------------------ VARCHAR(MAX) ------------------------------------------------------------
;; Make sure something long doesn't come back as some weird type like `ClobImpl`
(def ^:private ^:const a-gene
  "Really long string representing a gene like \"GGAGCACCTCCACAAGTGCAGGCTATCCTGTCGAGTAAGGCCT...\""
  (apply str (repeatedly 1000 (partial rand-nth [\A \G \C \T]))))

(def-database-definition ^:private ^:const genetic-data
  [["genetic-data"
     [{:field-name "gene", :base-type {:native "VARCHAR(MAX)"}}]
     [[a-gene]]]])

(expect-with-engine :sybase
  [[1 a-gene]]
  (-> (data/dataset metabase.driver.sybase-test/genetic-data
        (data/run-query genetic-data))
      :data :rows obj->json->obj)) ; convert to JSON + back so the Clob gets stringified

;;; Test that additional connection string options work (#5296)
(expect
  {:classname       "net.sourceforge.jtds.jdbc.Driver"
   :subprotocol     "jtds:sybase"
   :applicationName "Metabase <version>"
   :subname         "//localhost:1433/birddb;trustServerCertificate=false"
   :instance        nil
   :user            "cam"
   :password        "toucans"
   :useNTLMv2       false
   :domain          nil
   :ssl             "off"}
  (-> (sql/connection-details->spec
       (sybase/->SybaseDriver)
       {:user               "cam"
        :password           "toucans"
        :db                 "birddb"
        :host               "localhost"
        :port               1433
        :additional-options "trustServerCertificate=false"})
      ;; the MB version Is subject to change between test runs, so replace the part like `v.0.25.0` with `<version>`
      (update :applicationName #(str/replace % #"\s.*$" " <version>"))))

(expect-with-engine :sybase
  "UTC"
  (tu/db-timezone-id))
