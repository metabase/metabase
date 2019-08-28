(ns metabase.driver.sqlserver-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu :refer [obj->json->obj]]]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as tx]]))

;;; -------------------------------------------------- VARCHAR(MAX) --------------------------------------------------

;; Make sure something long doesn't come back as some weird type like `ClobImpl`
(def ^:private a-gene
  "Really long string representing a gene like \"GGAGCACCTCCACAAGTGCAGGCTATCCTGTCGAGTAAGGCCT...\""
  (apply str (repeatedly 1000 (partial rand-nth [\A \G \C \T]))))

(tx/defdataset ^:private genetic-data
  [["genetic-data"
     [{:field-name "gene", :base-type {:native "VARCHAR(MAX)"}}]
     [[a-gene]]]])

(datasets/expect-with-driver :sqlserver
  [[1 a-gene]]
  (-> (data/dataset metabase.driver.sqlserver-test/genetic-data
        (data/run-mbql-query genetic-data))
      :data :rows obj->json->obj)) ; convert to JSON + back so the Clob gets stringified

;;; Test that additional connection string options work (#5296)
(expect
  {:subprotocol     "sqlserver"
   :applicationName "Metabase <version>"
   :subname         "//localhost;trustServerCertificate=false"
   :database        "birddb"
   :port            1433
   :instanceName    nil
   :user            "cam"
   :password        "toucans"
   :encrypt         false
   :loginTimeout    10}
  (-> (sql-jdbc.conn/connection-details->spec
       :sqlserver
       {:user               "cam"
        :password           "toucans"
        :db                 "birddb"
        :host               "localhost"
        :port               1433
        :additional-options "trustServerCertificate=false"})
      ;; the MB version Is subject to change between test runs, so replace the part like `v.0.25.0` with `<version>`
      (update :applicationName #(str/replace % #"\s.*$" " <version>"))))

(datasets/expect-with-driver :sqlserver
  "UTC"
  (tu/db-timezone-id))

;; SQL Server doesn't let you use ORDER BY in nested SELECTs unless you also specify a TOP (their equivalent of
;; LIMIT). Make sure we add a max-results LIMIT to the nested query
(datasets/expect-with-driver :sqlserver
  {:query  (str
            "SELECT TOP 1048576 \"source\".\"name\" AS \"name\" "
            "FROM ("
            "SELECT TOP 1048576 "
            "\"dbo\".\"venues\".\"name\" AS \"name\" "
            "FROM \"dbo\".\"venues\" "
            "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
            " ) \"source\" ") ; not sure why this generates an extra space before the closing paren, but it does
   :params nil}
  (qp/query->native
    (data/mbql-query venues
      {:source-query {:source-table $$venues
                      :fields       [$name]
                      :order-by     [[:asc $id]]}})))

;; make sure when adding TOP clauses to make ORDER BY work we don't stomp over any explicit TOP clauses that may have
;; been set in the query
(datasets/expect-with-driver :sqlserver
  {:query (str "SELECT TOP 10 \"source\".\"name\" AS \"name\" "
               "FROM ("
               "SELECT TOP 20 "
               "\"dbo\".\"venues\".\"name\" AS \"name\" "
               "FROM \"dbo\".\"venues\" "
               "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
               " ) \"source\" ")
   :params nil}
  (qp/query->native
    (data/mbql-query venues
      {:source-query {:source-table $$venues
                      :fields       [$name]
                      :order-by     [[:asc $id]]
                      :limit        20}
       :limit        10})))

;; We don't need to add TOP clauses for top-level order by. Normally we always add one anyway because of the
;; max-results stuff, but make sure our impl doesn't add one when it's not in the source MBQL
(datasets/expect-with-driver :sqlserver
  {:query (str "SELECT \"source\".\"name\" AS \"name\" "
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
                           (data/mbql-query venues
                             {:source-query {:source-table $$venues
                                             :fields       [$name]
                                             :order-by     [[:asc $id]]}
                              :order-by     [[:asc $id]]}))
                         (m/dissoc-in [:query :limit]))]
    (qp.test-util/with-everything-store
      (driver/mbql->native :sqlserver preprocessed))))

;; ok, generating all that SQL above is nice, but let's make sure our queries actually work!
(datasets/expect-with-driver :sqlserver
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]]
  (qp.test/rows
    (qp/process-query
      (data/mbql-query venues
        {:source-query {:source-table $$venues
                        :fields       [$name]
                        :order-by     [[:asc $id]]
                        :limit        5}
         :limit        3}))))

;; Make sure datetime bucketing functions work properly with languages that format dates like yyyy-dd-MM instead of
;; yyyy-MM-dd (i.e. not American English) (#9057)
(datasets/expect-with-driver :sqlserver
  [{:my-date #inst "2019-02-01T00:00:00.000-00:00"}]
  ;; we're doing things here with low-level calls to HoneySQL (emulating what the QP does) instead of using normal QP
  ;; pathways because `SET LANGUAGE` doesn't seem to persist to subsequent executions so to test that things are
  ;; working we need to add to in from of the query we're trying to check
  (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/connection-details->spec :sqlserver
                                      (tx/dbdef->connection-details :sqlserver :db {:database-name "test-data"}))]
    (try
      (jdbc/execute! t-conn "CREATE TABLE temp (d DATETIME2);")
      (jdbc/execute! t-conn ["INSERT INTO temp (d) VALUES (?)" #inst "2019-02-08T00:00:00Z"])
      (jdbc/query t-conn (let [[sql & args] (hsql/format {:select [[(sql.qp/date :sqlserver :month :temp.d) :my-date]]
                                                          :from   [:temp]}
                                              :quoting :ansi, :allow-dashed-names? true)]
                           (cons (str "SET LANGUAGE Italian; " sql) args)))
      ;; rollback transaction so `temp` table gets discarded
      (finally (.rollback (jdbc/get-connection t-conn))))))
