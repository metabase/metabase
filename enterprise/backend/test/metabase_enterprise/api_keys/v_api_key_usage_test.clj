(ns metabase-enterprise.api-keys.v-api-key-usage-test
  "Tests for the `v_api_key_usage` SQL view. Client identity and PII are stored on each request row;
  the view derives `client_display_name` / `user_display_name` from it and LEFT JOINs api_key,
  core_user and tenant. Every one of those joins is a LEFT JOIN on purpose — `api_key_usage_log` has
  no foreign keys, so rows outlive a deleted key, user, or tenant."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.api-keys.core :as api-keys]
   [metabase.api-keys.usage :as api-keys.usage]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- query-view
  "Query v_api_key_usage, returning only rows for the given log ids."
  [log-ids]
  (t2/query {:select [:*]
             :from   [:v_api_key_usage]
             :where  [:in :log_id log-ids]}))

(defn- find-row [rows log-id]
  (some #(when (= (:log_id %) log-id) %) rows))

(defn- log-row
  "A minimal `api_key_usage_log` row, with every NOT NULL column filled in."
  [m]
  (merge {:api_key_id     Integer/MAX_VALUE
          :route_template "/api/card/:id"
          :http_method    "GET"
          :status         200
          :duration_ms    12
          :client_name    "other"
          :created_at     (t/offset-date-time)}
         m))

(deftest joins-and-derived-columns-test
  (testing "the view joins key, user and tenant and derives the display columns"
    (mt/with-temp
      [:model/Tenant            {tenant-id :id} {:name "Acme"}
       :model/User              {user-id :id}   {:first_name "Ada" :last_name "Lovelace"}
       :model/PermissionsGroup  {group-id :id}  {:name "Analysts"}
       :model/PermissionsGroupMembership _      {:user_id user-id :group_id group-id}
       :model/ApiKey            {key-id :id}    {::api-keys/unhashed-key "mb_1234567890"
                                                 :name          "Reporting key"
                                                 :user_id       user-id
                                                 :creator_id    user-id
                                                 :updated_by_id user-id}
       :model/ApiKeyUsageLog    {log-id :id}    (log-row {:api_key_id       key-id
                                                          :user_id          user-id
                                                          :tenant_id        tenant-id
                                                          :route_template   "/api/card/:id"
                                                          :http_method      "POST"
                                                          :status           201
                                                          :duration_ms      42
                                                          :client_name      "metabase-cli"
                                                          :embedding_client "embedding-sdk-react"
                                                          :embedding_hostname "example.com"
                                                          :ip_address       "10.0.0.7"
                                                          :user_agent       "metabase-cli/1.2.3"})]
      (is (=? {:route_template      "/api/card/:id"
               :http_method         "POST"
               :status              201
               :duration_ms         42
               :api_key_id          key-id
               :api_key_name        "Reporting key"
               :user_id             user-id
               :user_display_name   "Ada Lovelace"
               :group_name          "Analysts"
               :tenant_id           tenant-id
               :tenant_name         "Acme"
               :client_name         "metabase-cli"
               :client_display_name "Metabase CLI"
               :embedding_client    "embedding-sdk-react"
               :embedding_hostname  "example.com"
               :ip_address          "10.0.0.7"
               :user_agent          "metabase-cli/1.2.3"}
              (find-row (query-view [log-id]) log-id))))))

(deftest missing-key-user-and-tenant-test
  (testing "a row whose key/user/tenant are gone (or were never set) survives, with null join columns"
    (mt/with-temp
      [:model/ApiKeyUsageLog {orphan-id :id} (log-row {:api_key_id Integer/MAX_VALUE
                                                       :user_id    nil
                                                       :tenant_id  nil})]
      (let [row (find-row (query-view [orphan-id]) orphan-id)]
        (is (some? row) "the row is not dropped")
        (is (=? {:route_template    "/api/card/:id"
                 :api_key_id        Integer/MAX_VALUE
                 :api_key_name      nil
                 :user_id           nil
                 :user_display_name nil
                 :group_name        nil
                 :tenant_id         nil
                 :tenant_name       nil}
                row))))))

(deftest pii-columns-passthrough-test
  (testing "ip_address / user_agent pass through as null when PII collection was off at write time"
    (mt/with-temp
      [:model/ApiKeyUsageLog {log-id :id} (log-row {:ip_address nil :user_agent nil})]
      (is (=? {:ip_address nil :user_agent nil :embedding_client nil}
              (find-row (query-view [log-id]) log-id))))))

(deftest user-display-name-falls-back-to-email-test
  (testing "a user with no last name falls back to their email"
    (mt/with-temp
      [:model/User           {user-id :id, email :email} {:first_name "Ada" :last_name nil}
       :model/ApiKeyUsageLog {log-id :id}                (log-row {:user_id user-id})]
      (is (=? {:user_display_name email}
              (find-row (query-view [log-id]) log-id))))))

;; Guard the hand-maintained client_name -> client_display_name coupling. These pairs must stay in
;; sync with the CASE in the v_api_key_usage view SQL and `supported-client-keys` / `detect-client`
;; in metabase.api-keys.usage; drift on either side breaks this test rather than silently
;; mislabeling clients.
(def ^:private client-name->display-name
  {"metabase-cli"    "Metabase CLI"
   "curl"            "curl"
   "postman"         "Postman"
   "python-requests" "Python"
   "r"               "R"
   "node"            "Node.js"
   "other"           "Other"})

(deftest client-display-name-mapping-test
  (testing "the mapping covers exactly the canonical client keys plus the \"other\" catch-all"
    (is (= (conj api-keys.usage/supported-client-keys "other")
           (set (keys client-name->display-name)))))
  (testing "every client_name maps to the expected display name"
    (doseq [[client-name expected] client-name->display-name]
      (mt/with-temp
        [:model/ApiKeyUsageLog {log-id :id} (log-row {:client_name client-name})]
        (is (= expected (:client_display_name (find-row (query-view [log-id]) log-id)))
            (format "client_name %s should map to %s" (pr-str client-name) (pr-str expected))))))
  (testing "an unrecognized client_name passes through unchanged"
    (mt/with-temp
      [:model/ApiKeyUsageLog {log-id :id} (log-row {:client_name "brand-new-client"})]
      (is (= "brand-new-client"
             (:client_display_name (find-row (query-view [log-id]) log-id)))))))
