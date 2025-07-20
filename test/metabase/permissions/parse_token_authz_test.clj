(ns metabase.permissions.parse-token-authz-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.permissions.parse-token-authz :as parse-token]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest test-parse-table-name
  (testing "Parsing table names with schema"
    (is (= {:schema "public" :table "customers"}
           (#'parse-token/parse-table-name "public.customers")))

    (is (= {:schema "analytics" :table "user_events"}
           (#'parse-token/parse-table-name "analytics.user_events"))))

  (testing "Parsing table names without schema"
    (is (= {:schema nil :table "customers"}
           (#'parse-token/parse-table-name "customers")))))

(deftest test-process-resource-entry
  (testing "Processing dashboard resource entries"
    (let [entry {"dashboard" 123
                 "drill" ["underlying-records" "quick-filter-drill"]
                 "params" {"customer" [10 20] "region" ["US"]}}
          result (#'parse-token/process-resource-entry entry)]

      (is (= {:dashboards {123 {:perms/dashboard-access :read
                                :drills #{:underlying-records :quick-filter-drill}
                                :params {:customer [10 20] :region ["US"]}}}}
             result))))

  (testing "Processing collection resource entries"
    (let [entry {"collection" 456}
          result (#'parse-token/process-resource-entry entry)]

      (is (= {:collections {456 {:perms/collection-access :read}}}
             result))))

  (testing "Processing dashboard with single drill permission"
    (let [entry {"dashboard" 789 "drill" "underlying-records"}
          result (#'parse-token/process-resource-entry entry)]

      (is (= {:dashboards {789 {:perms/dashboard-access :read
                                :drills #{:underlying-records}}}}
             result))))

  (testing "Processing entry with no recognized resources"
    (let [entry {"unknown" "value"}
          result (#'parse-token/process-resource-entry entry)]

      (is (= {} result)))))

(deftest test-process-data-access-entry
  (mt/with-temp [:model/Database db {:name "test-db"}
                 :model/Table table1 {:name "customers" :schema "public" :db_id (:id db)}
                 :model/Table table2 {:name "orders" :schema "public" :db_id (:id db)}
                 :model/Table table3 {:name "reviews" :schema "public" :db_id (:id db)}]

    (testing "Processing database-level permissions"
      (let [entry {"database" "test-db"
                   "create_queries" "query-builder"
                   "view_data" "unrestricted"
                   "download_results" "one-million-rows"}
            result (#'parse-token/process-data-access-entry entry)]

        (is (= {(:id db) {:database-name "test-db"
                          :perms/create-queries :query-builder
                          :perms/view-data :unrestricted
                          :perms/download-results :one-million-rows}}
               result))))

    (testing "Processing blocked tables"
      (let [entry {"database" "test-db"
                   "blocked_tables" ["public.reviews"]}
            result (#'parse-token/process-data-access-entry entry)]

        (is (= {(:id db) {:database-name "test-db"
                          :tables {(:id table3) {:perms/view-data :blocked
                                                 :table-name "reviews"
                                                 :schema "public"}}}}
               result))))

    (testing "Processing allowed tables with defaults"
      (let [entry {"database" "test-db"
                   "allowed_tables" ["public.customers" "public.orders"]}
            result (#'parse-token/process-data-access-entry entry)]

        (is (= {(:id db) {:database-name "test-db"
                          :tables {(:id table1) {:perms/view-data :unrestricted
                                                 :perms/create-queries :query-builder
                                                 :perms/download-results :one-million-rows
                                                 :table-name "customers"
                                                 :schema "public"}
                                   (:id table2) {:perms/view-data :unrestricted
                                                 :perms/create-queries :query-builder
                                                 :perms/download-results :one-million-rows
                                                 :table-name "orders"
                                                 :schema "public"}}}}
               result))))

    (testing "Processing allowed tables with custom permissions"
      (let [entry {"database" "test-db"
                   "create_queries" "query-builder-and-native"
                   "download_results" "ten-thousand-rows"
                   "allowed_tables" ["public.customers"]}
            result (#'parse-token/process-data-access-entry entry)]

        (is (= {(:id db) {:perms/create-queries :query-builder-and-native
                          :perms/download-results :ten-thousand-rows
                          :database-name "test-db"
                          :tables {(:id table1) {:perms/view-data :unrestricted
                                                 :perms/create-queries :query-builder-and-native
                                                 :perms/download-results :ten-thousand-rows
                                                 :table-name "customers"
                                                 :schema "public"}}}}
               result))))

    (testing "Processing mixed blocked and allowed tables"
      (let [entry {"database" "test-db"
                   "blocked_tables" ["public.reviews"]
                   "allowed_tables" ["public.customers"]}
            result (#'parse-token/process-data-access-entry entry)]

        (is (= {(:id db)
                {:database-name "test-db"
                 :tables {(:id table3) {:perms/view-data :blocked
                                        :table-name "reviews"
                                        :schema "public"}
                          (:id table1) {:perms/view-data :unrestricted
                                        :perms/create-queries :query-builder
                                        :perms/download-results :one-million-rows
                                        :table-name "customers"
                                        :schema "public"}}}}
               result))))))

(deftest test-permissions-doc-conversion
  (mt/with-temp [:model/Database db1 {:name "sales-db"}
                 :model/Database db2 {:name "analytics-db"}
                 :model/Table table1 {:name "customers" :schema "public" :db_id (:id db1)}
                 :model/Table table2 {:name "orders" :schema "public" :db_id (:id db1)}
                 :model/Table table3 {:name "events" :schema "analytics" :db_id (:id db2)}]

    (testing "Converting complete token authorization document"
      (let [token-authz {"resources" [{"dashboard" 100
                                       "drill" ["underlying-records"]
                                       "params" {"customer_id" [1 2 3]}}
                                      {"collection" 200}
                                      {"dashboard" 101}]
                         "data_access" [{"database" "sales-db"
                                         "create_queries" "query-builder"
                                         "view_data" "unrestricted"
                                         "blocked_tables" ["public.orders"]}
                                        {"database" "analytics-db"
                                         "allowed_tables" ["analytics.events"]}]}
            result (parse-token/->permissions-doc token-authz)]

        (is (= {:dashboards {100 {:perms/dashboard-access :read
                                  :drills #{:underlying-records}
                                  :params {:customer_id [1 2 3]}}
                             101 {:perms/dashboard-access :read}}
                :collections {200 {:perms/collection-access :read}}
                :databases {(:id db1) {:perms/create-queries :query-builder
                                       :perms/view-data :unrestricted
                                       :tables {(:id table2) {:perms/view-data :blocked
                                                              :table-name "orders"
                                                              :schema "public"}}
                                       :database-name "sales-db"}
                            (:id db2) {:tables {(:id table3) {:perms/view-data :unrestricted
                                                              :perms/create-queries :query-builder
                                                              :perms/download-results :one-million-rows
                                                              :table-name "events"
                                                              :schema "analytics"}}
                                       :database-name "analytics-db"}}}
               result))))

    (testing "Converting empty token authorization document"
      (let [result (parse-token/->permissions-doc {})]
        (is (= {:databases {}} result))))

    (testing "Converting token with only resources"
      (let [token-authz {"resources" [{"dashboard" 300}]}
            result (parse-token/->permissions-doc token-authz)]

        (is (= {:dashboards {300 {:perms/dashboard-access :read}}
                :databases {}}
               result))))

    (testing "Converting token with only data access"
      (let [token-authz {"data_access" [{"database" "sales-db"
                                         "view_data" "unrestricted"}]}
            result (parse-token/->permissions-doc token-authz)]

        (is (= {:databases {(:id db1) {:perms/view-data :unrestricted
                                       :database-name "sales-db"}}}
               result))))

    ;; These cases should throw eventually
    #_(testing "Converting token with nonexistent database"
        (let [token-authz {"data_access" [{"database" "nonexistent-db"
                                           "view_data" "unrestricted"}]}
              result (parse-token/->permissions-doc token-authz)]

        ;; Should still create entry with hash of database name
          (is (contains? (:databases result) (hash "nonexistent-db")))
          (is (= "nonexistent-db"
                 (get-in result [:databases (hash "nonexistent-db") :database-name])))))

    #_(testing "Converting token with nonexistent table"
        (let [token-authz {"data_access" [{"database" "sales-db"
                                           "blocked_tables" ["public.nonexistent"]}]}
              result (parse-token/->permissions-doc token-authz)]

        ;; Should handle nil table ID gracefully
          (is (contains? (get-in result [:databases (:id db1) :tables]) nil))))))

(deftest test-edge-cases
  (testing "Handling malformed table names"
    (is (= {:schema nil :table "table.with.dots"}
           (#'parse-token/parse-table-name "table.with.dots"))))

  (testing "Processing resource entry with nil values"
    (let [entry {"dashboard" nil "collection" 123}
          result (#'parse-token/process-resource-entry entry)]

      (is (= {:collections {123 {:perms/collection-access :read}}}
             result))))

  (testing "Processing data access entry with empty arrays"
    (mt/with-temp [:model/Database db {:name "test-db"}]
      (let [entry {"database" "test-db"
                   "blocked_tables" []
                   "allowed_tables" []}
            result (#'parse-token/process-data-access-entry entry)]

        (is (= {(:id db) {:database-name "test-db"}} result))))))

(deftest test-parse-from-base64
  (mt/with-temp [:model/Database db1 {:name "sales-db"}
                 :model/Database db2 {:name "analytics-db"}
                 :model/Table table1 {:name "customers" :schema "public" :db_id (:id db1)}
                 :model/Table table2 {:name "orders" :schema "public" :db_id (:id db1)}
                 :model/Table table3 {:name "events" :schema "analytics" :db_id (:id db2)}]

    (testing "Successfully parsing valid base64 encoded JSON"
      (let [token-authz {"resources" [{"dashboard" 100
                                       "drill" ["underlying-records"]
                                       "params" {"customer_id" [1 2 3]}}
                                      {"collection" 200}]
                         "data_access" [{"database" "sales-db"
                                         "create_queries" "query-builder"
                                         "view_data" "unrestricted"
                                         "blocked_tables" ["public.orders"]}]}
            json-string (json/generate-string token-authz)
            encoder (java.util.Base64/getUrlEncoder)
            encoded-json (.encodeToString encoder (.getBytes json-string "UTF-8"))
            result (parse-token/parse-from-base64 encoded-json)]

        (is (= {:dashboards {100 {:perms/dashboard-access :read
                                  :drills #{:underlying-records}
                                  :params {:customer_id [1 2 3]}}}
                :collections {200 {:perms/collection-access :read}}
                :databases {(:id db1) {:perms/create-queries :query-builder
                                       :perms/view-data :unrestricted
                                       :tables {(:id table2) {:perms/view-data :blocked
                                                              :table-name "orders"
                                                              :schema "public"}}
                                       :database-name "sales-db"}}}
               result))))

    (testing "Parsing empty JSON object"
      (let [token-authz {}
            json-string (json/generate-string token-authz)
            encoder (java.util.Base64/getUrlEncoder)
            encoded-json (.encodeToString encoder (.getBytes json-string "UTF-8"))
            result (parse-token/parse-from-base64 encoded-json)]

        (is (= {:databases {}} result))))

    (testing "Parsing JSON with only resources"
      (let [token-authz {"resources" [{"dashboard" 300
                                       "drill" "underlying-records"}]}
            json-string (json/generate-string token-authz)
            encoder (java.util.Base64/getUrlEncoder)
            encoded-json (.encodeToString encoder (.getBytes json-string "UTF-8"))
            result (parse-token/parse-from-base64 encoded-json)]

        (is (= {:dashboards {300 {:perms/dashboard-access :read
                                  :drills #{:underlying-records}}}
                :databases {}}
               result))))

    (testing "Parsing JSON with only data access"
      (let [token-authz {"data_access" [{"database" "analytics-db"
                                         "allowed_tables" ["analytics.events"]}]}
            json-string (json/generate-string token-authz)
            encoder (java.util.Base64/getUrlEncoder)
            encoded-json (.encodeToString encoder (.getBytes json-string "UTF-8"))
            result (parse-token/parse-from-base64 encoded-json)]

        (is (= {:databases {(:id db2) {:tables {(:id table3) {:perms/view-data :unrestricted
                                                              :perms/create-queries :query-builder
                                                              :perms/download-results :one-million-rows
                                                              :table-name "events"
                                                              :schema "analytics"}}
                                       :database-name "analytics-db"}}}
               result))))

    (testing "Error handling for invalid base64"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Failed to parse base64 encoded JSON token"
           (parse-token/parse-from-base64 "invalid-base64!"))))

    (testing "Error handling for invalid JSON"
      (let [invalid-json "{ invalid json }"
            encoder (java.util.Base64/getUrlEncoder)
            encoded-invalid (.encodeToString encoder (.getBytes invalid-json "UTF-8"))]

        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Failed to parse base64 encoded JSON token"
             (parse-token/parse-from-base64 encoded-invalid)))))

    (testing "Complex nested JSON structure"
      (let [token-authz {"resources" [{"dashboard" 400
                                       "drill" ["underlying-records" "quick-filter-drill"]
                                       "params" {"region" ["US" "EU"] "year" [2023 2024]}}
                                      {"collection" 500}
                                      {"dashboard" 401}]
                         "data_access" [{"database" "sales-db"
                                         "create_queries" "query-builder-and-native"
                                         "view_data" "unrestricted"
                                         "download_results" "ten-thousand-rows"
                                         "blocked_tables" ["public.orders"]
                                         "allowed_tables" ["public.customers"]}
                                        {"database" "analytics-db"
                                         "view_data" "unrestricted"
                                         "allowed_tables" ["analytics.events"]}]}
            json-string (json/generate-string token-authz)
            encoder (java.util.Base64/getUrlEncoder)
            encoded-json (.encodeToString encoder (.getBytes json-string "UTF-8"))
            result (parse-token/parse-from-base64 encoded-json)]

        (is (= {:dashboards {400 {:perms/dashboard-access :read
                                  :drills #{:underlying-records :quick-filter-drill}
                                  :params {:region ["US" "EU"] :year [2023 2024]}}
                             401 {:perms/dashboard-access :read}}
                :collections {500 {:perms/collection-access :read}}
                :databases {(:id db1) {:perms/create-queries :query-builder-and-native
                                       :perms/view-data :unrestricted
                                       :perms/download-results :ten-thousand-rows
                                       :tables {(:id table2) {:perms/view-data :blocked
                                                              :table-name "orders"
                                                              :schema "public"}
                                                (:id table1) {:perms/view-data :unrestricted
                                                              :perms/create-queries :query-builder-and-native
                                                              :perms/download-results :ten-thousand-rows
                                                              :table-name "customers"
                                                              :schema "public"}}
                                       :database-name "sales-db"}
                            (:id db2) {:perms/view-data :unrestricted
                                       :tables {(:id table3) {:perms/view-data :unrestricted
                                                              :perms/create-queries :query-builder
                                                              :perms/download-results :one-million-rows
                                                              :table-name "events"
                                                              :schema "analytics"}}
                                       :database-name "analytics-db"}}}
               result))))

    (testing "URLSafe base64 encoding with special characters"
      (let [token-authz {"resources" [{"dashboard" 600}]
                         "data_access" [{"database" "test-db_with-special/chars"}]}
            json-string (json/generate-string token-authz)
            encoder (java.util.Base64/getUrlEncoder)
            encoded-json (.encodeToString encoder (.getBytes json-string "UTF-8"))
            result (parse-token/parse-from-base64 encoded-json)]

        ;; Should handle the special characters in database name
        (is (contains? (:databases result) (t2/select-one-pk [:model/Database] :name "test-db_with-special/chars")))))))

(deftest test-parse-from-base64-error-details
  (testing "Error details are preserved in exception"
    (let [invalid-input "not-base64!"]
      (try
        (parse-token/parse-from-base64 invalid-input)
        (is false "Should have thrown an exception")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (= invalid-input (:encoded-json data)))
            (is (string? (:error data)))
            (is (.contains (.getMessage e) "Failed to parse base64 encoded JSON token"))))))))
