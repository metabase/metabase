(ns ^:mb/driver-tests metabase.driver.clickhouse-test
  "Tests for specific behavior of the ClickHouse driver."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.clickhouse :as clickhouse]
   [metabase.driver.clickhouse-qp :as clickhouse-qp]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse :as ctd]
   [taoensso.nippy :as nippy]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;; the mt/with-dynamic-redefs macro was renamed to mt/with-dynamic-fn-redefs for 0.53+
;; as 0.52 is still tested by CI we will check which macro is defined and use that
(defmacro with-dynamic-redefs [bindings & body]
  (if (resolve `mt/with-dynamic-redefs)
    `(mt/with-dynamic-redefs ~bindings ~@body)
    `(mt/with-dynamic-fn-redefs ~bindings ~@body)))

(deftest ^:parallel clickhouse-version
  (mt/test-driver :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db
       {:engine  :clickhouse
        :details (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})}]
      (let [version (driver/dbms-version :clickhouse db)]
        (is (number? (get-in version [:semantic-version :major])))
        (is (number? (get-in version [:semantic-version :minor])))
        (is (string? (get    version :version)))))))

(deftest ^:parallel clickhouse-server-timezone
  (mt/test-driver :clickhouse
    (is (= "UTC"
           (let [details (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})
                 spec    (sql-jdbc.conn/connection-details->spec :clickhouse details)]
             (driver/db-default-timezone :clickhouse spec))))))

(deftest ^:parallel clickhouse-connection-string
  (mt/with-dynamic-fn-redefs [;; This function's implementation requires the connection details to actually connect to the
                              ;; database, which is orthogonal to the purpose of this test.
                              clickhouse/cloud? (constantly false)]
    (testing "connection with no additional options"
      (is (= ctd/default-connection-params
             (sql-jdbc.conn/connection-details->spec
              :clickhouse
              {}))))
    (testing "custom connection with additional options"
      (is (= (merge
              ctd/default-connection-params
              {:subname "//myclickhouse:9999/foo?sessionTimeout=42"
               :user "bob"
               :password "qaz"
               :ssl true
               :custom_http_params "max_threads=42,allow_experimental_analyzer=0"})
             (sql-jdbc.conn/connection-details->spec
              :clickhouse
              {:host "myclickhouse"
               :port 9999
               :user "bob"
               :password "qaz"
               :dbname "foo"
               :additional-options "sessionTimeout=42"
               :ssl true
               :clickhouse-settings "max_threads=42,allow_experimental_analyzer=0"}))))
    (testing "nil dbname handling"
      (is (= ctd/default-connection-params
             (sql-jdbc.conn/connection-details->spec
              :clickhouse {:dbname nil}))))
    (testing "schema removal"
      (doall
       (for [host ["localhost" "http://localhost" "https://localhost"]]
         (testing (str "for host " host)
           (is (= ctd/default-connection-params
                  (sql-jdbc.conn/connection-details->spec
                   :clickhouse {:host host}))))))
      (doall
       (for [host ["myhost" "http://myhost" "https://myhost"]]
         (testing (str "for host " host)
           (is (= (merge ctd/default-connection-params
                         {:subname "//myhost:8123/default"})
                  (sql-jdbc.conn/connection-details->spec
                   :clickhouse {:host host}))))))
      (doall
       (for [host ["sub.example.com" "http://sub.example.com" "https://sub.example.com"]]
         (testing (str "for host " host " with some additional params")
           (is (= (merge ctd/default-connection-params
                         {:subname "//sub.example.com:8443/mydb" :ssl true})
                  (sql-jdbc.conn/connection-details->spec
                   :clickhouse {:host host :dbname "mydb" :port 8443 :ssl true})))))))))

(deftest ^:parallel clickhouse-connection-string-select-sequential-consistency
  (mt/with-dynamic-fn-redefs [;; This function's implementation requires the connection details to actually
                              ;; connect to the database, which is orthogonal to the purpose of this test.
                              clickhouse/cloud? (constantly true)]
    (testing "connection with no additional options"
      (is (= (assoc ctd/default-connection-params :select_sequential_consistency true)
             (sql-jdbc.conn/connection-details->spec
              :clickhouse
              {}))))))

(deftest clickhouse-connection-fails-test
  (mt/test-driver :clickhouse
    (mt/with-temp [:model/Database db {:details (assoc (:details (mt/db)) :password "wrongpassword") :engine :clickhouse}]
      (testing "sense check that checking the cloud mode fails with a SQLException."
       ;; nil arg isn't tested here, as it will pick up the defaults, which is the same as the Docker instance credentials.
        (is (thrown? java.sql.SQLException (#'clickhouse/cloud? (:details db)))))
      (testing "`driver/database-supports? :uploads` does not throw even if the connection fails."
        (is (false? (driver/database-supports? :clickhouse :uploads db)))
        (is (false? (driver/database-supports? :clickhouse :uploads nil))))
      (testing "`driver/database-supports? :connection-impersonation` does not throw even if the connection fails."
        (is (false? (driver/database-supports? :clickhouse :connection-impersonation db)))
        (is (false? (driver/database-supports? :clickhouse :connection-impersonation nil))))
      (testing (str "`sql-jdbc.conn/connection-details->spec` does not throw even if the connection fails, "
                    "and doesn't include the `select_sequential_consistency` parameter.")
        (is (nil? (:select_sequential_consistency (sql-jdbc.conn/connection-details->spec :clickhouse db))))
        (is (nil? (:select_sequential_consistency (sql-jdbc.conn/connection-details->spec :clickhouse nil))))))))

(deftest ^:parallel clickhouse-tls
  (mt/test-driver :clickhouse
    (let [working-dir (System/getProperty "user.dir")
          cert-path (str working-dir "/modules/drivers/clickhouse/.docker/clickhouse/single_node_tls/certificates/ca.crt")
          additional-options (str "sslrootcert=" cert-path)]
      (testing "simple connection with a single database"
        (is (= "UTC"
               (driver/db-default-timezone
                :clickhouse
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse
                 {:ssl true
                  :host "server.clickhouseconnect.test"
                  :port 8443
                  :additional-options additional-options})))))
      (testing "connection with multiple databases"
        (is (= "UTC"
               (driver/db-default-timezone
                :clickhouse
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse
                 {:ssl true
                  :host "server.clickhouseconnect.test"
                  :port 8443
                  :dbname "default system"
                  :additional-options additional-options}))))))))

(deftest ^:parallel clickhouse-nippy
  (mt/test-driver :clickhouse
    (testing "UnsignedByte"
      (let [value (com.clickhouse.data.value.UnsignedByte/valueOf "214")]
        (is (= value (nippy/thaw (nippy/freeze value))))))
    (testing "UnsignedShort"
      (let [value (com.clickhouse.data.value.UnsignedShort/valueOf "62055")]
        (is (= value (nippy/thaw (nippy/freeze value))))))
    (testing "UnsignedInteger"
      (let [value (com.clickhouse.data.value.UnsignedInteger/valueOf "4748364")]
        (is (= value (nippy/thaw (nippy/freeze value))))))
    (testing "UnsignedLong"
      (let [value (com.clickhouse.data.value.UnsignedLong/valueOf "84467440737095")]
        (is (= value (nippy/thaw (nippy/freeze value))))))))

(deftest ^:parallel clickhouse-query-formatting
  (mt/test-driver :clickhouse
    (let [query             (mt/mbql-query venues {:fields [$id] :order-by [[:asc $id]] :limit 5})
          {compiled :query} (qp.compile/compile-with-inline-parameters query)
          pretty            (driver/prettify-native-form :clickhouse compiled)]
      (testing "compiled"
        (is (= "SELECT `test_data`.`venues`.`id` AS `id` FROM `test_data`.`venues` ORDER BY `test_data`.`venues`.`id` ASC LIMIT 5" compiled)))
      (testing "pretty"
        (is (= "SELECT\n  `test_data`.`venues`.`id` AS `id`\nFROM\n  `test_data`.`venues`\nORDER BY\n  `test_data`.`venues`.`id` ASC\nLIMIT\n  5" pretty))))))

(deftest ^:parallel clickhouse-can-connect
  (mt/test-driver :clickhouse
    (doall
     (for [[username password] [["default" ""] ["user_with_password" "foo@bar!"]]
           database            ["default" "Special@Characters~"]]
       (testing (format "User `%s` can connect to `%s` with `%s`" username database password)
         (let [details (merge {:user username :password password}
                              (mt/dbdef->connection-details :clickhouse :db {:database-name database}))]
           (is (true? (driver/can-connect? :clickhouse details)))))))))

(deftest clickhouse-qp-extract-datetime-timezone
  (mt/test-driver :clickhouse
    (is (= "utc" (#'clickhouse-qp/extract-datetime-timezone "datetime('utc')")))
    (is (= "utc" (#'clickhouse-qp/extract-datetime-timezone "datetime64(3, 'utc')")))
    (is (= "europe/amsterdam" (#'clickhouse-qp/extract-datetime-timezone "datetime('europe/amsterdam')")))
    (is (= "europe/amsterdam" (#'clickhouse-qp/extract-datetime-timezone "datetime64(9, 'europe/amsterdam')")))
    (is (= nil (#'clickhouse-qp/extract-datetime-timezone "datetime")))
    (is (= nil (#'clickhouse-qp/extract-datetime-timezone "datetime64")))
    (is (= nil (#'clickhouse-qp/extract-datetime-timezone "datetime64(3)")))))

(deftest ^:synchronized clickhouse-insert
  (mt/test-driver :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db
       {:engine  :clickhouse
        :details (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})}]
      (let [table (keyword (format "insert_table_%s" (System/currentTimeMillis)))]
        (driver/create-table! :clickhouse (:id db) table {:id "Int64", :name "String"})
        (try
          (driver/insert-into! :clickhouse (:id db) table [:id :name] [[42 "Bob"] [43 "Alice"]])
          (is (= #{{:id 42, :name "Bob"}
                   {:id 43, :name "Alice"}}
                 (set (sql-jdbc/query :clickhouse db {:select [:*] :from [table]}))))
          (finally
            (driver/drop-table! :clickhouse (:id db) table)))))))

(deftest ^:parallel percentile-test
  (mt/test-driver
    :clickhouse
    (testing "Percentile with expression arg works correctly (#56485)"
      (let [mp (mt/metadata-provider)
            q (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/breakout (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :orders :created_at)) :month))
                  (lib/aggregate (lib/percentile (lib/case [[(lib/< (lib.metadata/field mp (mt/id :orders :created_at))
                                                                    "2018-04-01")
                                                             (lib.metadata/field mp (mt/id :orders :total))]])
                                                 0.7))
                  (lib/limit 3))]
        (is (= [["2016-04-01T00:00:00Z" 52.76]
                ["2016-05-01T00:00:00Z" 81.892]
                ["2016-06-01T00:00:00Z" 71.954]]
               (mt/rows (qp/process-query q))))))))

(deftest ^:parallel comment-question-mark-test
  ;; broken in 0.8.3, fixed in 0.8.4
  ;; https://github.com/metabase/metabase/issues/56690
  ;; https://github.com/ClickHouse/clickhouse-java/issues/2290
  (mt/test-driver :clickhouse
    (testing "a query with a question mark in the comment and has a variable should work correctly"
      (let [query "SELECT *
                   -- ?
                   FROM test_data.categories
                   WHERE test_data.categories.name = {{category_name}};"]
        (is (= [[1 "African"]]
               (mt/rows
                (qp/process-query
                 {:database (mt/id)
                  :type :native
                  :native {:query query
                           :template-tags {"category_name" {:type         :text
                                                            :name         "category_name"
                                                            :display-name "Category Name"}}}
                  :parameters [{:type   :category
                                :target [:variable [:template-tag "category_name"]]
                                :value  "African"}]}))))))))

(deftest ^:parallel select-question-mark-test
  ;; broken in 0.8.3, fixed in 0.8.4
  ;; https://github.com/metabase/metabase/issues/56690
  ;; https://github.com/ClickHouse/clickhouse-java/issues/2290
  (mt/test-driver :clickhouse
    (testing "a query that selects a question mark and has a variable should work correctly"
      (let [query "SELECT *, '?'
                   FROM test_data.categories
                   WHERE {{category_name}};"]
        (is (= [[1 "African" "?"]]
               (mt/rows
                (qp/process-query
                 {:database (mt/id)
                  :type :native
                  :native {:query query
                           :template-tags {"category_name" {:name         "category_name"
                                                            :display_name "Category Name"
                                                            :type         "dimension"
                                                            :widget-type  "string/contains"
                                                            :options {:case-sensitive false}
                                                            :dimension    [:field (mt/id :categories :name) nil]}}}
                  :parameters [{:options {:case-sensitive false}
                                :type   :string/contains
                                :target [:dimension [:template-tag "category_name"]]
                                :value  ["African"]}]}))))))))

#_(deftest ^:parallel ternary-with-variable-test
    ;; TODO(rileythomp): enable these tests once the jdbc driver has been fixed
    ;; broken in 0.8.4, waiting for fix
    ;; https://github.com/metabase/metabase/issues/56690
    ;; https://github.com/ClickHouse/clickhouse-java/issues/2348
    (mt/test-driver :clickhouse
      (testing "a query with a ternary and a variable should work correctly"
        (is (= [[1 "African" 1]]
               (mt/rows
                (qp/process-query
                 {:database (mt/id)
                  :type :native
                  :native {:query "SELECT *, true ? 1 : 0 AS foo
                                   FROM test_data.categories
                                   WHERE name = {{category_name}};"
                           :template-tags {"category_name" {:type         :text
                                                            :name         "category_name"
                                                            :display-name "Category Name"}}}
                  :parameters [{:type   :category
                                :target [:variable [:template-tag "category_name"]]
                                :value  "African"}]})))))))

#_(deftest ^:parallel line-comment-block-comment-test
    ;; TODO(rileythomp): enable these tests once the jdbc driver has been fix
    ;; broken in  0.8.4, waiting for fix
    ;; https://github.com/metabase/metabase/issues/57149
    ;; https://github.com/ClickHouse/clickhouse-java/issues/2338
    (mt/test-driver :clickhouse
      (testing "a query with a line comment followed by a block comment should work correctly"
        (is (= [[1]]
               (mt/rows
                (qp/process-query
                 (mt/native-query
                   {:query "-- foo
                            /* comment */
                            select 1;"}))))))))

(deftest ^:parallel subquery-with-cte-test
  ;; broken in 0.8.6, waiting for fix
  ;; https://github.com/metabase/metabase/issues/59166
  ;; https://github.com/ClickHouse/clickhouse-java/issues/2442
  (mt/test-driver :clickhouse
    (testing "a query with a CTE in a subquery should work correctly"
      (is (= [[9]]
             (mt/rows
              (qp/process-query
               (mt/native-query
                 {:query "select * from ( with x as ( select 9 ) select * from x ) as y;"}))))))))

(deftest ^:parallel casted-params-test
  ;; broken in 0.8.6, waiting for fix
  ;; https://github.com/metabase/metabase/issues/58992
  ;; https://github.com/metabase/metabase/issues/59002
  ;; https://github.com/ClickHouse/clickhouse-java/issues/2422
  (mt/test-driver :clickhouse
    (testing "a query with a with multiple params and one of the casted should work correctly"
      (is (= [[1 "African"] [2 "American"]]
             (mt/rows
              (qp/process-query
               {:database   (mt/id)
                :type       :native
                :native     {:query         "SELECT *
                                             FROM `test_data`.`categories`
                                             WHERE id = {{category_id_1}}::String or id = {{category_id_2}}"
                             :template-tags {"category_id_1" {:type         :number
                                                              :name         "category_id_1"
                                                              :display-name "Category Id 1"}
                                             "category_id_2" {:type         :text
                                                              :name         "category_id_2"
                                                              :display-name "Category Id 2"}}}
                :parameters [{:type   :number/=
                              :target [:variable [:template-tag "category_id_1"]]
                              :value  ["1"]}
                             {:type   :category
                              :target [:variable [:template-tag "category_id_2"]]
                              :value  "2"}]
                :middleware {:format-rows? false}})))))))

(deftest ^:parallel clickhouse-db-supports-schemas-test
  (doseq [[schemas-supported? details] [[false? {}]
                                        [false? {:enable-multiple-db nil}]
                                        [false? {:enable-multiple-db false}]
                                        [true? {:enable-multiple-db true}]]]
    (is (schemas-supported? (driver/database-supports? :clickhouse :schemas {:details details})))))

(deftest ^:parallel humanize-connection-error-message-test
  (is (= "random message" (driver/humanize-connection-error-message :clickhouse ["random message"])))
  (is (= :username-or-password-incorrect (driver/humanize-connection-error-message :clickhouse ["Failed to create connection"
                                                                                                "Failed to get server info"
                                                                                                "Code: 516. DB::Exception: asdf: Authentication failed: password is incorrect, or there is no user with such name. (AUTHENTICATION_FAILED) (version 25.7.4.11 (official build))"]))))
