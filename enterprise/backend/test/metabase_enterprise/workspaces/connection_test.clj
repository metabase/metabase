(ns metabase-enterprise.workspaces.connection-test
  "The details a sidecar gets for a workspace database never carry the parent's own login, on any engine that has or
  will have workspaces."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.connection :as ws.connection]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private workspace-details {:user "mb__isolation_k3f9q2xa", :password "WorkspacePassw0rd"})

(def ^:private schemas {"sales" "mb__isolation_k3f9q2xa_s42_sales"})

(defn- details-for
  [parent-details]
  (ws.connection/connection-details parent-details workspace-details schemas nil))

(defn- parent-values
  "Every string value of `parent-details` that starts with PARENT, the marker these tests give the parent's secrets."
  [parent-details]
  (filter #(and (string? %) (str/starts-with? % "PARENT")) (vals parent-details)))

(defn- leaked
  "The PARENT-marked values of `parent-details` that appear anywhere in the details built from it."
  [parent-details]
  (let [out (pr-str (details-for parent-details))]
    (filterv #(str/includes? out %) (parent-values parent-details))))

(deftest keeps-the-connection-and-swaps-the-login-test
  (is (= {:host                        "warehouse.example.com"
          :port                        5432
          :dbname                      "analytics"
          :ssl                         true
          :ssl-mode                    "require"
          :user                        "mb__isolation_k3f9q2xa"
          :password                    "WorkspacePassw0rd"
          :schema-filters-type         "inclusion"
          :schema-filters-patterns     "sales,mb__isolation_k3f9q2xa_s42_sales"
          :let-user-control-scheduling false}
         (details-for {:host                        "warehouse.example.com"
                       :port                        5432
                       :dbname                      "analytics"
                       :ssl                         true
                       :ssl-mode                    "require"
                       :user                        "PARENT-user"
                       :password                    "PARENT-password"
                       :schema-filters-type         "exclusion"
                       :schema-filters-patterns     "PARENT-filter"
                       :let-user-control-scheduling true}))))

(deftest drops-parent-auth-provider-test
  (doseq [[provider extra] {"oauth"                  {:oauth-token-url     "PARENT-token-url"
                                                      :oauth-token-headers "PARENT-{\"client_secret\":\"s3cret\"}"}
                            "azure-managed-identity" {:azure-managed-identity-client-id "PARENT-client-id"}
                            "aws-iam"                {}}
          engine-details   [{:host "h", :port 5432, :dbname "analytics"}
                            {:host "h", :port 3306, :dbname "analytics"}]]
    (testing provider
      (let [parent (merge engine-details {:use-auth-provider true, :auth-provider provider} extra)
            out    (details-for parent)]
        (is (= [] (leaked parent)))
        (is (= {} (select-keys out [:use-auth-provider :auth-provider :oauth-token-url :oauth-token-headers
                                    :azure-managed-identity-client-id])))
        (is (= workspace-details (select-keys out [:user :password])))))))

(deftest drops-parent-sqlserver-ad-login-test
  (doseq [[auth-mode ad-details]
          {"ad-service-principal"             {:ad-client-id     "PARENT-client-id"
                                               :ad-client-secret "PARENT-client-secret"}
           "ad-service-principal-certificate" {:ad-client-id                           "PARENT-client-id"
                                               :ad-client-certificate-options          "uploaded"
                                               :ad-client-certificate-value            "PARENT-cert"
                                               :ad-client-certificate-password-value   "PARENT-cert-password"
                                               :ad-client-key-options                  "uploaded"
                                               :ad-client-key-value                    "PARENT-key"
                                               :ad-client-key-password-value           "PARENT-key-password"}
           "ad-service-principal-certificate, as stored" {:ad-client-id                    "PARENT-client-id"
                                                          :ad-client-certificate-id        11
                                                          :ad-client-certificate-password-id 12
                                                          :ad-client-key-id                13
                                                          :ad-client-key-password-id       14
                                                          :ad-client-key-path              "PARENT-/keys/client.pem"}
           "ad-managed-identity"              {:ad-managed-identity-client-id "PARENT-identity"}}]
    (testing auth-mode
      (let [parent (merge {:host "h", :db "AnalyticsDB", :domain "PARENT-DOMAIN", :auth-mode (first (str/split auth-mode #","))}
                          ad-details)
            out    (details-for parent)]
        (is (= [] (leaked parent)))
        (is (= workspace-details (select-keys out [:user :password])))
        (testing "without :auth-mode the driver falls back to the SQL login, the workspace user"
          (is (not (contains? out :auth-mode))))
        (is (= [] (filterv #(str/starts-with? (name %) "ad-") (keys out))))
        (is (= {:host "h", :db "AnalyticsDB"} (select-keys out [:host :db :domain])))))))

(deftest drops-parent-client-certificate-tunnel-and-extra-login-test
  (testing "Postgres client-certificate login, as uploaded and as stored (Secret ids)"
    (doseq [parent [{:host                   "h"
                     :ssl                    true
                     :ssl-mode               "verify-full"
                     :ssl-use-client-auth    true
                     :ssl-client-cert-options "uploaded"
                     :ssl-client-cert-value  "PARENT-client-cert"
                     :ssl-key-options        "uploaded"
                     :ssl-key-value          "PARENT-client-key"
                     :ssl-key-password-value "PARENT-key-password"}
                    {:host                  "h"
                     :ssl                   true
                     :ssl-mode              "verify-full"
                     :ssl-use-client-auth   true
                     :ssl-client-cert-id    21
                     :ssl-key-id            22
                     :ssl-key-password-id   23
                     :ssl-key-path          "PARENT-/keys/client.key"}]]
      (let [out (details-for parent)]
        (is (= [] (leaked parent)))
        (is (= {:host "h", :ssl true, :ssl-mode "verify-full"}
               (select-keys out (keys parent)))))))
  (testing "SSH tunnel credentials (Postgres, Redshift, SQL Server, MySQL, ClickHouse): the host and user stay"
    (doseq [auth-option ["password" "ssh-key"]]
      (let [parent {:host                          "h"
                    :tunnel-enabled                true
                    :tunnel-host                   "bastion"
                    :tunnel-port                   22
                    :tunnel-user                   "tunnel-user"
                    :tunnel-auth-option            auth-option
                    :tunnel-pass                   "PARENT-tunnel-pass"
                    :tunnel-private-key            "PARENT-tunnel-key"
                    :tunnel-private-key-passphrase "PARENT-tunnel-passphrase"
                    :tunnel-known-hosts-id         31}
            out    (details-for parent)]
        (is (= [] (leaked parent)))
        (is (= {:host "h", :tunnel-enabled true, :tunnel-host "bastion", :tunnel-port 22, :tunnel-user "tunnel-user"
                :tunnel-auth-option auth-option}
               (select-keys out (keys parent)))))))
  (testing "free-form JDBC options and the impersonation role (MySQL, SQL Server)"
    (let [parent {:host "h", :additional-options "PARENT-sslpassword=x&user=parent", :role "PARENT-role"}]
      (is (= [] (leaked parent)))
      (is (= {:host "h"} (select-keys (details-for parent) (keys parent)))))))

(deftest ssl-root-certificate-is-inlined-test
  (testing "a root certificate the parent stores as a Secret or a file goes as its value: neither reference resolves
            on the sidecar, where a Secret id could name an unrelated Secret"
    (let [cert "-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----\n"]
      (is (= {:ssl-root-cert-options "uploaded", :ssl-root-cert-value cert}
             (select-keys (ws.connection/connection-details {:host "h", :ssl-root-cert-id 41, :ssl-root-cert-path "/p"}
                                                            workspace-details schemas cert)
                          [:ssl-root-cert-id :ssl-root-cert-path :ssl-root-cert-options :ssl-root-cert-value]))))))

(def ^:private kept-properties
  "Connection properties of the workspace engines that do not authenticate as the parent, and so reach the sidecar (or
  are overwritten for it: the schema filters and scheduling). Every other property of these engines must be stripped;
  a new one fails [[every-connection-property-is-kept-or-stripped-test]] until it is sorted here or into the
  connection namespace's list."
  #{"host" "port" "dbname" "db" "instance" "ssl" "ssl-mode" "ssl-root-cert-value" "ssl-root-cert-options" "ssl-cert"
    "json-unfolding" "auto_run_queries" "refingerprint" "let-user-control-scheduling"
    "schedules.metadata_sync" "schedules.cache_field_values"
    "schema-filters-type" "schema-filters-patterns" "db-filters-type" "db-filters-patterns"
    "tunnel-enabled" "tunnel-host" "tunnel-port" "tunnel-user" "tunnel-auth-option"
    "clickhouse-settings" "max-open-connections" "enable-multiple-db" "use-no-proxy"})

(defn- flatten-properties
  [properties]
  (mapcat #(if (:fields %) (flatten-properties (:fields %)) [%]) properties))

(defn- property-names
  "Names of the connection properties of `engine` as the database form sends them in `details`. A `:secret` property
  arrives as `<name>-value`; it is stored as `<name>-id` (or `<name>-path` for a local file), so those are added."
  [engine]
  (into #{}
        (comp (remove (comp #{:info :section :hidden :group} :type))
              (keep :name)
              (mapcat #(if (str/ends-with? % "-value")
                         (let [base (subs % 0 (- (count %) (count "-value")))]
                           [% (str base "-id") (str base "-path") (str base "-options")])
                         [%])))
        (flatten-properties (driver.u/connection-props-server->client engine (driver/connection-properties engine)))))

(defn- driver-loadable?
  [engine]
  (try
    (driver/the-initialized-driver engine)
    true
    (catch Throwable _
      false)))

(deftest every-connection-property-is-kept-or-stripped-test
  (doseq [engine [:postgres :redshift :sqlserver :mysql :clickhouse]
          :when  (driver-loadable? engine)]
    (testing engine
      (let [names    (property-names engine)
            parent   (into {} (map (fn [n] [(keyword n) (str "PARENT-" n)])) names)
            out      (ws.connection/connection-details parent workspace-details schemas nil)
            expected (into (set (map keyword (filter kept-properties names)))
                           [:user :password :schema-filters-type :schema-filters-patterns :let-user-control-scheduling])]
        (is (= expected (set (keys out))))
        (testing "only the properties sorted as kept carry a parent value"
          (is (= (set (keep #(when (str/starts-with? (str (val %)) "PARENT") (name (key %))) out))
                 (set (remove #{"let-user-control-scheduling" "schema-filters-type" "schema-filters-patterns"}
                              (filter kept-properties names))))))))))

(deftest config-yml-test
  (let [connection {:workspace {:id 1, :name "orders-cleanup"}
                    :databases [{:name    "analytics"
                                 :engine  "postgres"
                                 :details {:host "h", :port 5432, :user "mb__isolation_k3f9q2xa", :password "pw: #1"}
                                 :schemas {"sales"   "mb__isolation_k3f9q2xa_s42_sales"
                                           "finance" "mb__isolation_k3f9q2xa_s43_finance"}}]}]
    (testing "the config.yml a sidecar applies: the database under config.databases, the workspace map under
              config.workspace"
      (is (= {:version 1
              :config  {:databases [{:name    "analytics"
                                     :engine  "postgres"
                                     :details {:host "h", :port 5432, :user "mb__isolation_k3f9q2xa", :password "pw: #1"}}]
                        :workspace {:name      "orders-cleanup"
                                    :databases {:analytics {:schemas {:sales   "mb__isolation_k3f9q2xa_s42_sales"
                                                                      :finance "mb__isolation_k3f9q2xa_s43_finance"}}}}}}
             (yaml/parse-string (ws.connection/config-yml connection)))))))
