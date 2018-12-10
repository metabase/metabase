(ns metabase.driver.sqlserver-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver
             [generic-sql :as sql]
             [sqlserver :as sqlserver]]
            [metabase.query-processor :as qp]
            [metabase.test
             [data :as data]
             [util :as tu :refer [obj->json->obj]]]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data
             [datasets :as datasets :refer [expect-with-engine]]
             [interface :refer [def-database-definition]]]))

;;; -------------------------------------------------- VARCHAR(MAX) --------------------------------------------------

;; Make sure something long doesn't come back as some weird type like `ClobImpl`
(def ^:private ^:const a-gene
  "Really long string representing a gene like \"GGAGCACCTCCACAAGTGCAGGCTATCCTGTCGAGTAAGGCCT...\""
  (apply str (repeatedly 1000 (partial rand-nth [\A \G \C \T]))))

(def-database-definition ^:private ^:const genetic-data
  [["genetic-data"
     [{:field-name "gene", :base-type {:native "VARCHAR(MAX)"}}]
     [[a-gene]]]])

(expect-with-engine :sqlserver
  [[1 a-gene]]
  (-> (data/dataset metabase.driver.sqlserver-test/genetic-data
        (data/run-mbql-query genetic-data))
      :data :rows obj->json->obj)) ; convert to JSON + back so the Clob gets stringified

;;; Test that additional connection string options work (#5296)
(expect
  {:classname       "com.microsoft.sqlserver.jdbc.SQLServerDriver"
   :subprotocol     "sqlserver"
   :applicationName "Metabase <version>"
   :subname         "//localhost;trustServerCertificate=false"
   :database        "birddb"
   :port            1433
   :instanceName    nil
   :user            "cam"
   :password        "toucans"
   :encrypt         false
   :loginTimeout    10}
  (-> (sql/connection-details->spec
       (sqlserver/->SQLServerDriver)
       {:user               "cam"
        :password           "toucans"
        :db                 "birddb"
        :host               "localhost"
        :port               1433
        :additional-options "trustServerCertificate=false"})
      ;; the MB version Is subject to change between test runs, so replace the part like `v.0.25.0` with `<version>`
      (update :applicationName #(str/replace % #"\s.*$" " <version>"))))

(expect-with-engine :sqlserver
  "UTC"
  (tu/db-timezone-id))

;; SQL Server doesn't let you use ORDER BY in nested SELECTs unless you also specify a TOP (their equivalent of
;; LIMIT). Make sure we add a max-results LIMIT to the nested query
(datasets/expect-with-engine :sqlserver
  {:query  (str
            "SELECT TOP 1048576 * "
            "FROM ("
            "SELECT TOP 1048576 "
            "\"dbo\".\"venues\".\"name\" AS \"name\" "
            "FROM \"dbo\".\"venues\" "
            "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
            " ) \"source\" ") ; not sure why this generates an extra space before the closing paren, but it does
   :params nil}
  (qp/query->native
    (data/$ids [venues {:wrap-field-ids? true}]
      {:type     :query
       :database (data/id)
       :query    {:source-query {:source-table $$table
                                 :fields       [$name]
                                 :order-by     [[:asc $id]]}}})))

;; make sure when adding TOP clauses to make ORDER BY work we don't stomp over any explicit TOP clauses that may have
;; been set in the query
(datasets/expect-with-engine :sqlserver
  {:query (str "SELECT TOP 10 * "
               "FROM ("
               "SELECT TOP 20 "
               "\"dbo\".\"venues\".\"name\" AS \"name\" "
               "FROM \"dbo\".\"venues\" "
               "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
               " ) \"source\" ")
   :params nil}
  (qp/query->native
    (data/$ids [venues {:wrap-field-ids? true}]
      {:type     :query
       :database (data/id)
       :query    {:source-query {:source-table $$table
                                 :fields       [$name]
                                 :order-by     [[:asc $id]]
                                 :limit        20}
                  :limit        10}})))

;; We don't need to add TOP clauses for top-level order by. Normally we always add one anyway because of the
;; max-results stuff, but make sure our impl doesn't add one when it's not in the source MBQL
(datasets/expect-with-engine :sqlserver
  {:query (str "SELECT * "
               "FROM ("
               "SELECT TOP 1048576 "
               "\"dbo\".\"venues\".\"name\" AS \"name\" "
               "FROM \"dbo\".\"venues\" "
               "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
               " ) \"source\" "
               "ORDER BY \"source\".\"id\" ASC")
   :params nil}
  ;; in order to actually see how things would work without the implicit max-results limit added we'll preprocess
  ;; the query, strip off the `:limit` that got added, and then feed it back to the QP where we left off
  (let [preprocessed (-> (qp/query->preprocessed
                           (data/$ids [venues {:wrap-field-ids? true}]
                             {:type     :query
                              :database (data/id)
                              :query    {:source-query {:source-table $$table
                                                        :fields       [$name]
                                                        :order-by     [[:asc $id]]}
                                         :order-by     [[:asc $id]]}}))
                         (m/dissoc-in [:query :limit]))]
    (qp.test-util/with-everything-store
      (driver/mbql->native (driver/engine->driver :sqlserver) preprocessed))))

;; ok, generating all that SQL above is nice, but let's make sure our queries actually work!
(datasets/expect-with-engine :sqlserver
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]]
  (qp.test/rows
    (qp/process-query
      (data/$ids [venues {:wrap-field-ids? true}]
        {:type     :query
         :database (data/id)
         :query    {:source-query {:source-table $$table
                                   :fields       [$name]
                                   :order-by     [[:asc $id]]
                                   :limit        5}
                    :limit        3}}))))
