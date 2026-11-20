(ns ^:mb/driver-tests metabase.driver.bigquery-cloud-sdk.impersonation-test
  "Unit, wire, and security tests for BigQuery `SECURE_CONTEXT` connection impersonation."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.query-processor.core :as qp]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (clojure.lang ExceptionInfo)
   (com.google.api.client.testing.http MockHttpTransport MockLowLevelHttpRequest MockLowLevelHttpResponse)
   (com.google.auth.http HttpTransportFactory)
   (com.google.auth.oauth2 AccessToken GoogleCredentials)
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$JobOption
    BigQuery$TableOption
    BigQueryOptions
    JobInfo
    QueryJobConfiguration
    TableId)
   (com.google.cloud.http HttpTransportOptions)
   (java.util Arrays)))

(set! *warn-on-reflection* true)

(defn- ee-var
  [sym]
  (requiring-resolve sym))

(defn- do-with-user-attributes!
  [user-kw attrs thunk]
  ((ee-var 'metabase-enterprise.sandbox.test-util/do-with-user-attributes!) user-kw attrs thunk))

(defn- mock-bq-transport
  "Returns `[captured-atom ^HttpTransportOptions transport-opts]` capturing BigQuery REST requests."
  [project-id]
  (let [captured  (atom [])
        query-row {"totalRows"    "1"
                   "schema"       {"fields" [{"name" "viewer" "type" "STRING"}]}
                   "rows"         [{"f" [{"v" "ok"}]}]
                   "jobReference" {"projectId" project-id "jobId" "job-1" "location" "us-central1"}}
        transport (proxy [MockHttpTransport] []
                    (buildRequest [^String method ^String url]
                      (proxy [MockLowLevelHttpRequest] [url]
                        (execute []
                          (let [raw-body (.getContentAsString ^MockLowLevelHttpRequest this)]
                            (swap! captured conj {:method method
                                                  :url    url
                                                  :auth   (.getFirstHeaderValue ^MockLowLevelHttpRequest this
                                                                                "authorization")
                                                  :body   (when-not (str/blank? raw-body)
                                                            (json/decode raw-body))}))
                          (let [resp (cond
                                       (str/includes? url "/queries")
                                       (assoc query-row "kind" "bigquery#queryResponse" "jobComplete" true)

                                       (and (= "POST" method) (str/includes? url "/jobs"))
                                       {"kind"          "bigquery#job"
                                        "configuration" {"query" {"query"            "SELECT 1"
                                                                  "destinationTable" {"projectId" project-id
                                                                                      "datasetId" "_tmp"
                                                                                      "tableId"   "anon1"}}}
                                        "jobReference"  {"projectId" project-id
                                                         "jobId"     "job-1"
                                                         "location"  "us-central1"}
                                        "status"        {"state" "DONE"}}

                                       (re-find #"/data(?:\?|$)" url)
                                       {"kind" "bigquery#tableDataList" "totalRows" "1" "rows" [{"f" [{"v" "ok"}]}]}

                                       (re-find #"/tables/[^/?]+(?:\?|$)" url)
                                       {"kind"           "bigquery#table"
                                        "type"           "TABLE"
                                        "tableReference" {"projectId" project-id "datasetId" "ds" "tableId" "tbl"}}

                                       :else
                                       (assoc query-row "kind" "bigquery#getQueryResultsResponse" "jobComplete" true))]
                            (doto (MockLowLevelHttpResponse.)
                              (.setStatusCode 200)
                              (.setContentType "application/json; charset=UTF-8")
                              (.setContent ^String (json/encode resp))))))))]
    [captured
     (-> (HttpTransportOptions/newBuilder)
         (.setHttpTransportFactory (reify HttpTransportFactory
                                     (create [_] transport)))
         (.build))]))

(defn- mock-bq-client-builder
  [project-id ^HttpTransportOptions transport-opts]
  (doto (BigQueryOptions/newBuilder)
    (.setProjectId project-id)
    (.setCredentials (GoogleCredentials/create (AccessToken. "test-oauth-token" nil)))
    (.setTransportOptions transport-opts)))

(defn- role-wire-entries!
  [db]
  (let [[captured transport-opts] (mock-bq-transport "org:analytics-prod")
        bldr                      (mock-bq-client-builder "org:analytics-prod" transport-opts)
        _                         (driver.conn/set-role-if-supported! :bigquery-cloud-sdk
                                                                      bldr
                                                                      (driver.u/ensure-lib-database db))
        ^BigQuery client          (.getService (.build bldr))]
    (.query client
            (-> (QueryJobConfiguration/newBuilder "SELECT 1") (.setUseLegacySql false) (.build))
            (u/varargs BigQuery$JobOption))
    (get-in (last @captured) [:body "secureContext" "secureParameterEntries"])))

(defn- do-with-mock-bq-client!
  [project-id f]
  (let [[captured ^HttpTransportOptions transport-opts] (mock-bq-transport project-id)
        impersonated?  (atom nil)
        currently-imp? (when config/ee-available?
                         (ee-var 'metabase-enterprise.impersonation.middleware/currently-impersonated?))
        orig-client-fn (mt/original-fn #'bigquery/database-details->client)]
    (mt/with-dynamic-fn-redefs [bigquery.common/database-details->credentials
                                (constantly (GoogleCredentials/create (AccessToken. "test-oauth-token" nil)))
                                bigquery/database-details->client
                                (fn [details]
                                  (when currently-imp?
                                    (reset! impersonated? (currently-imp?)))
                                  (let [^BigQuery real-client (orig-client-fn details)
                                        ^BigQueryOptions opts (.getOptions real-client)]
                                    (.getService (-> (.toBuilder opts)
                                                     (.setTransportOptions transport-opts)
                                                     (.build)))))]
      (f captured impersonated?))))

(defn- do-with-bq-secure-context-db!
  [extra-details f]
  (mt/initialize-if-needed! :db :plugins)
  (driver/the-initialized-driver :bigquery-cloud-sdk)
  (ee-var 'metabase-enterprise.impersonation.models/insert-impersonations!)
  (mt/with-temp [:model/Database db {:engine  :bigquery-cloud-sdk
                                     :details (merge {:project-id                "org:analytics-prod"
                                                      :billing-project-id        "org:analytics-prod"
                                                      :enable-secure-context     true
                                                      :secure-context-attributes "region, tenant_id"}
                                                     extra-details)}]
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup           group {:name (mt/random-name)}
                     :model/PermissionsGroupMembership _     {:user_id (mt/user->id :rasta) :group_id (:id group)}
                     :model/PermissionsGroupMembership _     {:user_id (mt/user->id :lucky) :group_id (:id group)}]
        (data-perms/set-database-permission! group (:id db) :perms/view-data :unrestricted)
        (data-perms/set-database-permission! group (:id db) :perms/create-queries :query-builder-and-native)
        (mt/with-temp [:model/ConnectionImpersonation _ {:db_id     (:id db)
                                                         :group_id  (:id group)
                                                         :attribute "bq_role"}]
          (f db group))))))

;;; ----------------------------------------------- Pure Unit & Wire Tests -------------------------------------------

(deftest ^:parallel secure-context-support-and-validation-test
  (testing ":connection-impersonation is governed strictly by policy-database (router when routed)"
    (is (false? (driver/database-supports? :bigquery-cloud-sdk :connection-impersonation {:details {}})))
    (is (false? (driver/database-supports? :bigquery-cloud-sdk
                                           :connection-impersonation
                                           {:details {:enable-secure-context false}})))
    (is (true? (driver/database-supports? :bigquery-cloud-sdk
                                          :connection-impersonation
                                          {:details {:enable-secure-context true}})))
    (mt/with-dynamic-fn-redefs [driver.u/lib-database (fn [id]
                                                        (case id
                                                          99 {:id 99 :details {:enable-secure-context true}}
                                                          98 {:id 98 :details {:enable-secure-context false}}
                                                          nil))]
      (is (true? (driver/database-supports?
                  :bigquery-cloud-sdk
                  :connection-impersonation
                  {:id 100 :router-database-id 99 :details {:enable-secure-context false}})))
      (is (false? (driver/database-supports?
                   :bigquery-cloud-sdk
                   :connection-impersonation
                   {:id 101 :router-database-id 98 :details {:enable-secure-context true}})))))

  (testing "validate-db-details! enforces BigQuery SECURE_CONTEXT identifier, count, byte-length, and reserved rules"
    (is (nil? (driver/validate-db-details! :bigquery-cloud-sdk
                                           {:enable-secure-context     true
                                            :secure-context-attributes "region, _tenant_1, team"})))
    (doseq [reserved ["email" "impersonation_role" "metabase_user_id" "metabase_unrestricted"]]
      (is (thrown-with-msg? ExceptionInfo #"reserved and managed automatically"
                            (driver/validate-db-details! :bigquery-cloud-sdk
                                                         {:enable-secure-context     true
                                                          :secure-context-attributes (str "region, " reserved)}))))
    (doseq [bad-key ["tenant.id" "1region" "tenant-id" "région"]]
      (is (thrown-with-msg? ExceptionInfo #"must start with a letter or _"
                            (driver/validate-db-details! :bigquery-cloud-sdk
                                                         {:enable-secure-context     true
                                                          :secure-context-attributes bad-key}))))
    (is (thrown-with-msg? ExceptionInfo #"at most 27 additional user attributes"
                          (driver/validate-db-details!
                           :bigquery-cloud-sdk
                           {:enable-secure-context     true
                            :secure-context-attributes (str/join "," (map #(str "attr_" %) (range 28)))})))
    (is (thrown-with-msg? ExceptionInfo #"exceeds 128 UTF-8 bytes"
                          (driver/validate-db-details! :bigquery-cloud-sdk
                                                       {:enable-secure-context     true
                                                        :secure-context-attributes (apply str (repeat 129 "a"))}))))

  (testing "checkout-database resolves only stamped ::driver.conn/database-id"
    (is (nil? (#'bigquery/checkout-database {:project-id "my-project"})))))

(deftest secure-context-plugin-properties-test
  (mt/initialize-if-needed! :plugins)
  (let [fields  (:details-fields (:bigquery-cloud-sdk (driver.u/available-drivers-info)))
        by-name (fn [nm] (m/find-first #(= nm (:name %)) fields))]
    (is (= {:type "boolean" :default false}
           (select-keys (by-name "enable-secure-context") [:type :default])))
    (is (= {"advanced-options" true "destination-database" false "enable-secure-context" true}
           (:visible-if (by-name "secure-context-attributes"))))))

(deftest secure-context-wire-and-multimethods-test
  (driver/the-initialized-driver :bigquery-cloud-sdk)
  (let [entries     {"email"                 "analyst@example.com"
                     "impersonation_role"    "tam"
                     "metabase_user_id"      "42"
                     "metabase_unrestricted" "false"
                     "region"                "eu-west"}
        enabled-db  {:lib/type :metadata/database
                     :id       1
                     :engine   :bigquery-cloud-sdk
                     :details  {:enable-secure-context     true
                                :secure-context-attributes "region, tags, email, metabase_unrestricted"}}
        disabled-db (assoc-in enabled-db [:details :enable-secure-context] false)]
    (testing "jobs.insert and jobs.query serialize secureContext.secureParameterEntries and preserve OAuth header"
      (let [[captured transport-opts] (mock-bq-transport "my-project")
            bldr                      (mock-bq-client-builder "my-project" transport-opts)
            _                         (driver/set-role! :bigquery-cloud-sdk bldr (json/encode entries))
            ^BigQuery client          (.getService (.build bldr))]
        (.create client
                 (JobInfo/of (#'bigquery/build-bigquery-request "SELECT SECURE_CONTEXT('email')" nil))
                 (u/varargs BigQuery$JobOption))
        (let [{:keys [url auth body]} (last @captured)]
          (is (str/includes? url "/projects/my-project/jobs"))
          (is (= "Bearer test-oauth-token" auth))
          (is (= entries (get-in body ["configuration" "query" "secureContext" "secureParameterEntries"]))))
        (.query client
                (-> (QueryJobConfiguration/newBuilder "SELECT SECURE_CONTEXT('email')")
                    (.setUseLegacySql false)
                    (.build))
                (u/varargs BigQuery$JobOption))
        (let [{:keys [url auth body]} (last @captured)]
          (is (str/includes? url "/projects/my-project/queries"))
          (is (= "Bearer test-oauth-token" auth))
          (is (= entries (get-in body ["secureContext" "secureParameterEntries"]))))))

    (testing "default-database-role and format-impersonation-role contracts"
      (is (= {"email"                 ""
              "impersonation_role"    ""
              "metabase_unrestricted" "true"
              "metabase_user_id"      ""
              "region"                ""
              "tags"                  ""}
             (json/decode (driver.sql/default-database-role :bigquery-cloud-sdk enabled-db))))
      (is (thrown-with-msg?
           ExceptionInfo #"BigQuery SECURE_CONTEXT is disabled"
           (driver.sql/format-impersonation-role :bigquery-cloud-sdk disabled-db "tam" {:user-id 7 :user-email "a@b"})))
      (is (= {"email"                 "analyst@example.com"
              "impersonation_role"    "tam"
              "metabase_unrestricted" "false"
              "metabase_user_id"      "42"
              "region"                "eu-west"
              "tags"                  "[\"eu\",\"prod\"]"}
             (json/decode
              (driver.sql/format-impersonation-role
               :bigquery-cloud-sdk
               enabled-db
               "tam"
               {:user-id         42
                :user-email      "  analyst@example.com  "
                :user-attributes {"region"                "eu-west"
                                  "tags"                  ["eu" "prod"]
                                  "email"                 "spoofed@example.com"
                                  "metabase_unrestricted" "true"}}))))
      (is (thrown-with-msg?
           ExceptionInfo #"verified email address"
           (driver.sql/format-impersonation-role :bigquery-cloud-sdk enabled-db "tam" {:user-id 42 :user-email "  "})))
      (is (thrown-with-msg?
           ExceptionInfo #"exceeds 512 UTF-8 bytes"
           (driver.sql/format-impersonation-role
            :bigquery-cloud-sdk
            enabled-db
            "tam"
            {:user-id 42 :user-email "a@b.co" :user-attributes {"region" (apply str (repeat 513 "x"))}}))))

    (testing "set-role! rejects invalid payloads and OSS set-role-if-supported! is a no-op"
      (let [bldr (BigQueryOptions/newBuilder)]
        (is (thrown? Exception (driver/set-role! :bigquery-cloud-sdk bldr "{not-json")))
        (is (thrown-with-msg? ExceptionInfo #"Invalid BigQuery SECURE_CONTEXT"
                              (driver/set-role! :bigquery-cloud-sdk bldr "{}")))
        (is (thrown-with-msg? ExceptionInfo #"Invalid BigQuery SECURE_CONTEXT"
                              (driver/set-role! :bigquery-cloud-sdk bldr "[\"not-a-map\"]")))
        (when-not config/ee-available?
          (is (nil? (driver.conn/set-role-if-supported! :bigquery-cloud-sdk bldr enabled-db))))))))

;;; ------------------------------------------ EE End-to-End Security Tests ------------------------------------------

(deftest secure-context-entries-and-anti-spoofing-test
  (when config/ee-available?
    (mt/with-premium-features #{:advanced-permissions}
      (do-with-bq-secure-context-db!
       ;; Simulate pre-existing reserved keys stored in DB details to verify runtime defense-in-depth
       {:secure-context-attributes
        "region, tenant_id, email, impersonation_role, metabase_user_id, metabase_unrestricted"}
       (fn [db _group]
         (let [unrestricted-entries {"email"                 ""
                                     "impersonation_role"    ""
                                     "metabase_unrestricted" "true"
                                     "metabase_user_id"      ""
                                     "region"                ""
                                     "tenant_id"             ""}]
           (testing "impersonated user receives authoritative system keys; reserved keys cannot be spoofed"
             (do-with-user-attributes! :rasta {"bq_role"               "tam"
                                               "region"                "eu-west"
                                               "email"                 "ceo@example.com"
                                               "impersonation_role"    "superadmin"
                                               "metabase_user_id"      "1"
                                               "metabase_unrestricted" "true"}
               (fn []
                 (test.users/with-test-user :rasta
                   (is (= {"email"                 (:email (test.users/fetch-user :rasta))
                           "impersonation_role"    "tam"
                           "metabase_user_id"      (str (mt/user->id :rasta))
                           "metabase_unrestricted" "false"
                           "region"                "eu-west"
                           "tenant_id"             ""}
                          (role-wire-entries! db)))))))

           (testing "impersonation attribute matching default-database-role is refused"
             (let [default-role (driver.sql/default-database-role :bigquery-cloud-sdk (driver.u/lib-database (:id db)))]
               (do-with-user-attributes! :rasta {"bq_role" default-role}
                 (fn []
                   (test.users/with-test-user :rasta
                     (is (thrown-with-msg? ExceptionInfo #"must not be the database default role"
                                           (role-wire-entries! db))))))))

           (testing "superuser, background sync, and unrestricted-group members receive unrestricted role"
             (request/as-admin
               (is (= unrestricted-entries (role-wire-entries! db))))
             (binding [api/*current-user-id* nil
                       api/*current-user*    (delay nil)
                       api/*is-superuser?*   false]
               (is (= unrestricted-entries (role-wire-entries! db))))
             (mt/with-temp [:model/PermissionsGroup           unrestricted-group {:name (mt/random-name)}
                            :model/PermissionsGroupMembership _                  {:user_id  (mt/user->id :rasta)
                                                                                  :group_id (:id unrestricted-group)}]
               (data-perms/set-database-permission! unrestricted-group (:id db) :perms/view-data :unrestricted)
               (do-with-user-attributes! :rasta {"bq_role" "tam" "region" "eu-west"}
                 (fn []
                   (test.users/with-test-user :rasta
                     (is (= unrestricted-entries (role-wire-entries! db))))))))))))))

(deftest secure-context-license-and-toggle-fail-closed-test
  (when config/ee-available?
    (let [apply-impersonation        (ee-var 'metabase-enterprise.impersonation.middleware/apply-impersonation)
          hash-input-for-impersonate (ee-var 'metabase-enterprise.impersonation.driver/hash-input-for-impersonation)]
      (do-with-bq-secure-context-db!
       {}
       (fn [db _group]
         (do-with-user-attributes! :rasta {"bq_role" "tam" "region" "eu-west"}
           (fn []
             (mt/with-premium-features #{}
               (test.users/with-test-user :rasta
                 (is (thrown-with-msg? ExceptionInfo #"Advanced Permissions is a paid feature"
                                       (role-wire-entries! db))))
               (request/as-admin
                 (is (nil? (role-wire-entries! db)))))

             (mt/with-premium-features #{:advanced-permissions}
               (testing "toggling :enable-secure-context false while policies exist fails closed on QP and FieldValues"
                 (mt/with-temp [:model/Table table {:db_id (:id db) :name "orders"}
                                :model/Field field {:table_id (:id table) :name "region" :base_type :type/Text}]
                   (mt/with-temp-vals-in-db :model/Database db {:details (assoc (:details db)
                                                                                :enable-secure-context false)}
                     (test.users/with-test-user :rasta
                       (let [mp (mt/application-database-metadata-provider (:id db))]
                         (mt/with-metadata-provider mp
                           (driver/with-driver :bigquery-cloud-sdk
                             (is (thrown-with-msg?
                                  ExceptionInfo #"BigQuery SECURE_CONTEXT is disabled"
                                  (apply-impersonation (lib/native-query mp "SELECT 1")))))))
                       (is (thrown-with-msg? ExceptionInfo #"BigQuery SECURE_CONTEXT is disabled"
                                             (hash-input-for-impersonate field)))))))))))))))

(deftest secure-context-per-user-cache-hash-isolation-test
  (when config/ee-available?
    (let [apply-impersonation        (ee-var 'metabase-enterprise.impersonation.middleware/apply-impersonation)
          hash-input-for-impersonate (ee-var 'metabase-enterprise.impersonation.driver/hash-input-for-impersonation)
          impersonation-token-for-db (ee-var 'metabase-enterprise.impersonation.driver/impersonation-token-for-db)]
      (mt/with-premium-features #{:advanced-permissions}
        (do-with-bq-secure-context-db!
         {}
         (fn [db _group]
           (mt/with-temp [:model/Table table {:db_id (:id db) :name "orders"}
                          :model/Field field {:table_id (:id table) :name "region" :base_type :type/Text}]
             (do-with-user-attributes! :rasta {"bq_role" "tam" "region" "eu-west"}
               (fn []
                 (do-with-user-attributes! :lucky {"bq_role" "tam" "region" "eu-west"}
                   (fn []
                     (let [mp         (mt/application-database-metadata-provider (:id db))
                           base-query (lib/native-query mp "SELECT SECURE_CONTEXT('email') AS viewer")]
                       (mt/with-metadata-provider mp
                         (driver/with-driver :bigquery-cloud-sdk
                           (let [rasta-q   (test.users/with-test-user :rasta (apply-impersonation base-query))
                                 lucky-q   (test.users/with-test-user :lucky (apply-impersonation base-query))
                                 rasta-fv  (test.users/with-test-user :rasta (hash-input-for-impersonate field))
                                 lucky-fv  (test.users/with-test-user :lucky (hash-input-for-impersonate field))
                                 rasta-tok (test.users/with-test-user :rasta (impersonation-token-for-db (:id db)))
                                 lucky-tok (test.users/with-test-user :lucky (impersonation-token-for-db (:id db)))]
                             (is (not= (:impersonation/role rasta-q) (:impersonation/role lucky-q)))
                             (is (= (:email (test.users/fetch-user :rasta))
                                    (get (json/decode (:impersonation/role rasta-q)) "email")))
                             (is (= (:email (test.users/fetch-user :lucky))
                                    (get (json/decode (:impersonation/role lucky-q)) "email")))
                             (is (not (Arrays/equals ^bytes (lib-be/query-hash rasta-q)
                                                     ^bytes (lib-be/query-hash lucky-q))))
                             (is (not= rasta-fv lucky-fv))
                             (is (not= rasta-tok lucky-tok)))))))))))))))))

(deftest secure-context-native-sql-qp-and-flat-conn-spec-test
  (when config/ee-available?
    (let [apply-impersonation (ee-var 'metabase-enterprise.impersonation.middleware/apply-impersonation)]
      (mt/with-premium-features #{:advanced-permissions}
        (do-with-bq-secure-context-db!
         {}
         (fn [db _group]
           (do-with-user-attributes! :rasta {"bq_role" "tam" "region" "eu-west"}
             (fn []
               (let [mp         (mt/application-database-metadata-provider (:id db))
                     rasta-ctx  {"email"                 (:email (test.users/fetch-user :rasta))
                                 "impersonation_role"    "tam"
                                 "metabase_user_id"      (str (mt/user->id :rasta))
                                 "metabase_unrestricted" "false"
                                 "region"                "eu-west"
                                 "tenant_id"             ""}]
                 (testing "multi-statement native SQL is rejected by BigQuery SQLGlot validation under impersonation"
                   (test.users/with-test-user :rasta
                     (mt/with-metadata-provider mp
                       (driver/with-driver :bigquery-cloud-sdk
                         (is (thrown?
                              ExceptionInfo
                              (apply-impersonation
                               (lib/native-query mp "SELECT SECURE_CONTEXT('email'); DROP TABLE secret_table"))))))))

                 (testing "QP and flat connection-spec execute-raw-queries! wire SECURE_CONTEXT onto HTTP requests"
                   (do-with-mock-bq-client!
                    "org:analytics-prod"
                    (fn [captured impersonated?]
                      (test.users/with-test-user :rasta
                        (reset! captured [])
                        (let [res      (qp/process-query (lib/native-query mp "SELECT SECURE_CONTEXT('email')"))
                              post-job (m/find-first #(= "POST" (:method %)) @captured)]
                          (is (= [["ok"]] (get-in res [:data :rows])))
                          (is (true? @impersonated?))
                          (is (= rasta-ctx
                                 (get-in post-job
                                         [:body "configuration" "query" "secureContext" "secureParameterEntries"]))))

                        ;; Flat `conn-spec` path used by Transforms, `create-table!`, and `create-schema-if-needed!`
                        (reset! captured [])
                        (let [flat-spec (driver/connection-spec :bigquery-cloud-sdk (driver.u/lib-database (:id db)))]
                          (is (nil? (:details flat-spec)))
                          (driver/execute-raw-queries! :bigquery-cloud-sdk flat-spec ["SELECT SECURE_CONTEXT('email')"])
                          (is (= rasta-ctx
                                 (get-in (last @captured) [:body "secureContext" "secureParameterEntries"])))))

                      (request/as-admin
                        (reset! captured [])
                        (let [res      (qp/process-query
                                        (lib/native-query mp "SELECT SECURE_CONTEXT('metabase_unrestricted')"))
                              post-job (m/find-first #(= "POST" (:method %)) @captured)]
                          (is (= [["ok"]] (get-in res [:data :rows])))
                          (is (false? @impersonated?))
                          (is (= {"email"                 ""
                                  "impersonation_role"    ""
                                  "metabase_unrestricted" "true"
                                  "metabase_user_id"      ""
                                  "region"                ""
                                  "tenant_id"             ""}
                                 (get-in post-job
                                         [:body
                                          "configuration"
                                          "query"
                                          "secureContext"
                                          "secureParameterEntries"]))))))))

                 (testing "table-rows-sample skips tabledata.list and falls back to SQL query under impersonation"
                   (let [[_ transport-opts]   (mock-bq-transport "org:analytics-prod")
                         ^BigQuery client     (.getService (.build (mock-bq-client-builder "org:analytics-prod"
                                                                                           transport-opts)))
                         standard-bq-table    (.getTable client
                                                         (TableId/of "org:analytics-prod" "ds" "tbl")
                                                         (u/varargs BigQuery$TableOption))
                         sql-fallback-called? (atom false)
                         sample-table-called? (atom false)]
                     (mt/with-dynamic-fn-redefs [bigquery/get-table (constantly standard-bq-table)
                                                 bigquery/ingestion-time-partitioned-table? (constantly false)
                                                 bigquery/sample-table
                                                 (fn [& _] (reset! sample-table-called? true) [])
                                                 table-rows-sample/table-rows-sample
                                                 (fn [& _] (reset! sql-fallback-called? true) :sql-fallback)]
                       (is (= :sql-fallback
                              (driver/table-rows-sample :bigquery-cloud-sdk
                                                        {:id 1 :db_id (:id db) :schema "ds" :name "tbl"}
                                                        []
                                                        identity
                                                        {})))
                       (is (true? @sql-fallback-called?))
                       (is (false? @sample-table-called?))))))))))))))

(deftest secure-context-database-routing-test
  (when config/ee-available?
    (ee-var 'metabase-enterprise.database-routing.models/db-routing-enabled?)
    (mt/with-premium-features #{:advanced-permissions :database-routing}
      (do-with-bq-secure-context-db!
       {}
       (fn [router _group]
         (mt/with-temp [:model/Database       dest {:name               "bq-dest-tenant-a"
                                                    :engine             :bigquery-cloud-sdk
                                                    :router_database_id (:id router)
                                                    :details            {:project-id         "org:tenant-a"
                                                                         :billing-project-id "org:tenant-a"}}
                        :model/DatabaseRouter _    {:database_id    (:id router)
                                                    :user_attribute "bq_dest"}]
           (do-with-user-attributes! :rasta {"bq_role" "tam" "region" "eu-west" "bq_dest" "bq-dest-tenant-a"}
             (fn []
               (testing "direct connection-spec access to destination database is blocked by check-allowed-access!"
                 (test.users/with-test-user :rasta
                   (is (thrown-with-msg?
                        ExceptionInfo #"cannot query a destination database directly"
                        (driver/connection-spec :bigquery-cloud-sdk (driver.u/lib-database (:id dest)))))))

               (testing "routed execution resolves destination project while inheriting router SECURE_CONTEXT policy"
                 (do-with-mock-bq-client!
                  "org:tenant-a"
                  (fn [captured _impersonated?]
                    (test.users/with-test-user :rasta
                      (driver/execute-raw-queries!
                       :bigquery-cloud-sdk
                       (driver/connection-spec :bigquery-cloud-sdk (driver.u/lib-database (:id router)))
                       ["SELECT SECURE_CONTEXT('email')"])
                      (let [{:keys [url body]} (last @captured)]
                        (is (str/includes? url "/projects/org:tenant-a/queries"))
                        (is (= {"email"                 (:email (test.users/fetch-user :rasta))
                                "impersonation_role"    "tam"
                                "metabase_user_id"      (str (mt/user->id :rasta))
                                "metabase_unrestricted" "false"
                                "region"                "eu-west"
                                "tenant_id"             ""}
                               (get-in body ["secureContext" "secureParameterEntries"]))))))))))))))))
