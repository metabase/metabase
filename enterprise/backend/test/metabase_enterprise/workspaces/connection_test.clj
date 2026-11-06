(ns metabase-enterprise.workspaces.connection-test
  "The details a sidecar gets for a workspace database never carry the parent's own login, on any engine that has or
  will have workspaces."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.connection :as ws.connection]
   [metabase.driver :as driver]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private workspace-details {:user "mb__isolation_k3f9q2xa", :password "WorkspacePassw0rd"})

(def ^:private schemas {"sales" "mb__isolation_k3f9q2xa_s42_sales"})

(def ^:private engines [:postgres :redshift :sqlserver :mysql :clickhouse])

(defn- details-for
  [engine parent-details]
  (ws.connection/connection-details engine parent-details workspace-details schemas nil))

(defn- parent-values
  "Every string value of `parent-details` that starts with PARENT, the marker these tests give the parent's secrets."
  [parent-details]
  (filter #(and (string? %) (str/starts-with? % "PARENT")) (vals parent-details)))

(defn- leaked
  "The PARENT-marked values of `parent-details` that appear anywhere in the details `engine` gets from it."
  [engine parent-details]
  (let [out (pr-str (details-for engine parent-details))]
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
         (details-for :postgres {:host                        "warehouse.example.com"
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
          [engine engine-details] {:postgres {:host "h", :port 5432, :dbname "analytics"}
                                   :mysql    {:host "h", :port 3306, :dbname "analytics"}}]
    (testing (str engine " " provider)
      (let [parent (merge engine-details {:use-auth-provider true, :auth-provider provider} extra)
            out    (details-for engine parent)]
        (is (= [] (leaked engine parent)))
        (is (= {} (select-keys out [:use-auth-provider :auth-provider :oauth-token-url :oauth-token-headers
                                    :azure-managed-identity-client-id])))
        (is (= workspace-details (select-keys out [:user :password])))))))

(deftest drops-parent-sqlserver-ad-login-test
  (doseq [[auth-mode ad-details]
          {"ad-service-principal"                        {:ad-client-id     "PARENT-client-id"
                                                          :ad-client-secret "PARENT-client-secret"}
           "ad-service-principal-certificate"            {:ad-client-id                         "PARENT-client-id"
                                                          :ad-client-certificate-options        "uploaded"
                                                          :ad-client-certificate-value          "PARENT-cert"
                                                          :ad-client-certificate-password-value "PARENT-cert-password"
                                                          :ad-client-key-options                "uploaded"
                                                          :ad-client-key-value                  "PARENT-key"
                                                          :ad-client-key-password-value         "PARENT-key-password"}
           "ad-service-principal-certificate, as stored" {:ad-client-id                      "PARENT-client-id"
                                                          :ad-client-certificate-id          11
                                                          :ad-client-certificate-password-id 12
                                                          :ad-client-key-id                  13
                                                          :ad-client-key-password-id         14
                                                          :ad-client-key-path                "PARENT-/keys/client.pem"}
           "ad-managed-identity"                         {:ad-managed-identity-client-id "PARENT-identity"}}]
    (testing auth-mode
      (let [parent (merge {:host "h", :db "AnalyticsDB", :domain "PARENT-DOMAIN", :auth-mode (first (str/split auth-mode #","))}
                          ad-details)
            out    (details-for :sqlserver parent)]
        (is (= [] (leaked :sqlserver parent)))
        (is (= workspace-details (select-keys out [:user :password])))
        (testing "without :auth-mode the driver falls back to the SQL login, the workspace user"
          (is (not (contains? out :auth-mode))))
        (is (= [] (filterv #(str/starts-with? (name %) "ad-") (keys out))))
        (is (= {:host "h", :db "AnalyticsDB"} (select-keys out [:host :db :domain])))))))

(deftest drops-parent-client-certificate-tunnel-and-extra-login-test
  (testing "Postgres client-certificate login, as uploaded and as stored (Secret ids)"
    (doseq [parent [{:host                    "h"
                     :ssl                     true
                     :ssl-mode                "verify-full"
                     :ssl-use-client-auth     true
                     :ssl-client-cert-options "uploaded"
                     :ssl-client-cert-value   "PARENT-client-cert"
                     :ssl-key-options         "uploaded"
                     :ssl-key-value           "PARENT-client-key"
                     :ssl-key-password-value  "PARENT-key-password"}
                    {:host                "h"
                     :ssl                 true
                     :ssl-mode            "verify-full"
                     :ssl-use-client-auth true
                     :ssl-client-cert-id  21
                     :ssl-key-id          22
                     :ssl-key-password-id 23
                     :ssl-key-path        "PARENT-/keys/client.key"}]]
      (is (= [] (leaked :postgres parent)))
      (is (= {:host "h", :ssl true, :ssl-mode "verify-full"} (select-keys (details-for :postgres parent) (keys parent))))))
  (testing "SSH tunnel properties: workspaces do not support tunnels, so none goes, not even the bastion's host and user"
    (doseq [engine                       engines
            [tunnel-enabled auth-option] [[true "password"] [true "ssh-key"] [false "ssh-key"]]]
      (let [parent {:host                          "h"
                    :tunnel-enabled                tunnel-enabled
                    :tunnel-host                   "PARENT-bastion"
                    :tunnel-port                   22
                    :tunnel-user                   "PARENT-tunnel-user"
                    :tunnel-auth-option            auth-option
                    :tunnel-pass                   "PARENT-tunnel-pass"
                    :tunnel-private-key            "PARENT-tunnel-key"
                    :tunnel-private-key-passphrase "PARENT-tunnel-passphrase"
                    :tunnel-known-hosts-id         31}]
        (is (= [] (leaked engine parent)))
        (is (= {:host "h"} (select-keys (details-for engine parent) (keys parent)))))))
  (testing "free-form JDBC options, the impersonation role, and keys no driver declares are dropped on every engine"
    (doseq [engine engines]
      (let [parent {:host                   "h"
                    :additional-options     "PARENT-sslpassword=x&user=parent"
                    :role                   "PARENT-role"
                    :http-auth-url          "PARENT-https://idp.example/token"
                    :http-auth-headers      "PARENT-Authorization: Bearer abc"
                    :sslpassword            "PARENT-sslpassword"
                    :ssl-client-key-value   "PARENT-legacy-client-key"
                    :ssl-client-key-options "uploaded"
                    :made-up-property       "PARENT-made-up"}]
        (is (= [] (leaked engine parent)))
        (is (= {:host "h"} (select-keys (details-for engine parent) (keys parent))))))))

(deftest an-engine-without-workspace-properties-gets-only-the-workspace-login-test
  (is (= #{:user :password :schema-filters-type :schema-filters-patterns :let-user-control-scheduling}
         (set (keys (details-for :snowflake {:host "h", :account "PARENT-account", :private-key-value "PARENT-key"}))))))

(deftest ssl-root-certificate-is-sent-as-its-value-test
  (let [cert "-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----\n"]
    (is (= {:ssl-root-cert-options "uploaded", :ssl-root-cert-value cert}
           (select-keys (ws.connection/connection-details :postgres {:host "h", :ssl-root-cert-id 41, :ssl-root-cert-path "/p"}
                                                          workspace-details schemas cert)
                        [:ssl-root-cert-id :ssl-root-cert-path :ssl-root-cert-options :ssl-root-cert-value])))
    (testing "without one to send, no root certificate key goes, whatever the parent stores"
      (is (= {} (select-keys (ws.connection/connection-details :postgres {:ssl-root-cert-value "PARENT-cert"
                                                                          :ssl-root-cert-options "local"
                                                                          :ssl-root-cert-path "/etc/passwd"}
                                                               workspace-details schemas nil)
                             [:ssl-root-cert-id :ssl-root-cert-path :ssl-root-cert-options :ssl-root-cert-value]))))))

(def ^:private kept-properties
  "Per engine, the declared connection properties the sidecar gets from the parent. Mirrors the connection namespace's
  allowlist on purpose: a property a driver adds fails [[every-declared-property-is-sorted-test]] until it is sorted
  here and, if it is safe to send, there."
  {:postgres   #{"host" "port" "dbname" "db" "ssl" "ssl-mode" "json-unfolding" "auto_run_queries" "refingerprint"}
   :redshift   #{"host" "port" "db" "auto_run_queries" "refingerprint"}
   :sqlserver  #{"host" "port" "db" "instance" "ssl" "auto_run_queries" "refingerprint"}
   :mysql      #{"host" "port" "dbname" "ssl" "ssl-cert" "json-unfolding" "auto_run_queries" "refingerprint"}
   :clickhouse #{"host" "port" "dbname" "ssl" "clickhouse-settings" "max-open-connections" "enable-multiple-db"
                 "use-no-proxy" "auto_run_queries" "refingerprint"}})

(defn- dropped-property?
  "Whether `property-name`, declared by a workspace engine, is one the sidecar must not get from the parent: a login or
  credential, a tunnel field, free-form JDBC options, the parent's scheduling and schema filters (written for the
  sidecar instead), or the root certificate (sent only by the connection namespace's own rule)."
  [property-name]
  (or (#{"user" "password" "use-auth-provider" "auth-provider" "azure-managed-identity-client-id" "oauth-token-url"
         "oauth-token-headers" "auth-mode" "role" "ssl-use-client-auth" "additional-options"
         "let-user-control-scheduling"} property-name)
      (some #(str/starts-with? property-name %)
            ["ad-" "tunnel-" "ssl-client-cert" "ssl-key" "ssl-root-cert" "schedules." "schema-filters" "db-filters"])))

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

(defn- driver-on-classpath?
  "Whether `engine`'s driver namespace is on the test classpath: Postgres and MySQL always are, the module drivers when
  the drivers alias is on. A driver that is there but fails to load fails the test rather than skipping it."
  [engine]
  (some? (io/resource (format "metabase/driver/%s.clj" (name engine)))))

(deftest every-declared-property-is-sorted-test
  (is (driver-on-classpath? :postgres))
  (is (driver-on-classpath? :mysql))
  (doseq [engine engines
          :when  (driver-on-classpath? engine)]
    (testing engine
      (driver/the-initialized-driver engine)
      (let [names (property-names engine)
            kept  (kept-properties engine)]
        (testing "every declared property is either sent or dropped on purpose"
          (is (= #{} (set (remove #(or (kept %) (dropped-property? %)) names)))))
        (testing "a parent with every declared property, and one no driver declares, sends exactly the kept ones"
          (let [parent (into {:made-up-property "PARENT-made-up"} (map (fn [n] [(keyword n) (str "PARENT-" n)])) names)
                out    (details-for engine parent)]
            (is (= (set (filter kept names))
                   (set (keep #(when (str/starts-with? (str (val %)) "PARENT") (name (key %))) out))))
            (is (= (into (set (map keyword (filter kept names)))
                         [:user :password :schema-filters-type :schema-filters-patterns :let-user-control-scheduling])
                   (set (keys out))))))))))

(deftest config-yml-test
  (let [connection {:workspace {:id 1, :name "orders-cleanup"}
                    :databases [{:name           "analytics"
                                 :engine         "postgres"
                                 :details        {:host "h", :port 5432, :user "mb__isolation_k3f9q2xa", :password "pw: #1"}
                                 :schemas        {"sales"   "mb__isolation_k3f9q2xa_s42_sales"
                                                  "finance" "mb__isolation_k3f9q2xa_s43_finance"}
                                 :failed_schemas [{:main_schema "marketing", :error "failed"}]}]}]
    (testing "the config.yml a sidecar applies: the database under config.databases, the workspace map under
              config.workspace, and no failed schemas"
      (is (= {:version 1
              :config  {:databases [{:name    "analytics"
                                     :engine  "postgres"
                                     :details {:host "h", :port 5432, :user "mb__isolation_k3f9q2xa", :password "pw: #1"}}]
                        :workspace {:name      "orders-cleanup"
                                    :databases {:analytics {:schemas {:sales   "mb__isolation_k3f9q2xa_s42_sales"
                                                                      :finance "mb__isolation_k3f9q2xa_s43_finance"}}}}}}
             (yaml/parse-string (ws.connection/config-yml connection)))))))

(deftest schema-filter-matches-exactly-the-workspace-schemas-test
  (testing "names with regex characters match only themselves under the sync filter the sidecar applies"
    (let [schemas                           {"a.b"   "mb__isolation_k3f9q2xa_s1_a_b"
                                             "x(y)$" "mb__isolation_k3f9q2xa_s2_x_y__"
                                             "s*"    "mb__isolation_k3f9q2xa_s3_s_"}
          {:keys [schema-filters-patterns]} (ws.connection/connection-details :postgres {} workspace-details schemas nil)
          include?                          #(driver.s/include-schema? schema-filters-patterns nil %)]
      (is (every? include? (concat (keys schemas) (vals schemas))))
      (is (not-any? include? ["aXb" "x(y)$z" "sales" "s" "mb__isolation_k3f9q2xa_s9_other"])))))
