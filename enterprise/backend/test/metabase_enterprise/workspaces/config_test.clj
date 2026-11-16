(ns metabase-enterprise.workspaces.config-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.config :as config]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.driver.sync :as driver.sync]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest build-workspace-config-happy-path-test
  (testing "build-workspace-config returns a {:version 1 :config {...}} structure matching config.yml"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "Analytics Data Warehouse"
                    :engine  :postgres
                    :details {:host   "mbdata.metabase.com"
                              :port   5432
                              :user   "admin"
                              :dbname "stitchdata_incoming"}}
                   :model/Workspace {ws-id :id} {:name       "github"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "mb_isolation_github" :password "secret"}
                    :output_namespace "mb_isolation_github"
                    :input_schemas    ["raw_github"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (testing "outer shape matches config.yml (version + config block)"
          (is (= 1 (:version cfg)))
          (is (= #{:databases :workspace} (set (keys (:config cfg))))))
        (testing "databases entry"
          (let [own-dbs (remove (some-fn :is_stub :is_sample) (-> cfg :config :databases))
                db      (first own-dbs)]
            (is (= 1 (count own-dbs)))
            (is (= "Analytics Data Warehouse" (:name db)))
            (is (= :postgres (:engine db)))
            (testing "original details are preserved, workspace overrides win, schema-filters appended"
              (is (= {:host                        "mbdata.metabase.com"
                      :port                        5432
                      :user                        "mb_isolation_github"
                      :password                    "secret"
                      :dbname                      "stitchdata_incoming"
                      :schema-filters-type         "inclusion"
                      :schema-filters-patterns     "raw_github"
                      :let-user-control-scheduling false}
                     (:details db))))))
        (testing "workspace entry uses flat input_schemas + expanded :output map"
          (is (= "github" (-> cfg :config :workspace :name)))
          (is (= {"Analytics Data Warehouse"
                  {:input_schemas ["raw_github"]
                   :output        {:schema "mb_isolation_github"}}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-drops-unused-tunnel-secrets-test
  (let [tunnel-secrets {:tunnel-pass                   "tunnel-pass"
                        :tunnel-private-key            "tunnel-key"
                        :tunnel-private-key-passphrase "tunnel-key-pass"}
        details-for    (fn [details]
                         (mt/with-temp [:model/Database {db-id :id}
                                        {:name    "Secret DW" :engine :postgres
                                         :details (merge {:host "h" :port 5432 :user "admin"}
                                                         tunnel-secrets details)}
                                        :model/Workspace {ws-id :id} {:name "secrets" :creator_id (mt/user->id :crowberto)}
                                        :model/WorkspaceDatabase _
                                        {:workspace_id     ws-id :database_id db-id
                                         :database_details {:user "iso" :password "iso-pass"}
                                         :output_namespace "iso" :input_schemas ["public"] :status :provisioned}]
                           (->> (config/build-workspace-config ws-id) :config :databases
                                (some #(when (= "Secret DW" (:name %)) (:details %))))))]
    (testing "tunnel off: the tunnel credentials are not emitted"
      (is (= {} (select-keys (details-for {:tunnel-enabled false}) (keys tunnel-secrets)))))
    (testing "tunnel on without an auth option: every credential stays, nothing says which is in use"
      (is (= tunnel-secrets (select-keys (details-for {:tunnel-enabled true}) (keys tunnel-secrets)))))
    (testing "tunnel on with password auth: only the password ships"
      (is (= {:tunnel-pass "tunnel-pass"}
             (select-keys (details-for {:tunnel-enabled true :tunnel-auth-option "password"}) (keys tunnel-secrets)))))
    (testing "tunnel on with SSH-key auth: only the key and its passphrase ship"
      (is (= {:tunnel-private-key "tunnel-key" :tunnel-private-key-passphrase "tunnel-key-pass"}
             (select-keys (details-for {:tunnel-enabled true :tunnel-auth-option "ssh-key"}) (keys tunnel-secrets)))))))

(deftest build-workspace-config-carries-ssl-root-cert-value-test
  (testing "the SSL root cert ships as its value; the parent's Secret id would not resolve in the child"
    (let [root-cert "-----BEGIN CERTIFICATE-----\nMIIBroot\n-----END CERTIFICATE-----\n"]
      (mt/with-temp [:model/Database {db-id :id}
                     {:name    "Cert DW" :engine :postgres
                      :details {:host                    "h" :port 5432 :user "admin"
                                :ssl                     true
                                :ssl-mode                "verify-full"
                                :ssl-root-cert-options   "uploaded"
                                :ssl-root-cert-value     root-cert
                                :ssl-client-cert-options "uploaded"
                                :ssl-client-cert-value   "client-cert"
                                :ssl-key-options         "uploaded"
                                :ssl-key-value           "client-key"
                                :ssl-key-password-value  "client-key-pass"}}
                     :model/Workspace {ws-id :id} {:name "certs" :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id :database_id db-id
                      :database_details {:user "iso" :password "iso-pass"}
                      :output_namespace "iso" :input_schemas ["public"] :status :provisioned}]
        (let [stored  (t2/select-one-fn :details :model/Database :id db-id)
              details (->> (config/build-workspace-config ws-id) :config :databases
                           (some #(when (= "Cert DW" (:name %)) (:details %))))]
          (testing "precondition: the parent stores the certs and the key as Secrets"
            (is (every? int? (map stored [:ssl-root-cert-id :ssl-client-cert-id :ssl-key-id :ssl-key-password-id]))))
          (is (= {:ssl-root-cert-options "uploaded" :ssl-root-cert-value root-cert}
                 (select-keys details [:ssl-root-cert-id :ssl-root-cert-options :ssl-root-cert-value])))
          (testing "the client cert and key ship neither their parent Secret ids, options nor values"
            (is (= {} (select-keys details [:ssl-client-cert-id :ssl-client-cert-options :ssl-client-cert-value
                                            :ssl-key-id :ssl-key-options :ssl-key-value
                                            :ssl-key-password-id :ssl-key-password-options
                                            :ssl-key-password-value])))))))))

(defn- with-cert-workspace
  "Run `f` with the id of a provisioned workspace over a Postgres database named \"Cert DW\" with `details`."
  [details f]
  (mt/with-temp [:model/Database {db-id :id} {:name "Cert DW" :engine :postgres :details details}
                 :model/Workspace {ws-id :id} {:name "certs" :creator_id (mt/user->id :crowberto)}
                 :model/WorkspaceDatabase _
                 {:workspace_id     ws-id :database_id db-id
                  :database_details {:user "iso" :password "iso-pass"}
                  :output_namespace "iso" :input_schemas ["public"] :status :provisioned}]
    (f ws-id)))

(deftest build-workspace-config-drops-unresolvable-ssl-root-cert-id-test
  (testing "a root cert id with no Secret behind it is dropped: in the child it could name an unrelated Secret"
    (with-cert-workspace
      {:host "h" :port 5432 :ssl true :ssl-mode "verify-full" :ssl-root-cert-id Integer/MAX_VALUE}
      (fn [ws-id]
        (let [details (->> (config/build-workspace-config ws-id) :config :databases
                           (some #(when (= "Cert DW" (:name %)) (:details %))))]
          (is (= {:host "h" :ssl-mode "verify-full"} (select-keys details [:host :ssl-mode])))
          (is (= {} (select-keys details [:ssl-root-cert-id :ssl-root-cert-options :ssl-root-cert-value]))))))))

(deftest build-workspace-config-ssl-off-drops-root-cert-test
  (testing "with :ssl off the root cert is not read or shipped, and its parent Secret id is dropped"
    ;; A local-file root cert is refused on hosted instances, so run as self-hosted.
    (mt/with-premium-features #{}
      (with-cert-workspace
        {:host "h" :port 5432 :ssl false
         :ssl-root-cert-options "local" :ssl-root-cert-path "/nonexistent/fe103/root.crt"}
        (fn [ws-id]
          (let [details (->> (config/build-workspace-config ws-id) :config :databases
                             (some #(when (= "Cert DW" (:name %)) (:details %))))]
            (is (= {:host "h" :ssl false} (select-keys details [:host :ssl])))
            (is (= {} (select-keys details [:ssl-root-cert-id :ssl-root-cert-options :ssl-root-cert-value])))))))))

(deftest build-workspace-config-carries-ssh-known-hosts-value-test
  (let [known-hosts "bastion.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIknownhosts\n"
        tunnel      {:host "h" :port 5432 :tunnel-enabled true :tunnel-host "bastion.example" :tunnel-user "t"}
        kh-keys     [:tunnel-known-hosts-id :tunnel-known-hosts-options :tunnel-known-hosts-value]
        details-of  (fn [ws-id]
                      (->> (config/build-workspace-config ws-id) :config :databases
                           (some #(when (= "Cert DW" (:name %)) (:details %)))))]
    (testing "tunnel on, known hosts stored as a Secret: they ship as their value, so the child's tunnel still
              verifies the host key"
      (mt/with-temp [:model/Secret {secret-id :id} {:name "kh" :kind "binary-blob" :source "uploaded" :value known-hosts}]
        (with-cert-workspace
          (assoc tunnel :tunnel-known-hosts-id secret-id)
          (fn [ws-id]
            (is (= {:tunnel-known-hosts-options "uploaded" :tunnel-known-hosts-value known-hosts}
                   (select-keys (details-of ws-id) kh-keys)))))))
    (testing "tunnel on, known hosts kept as a plain value (Postgres doesn't store them as a Secret): the value ships"
      (with-cert-workspace
        (assoc tunnel :tunnel-known-hosts-options "uploaded" :tunnel-known-hosts-value known-hosts)
        (fn [ws-id]
          (is (= {:tunnel-known-hosts-options "uploaded" :tunnel-known-hosts-value known-hosts}
                 (select-keys (details-of ws-id) kh-keys))))))
    (testing "tunnel off: the known hosts aren't read, and the parent Secret id doesn't ship"
      (with-cert-workspace
        {:host "h" :port 5432 :tunnel-enabled false :tunnel-known-hosts-id Integer/MAX_VALUE}
        (fn [ws-id]
          (is (= {} (select-keys (details-of ws-id) kh-keys))))))
    (testing "tunnel off: leftover -options and -value keys don't ship"
      (with-cert-workspace
        {:host "h" :port 5432 :tunnel-enabled false
         :tunnel-known-hosts-options "uploaded" :tunnel-known-hosts-value known-hosts}
        (fn [ws-id]
          (is (= {} (select-keys (details-of ws-id) kh-keys))))))
    (testing "tunnel on with a known-hosts id that doesn't resolve: a 422, since dropping it would skip host-key checks"
      (with-cert-workspace
        (assoc tunnel :tunnel-known-hosts-id Integer/MAX_VALUE)
        (fn [ws-id]
          (is (=? {:status-code 422 :database_id int?}
                  (try
                    (config/build-workspace-config ws-id)
                    nil
                    (catch clojure.lang.ExceptionInfo e
                      (is (= (str "The SSH known hosts of database \"Cert DW\" no longer exist on this instance. Enter "
                                  "them again in the database's connection settings; without them the workspace would "
                                  "not verify the SSH host key.")
                             (ex-message e)))
                      (ex-data e))))))))))

(deftest build-workspace-config-refuses-ssl-client-auth-test
  (testing "a database that authenticates with an SSL client certificate is a 422: the child gets no client cert, so
            it would fail only when it connects"
    (with-cert-workspace
      {:host "h" :port 5432 :ssl true :ssl-mode "verify-full" :ssl-use-client-auth true
       :ssl-client-cert-options "uploaded" :ssl-client-cert-value "client-cert"
       :ssl-key-options "uploaded" :ssl-key-value "client-key"}
      (fn [ws-id]
        (is (=? {:status-code 422 :database_id int?}
                (try
                  (config/build-workspace-config ws-id)
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (is (= (str "Database \"Cert DW\" uses SSL client-certificate authentication, which workspaces "
                                "don't support. Remove the database from the workspace, or turn off client-certificate "
                                "authentication for it.")
                           (ex-message e)))
                    (ex-data e)))))))))

(deftest build-workspace-config-refuses-local-file-root-cert-test
  (testing "a root cert given as a file on the parent's server is a 422 naming the database: its contents could be any
            file the server can read, so they don't ship, and the file is not read"
    ;; A local-file root cert is refused on hosted instances, so run as self-hosted.
    (mt/with-premium-features #{}
      (with-cert-workspace
        {:host "h" :port 5432 :ssl true :ssl-mode "verify-full"
         :ssl-root-cert-options "local" :ssl-root-cert-path "/nonexistent/fe103/root.crt"}
        (fn [ws-id]
          (is (=? {:status-code 422 :database_id int?}
                  (try
                    (config/build-workspace-config ws-id)
                    nil
                    (catch clojure.lang.ExceptionInfo e
                      (is (= (str "The SSL root certificate of database \"Cert DW\" is a file on this instance's "
                                  "server, which workspaces don't copy. Upload the file in the database's connection "
                                  "settings instead.")
                             (ex-message e)))
                      (ex-data e))))))))))

(deftest build-workspace-config-three-slot-engine-test
  (when (workspaces.tu/driver-loadable? :sqlserver)
    (testing "SQL Server (3-slot, qualified-name-components=[:db :schema]) gets the :db slot populated from connection details"
      (mt/with-temp [:model/Database {db-id :id}
                     {:name    "MSSQL DW"
                      :engine  :sqlserver
                      :details {:db "AnalyticsDB" :user "u" :password "p"}}
                     :model/Workspace {ws-id :id} {:name       "mssql"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id
                      :database_id      db-id
                      :database_details {}
                      :output_namespace "ws_alice"
                      :input_schemas    ["dbo"]
                      :status           :provisioned}]
        (let [cfg (config/build-workspace-config ws-id)]
          (is (= {"MSSQL DW"
                  {:input_schemas ["dbo"]
                   :output        {:db "AnalyticsDB" :schema "ws_alice"}}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-joins-multiple-input-schemas-test
  (testing "Multiple input schemas are comma-joined in schema-filters-patterns"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "DW" :engine :postgres :details {:host "h" :port 5432}}
                   :model/Workspace {ws-id :id} {:name       "multi"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "out"
                    :input_schemas    ["schema_a" "schema_b" "schema_c"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= "schema_a,schema_b,schema_c"
               (-> cfg :config :databases first :details :schema-filters-patterns)))))))

(def ^:private schema-name->near-misses
  "Schema names that need escaping in a sync-filter pattern (pattern syntax, or characters outside `[A-Za-z0-9_]`),
  each with names its pattern must not match."
  {"a+b"       ["ab" "aab"]
   "a,b"       ["a" "b"]
   "a|b"       ["a" "b"]
   " sp "      ["sp"]
   "crazy\\*s" ["crazy*s" "crazys"]
   "sales.v2"  ["salesXv2"]
   "*"         ["public" "**"]
   "x(y"       ["xy"]
   "my-schema" ["my_schema"]
   "café"      ["cafe"]
   "naïve😀"   ["naive" "naïve"]})

(defn- built-schema-filter-patterns
  "The `:schema-filters-patterns` the config emits for a Postgres database with `input-schemas`."
  [input-schemas]
  (mt/with-temp [:model/Database {db-id :id} {:name "DW" :engine :postgres :details {:host "h" :port 5432}}
                 :model/Workspace {ws-id :id} {:name       "literal"
                                               :creator_id (mt/user->id :crowberto)}
                 :model/WorkspaceDatabase _
                 {:workspace_id     ws-id
                  :database_id      db-id
                  :database_details {}
                  :output_namespace "mb__isolation_slug_7"
                  :input_schemas    input-schemas
                  :status           :provisioned}]
    (->> (config/build-workspace-config ws-id) :config :databases
         (u/seek #(= "DW" (:name %)))
         :details
         :schema-filters-patterns)))

(defn- pattern-matches? [patterns schema-name]
  (boolean (re-matches (driver.sync/schema-pattern->re-pattern patterns) schema-name)))

(deftest build-workspace-config-input-schemas-match-literally-test
  (testing "each input schema's sync-filter pattern matches that name and none of its near-misses"
    (doseq [[schema-name near-misses] schema-name->near-misses]
      (testing (pr-str schema-name)
        (let [patterns (built-schema-filter-patterns [schema-name])]
          (is (pattern-matches? patterns schema-name))
          (doseq [other (cons "mb__isolation_slug_7" near-misses)]
            (is (not (pattern-matches? patterns other))
                (str "should not match " (pr-str other))))))))
  (testing "joined into one filter, the filter matches every input schema and no near-miss"
    (let [patterns (built-schema-filter-patterns (vec (keys schema-name->near-misses)))]
      (doseq [schema-name (keys schema-name->near-misses)]
        (is (pattern-matches? patterns schema-name) (pr-str schema-name)))
      (doseq [other (cons "mb__isolation_slug_7"
                          (remove (set (keys schema-name->near-misses))
                                  (mapcat val schema-name->near-misses)))]
        (is (not (pattern-matches? patterns other)) (str "should not match " (pr-str other)))))))

;; Tagged so the driver jobs, which have the ClickHouse driver on the classpath, run it; the Enterprise Tests job
;; doesn't, so there it would pass with no assertions. It needs no ClickHouse server.
(deftest ^:mb/driver-tests build-workspace-config-clickhouse-db-filters-stay-raw-test
  (when (workspaces.tu/driver-loadable? :clickhouse)
    (testing "ClickHouse reads :db-filters-patterns as a list of names, not regex, so they are emitted unescaped"
      (mt/with-temp [:model/Database {db-id :id} {:name "CH" :engine :clickhouse :details {:db "default"}}
                     :model/Workspace {ws-id :id} {:name       "ch-ws"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id
                      :database_id      db-id
                      :database_details {}
                      :output_namespace "ws_alice"
                      :input_schemas    ["sales.v2" "a+b"]
                      :status           :provisioned}]
        (is (= "sales.v2,a+b"
               (->> (config/build-workspace-config ws-id) :config :databases
                    (u/seek #(= "CH" (:name %)))
                    :details
                    :db-filters-patterns)))))))

(deftest build-workspace-config-bigquery-emits-dataset-filters-test
  (when (workspaces.tu/driver-loadable? :bigquery-cloud-sdk)
    (testing "BigQuery emits :dataset-filters-* (not :schema-filters-*); BQ's list-datasets reads dataset-filters"
      ;; Stub `:service-account-json` so the resulting config :details has the same
      ;; required shape a production BQ Database row would carry. The BQ driver's
      ;; `database-details->client` (and therefore any downstream `can-connect?`)
      ;; reads `:service-account-json` to mint credentials -- omitting it here
      ;; would make this test pass while the generated config :details would fail
      ;; the real wire-format consumer.
      (mt/with-temp [:model/Database {db-id :id}
                     {:name "BQ" :engine :bigquery-cloud-sdk
                      :details {:project-id          "metabase-prod"
                                :service-account-json "{\"type\":\"service_account\",\"project_id\":\"metabase-prod\"}"}}
                     :model/Workspace {ws-id :id} {:name       "bq-ws"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id
                      :database_id      db-id
                      :database_details {}
                      :output_namespace "ws_alice"
                      :input_schemas    ["core" "warehouse"]
                      :status           :provisioned}]
        (let [details (-> (config/build-workspace-config ws-id) :config :databases first :details)]
          (is (= "inclusion" (:dataset-filters-type details)))
          (is (= "core,warehouse" (:dataset-filters-patterns details)))
          (is (some? (:service-account-json details))
              "BigQuery config :details must carry :service-account-json -- the BQ driver requires it to mint credentials")
          (is (nil? (:schema-filters-type details))
              "BigQuery must NOT emit :schema-filters-* — those wire into describe-database which BQ doesn't use")
          (is (nil? (:schema-filters-patterns details))))))))

(deftest build-workspace-config-rejects-non-provisioned-test
  (testing "Any non-:provisioned WorkspaceDatabase causes a 409"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "Mixed"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_namespace "" :input_schemas ["public"]
                    :status :unprovisioned}]
      (is (thrown-with-msg?
           Exception
           #"not :provisioned"
           (config/build-workspace-config ws-id))))))

(deftest build-workspace-config-empty-workspace-test
  (testing "A workspace with no databases still produces the version+config outer shape"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "Empty"
                                                 :creator_id (mt/user->id :crowberto)}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= 1 (:version cfg)))
        (is (= "Empty" (-> cfg :config :workspace :name)))
        (is (empty? (remove (some-fn :is_stub :is_sample) (-> cfg :config :databases)))
            "no non-stub, non-sample databases since the workspace has none of its own")
        (is (= {} (-> cfg :config :workspace :databases)))))))

(deftest build-workspace-config-injects-stubs-for-non-workspace-dbs-test
  (testing "Databases that exist in the instance but are not provisioned for the workspace appear
            in :config.databases as stub entries with :is_stub true and empty :details.
            Sample, audit, and routing-target DBs are excluded."
    (mt/with-temp [:model/Database router       {:name "stub-test-router" :engine :postgres :details {}}
                   :model/Database _other       {:name "stub-test-other"  :engine :postgres :details {:host "x"}}
                   :model/Database _sample      {:name "stub-test-sample" :engine :postgres :details {} :is_sample true}
                   :model/Database _audit       {:name "stub-test-audit"  :engine :postgres :details {} :is_audit  true}
                   :model/Database _target      {:name "stub-test-target" :engine :postgres :details {} :router_database_id (:id router)}
                   :model/Database ws-db        {:name "stub-test-ws-db"  :engine :postgres :details {:host "y"}}
                   :model/Workspace {ws-id :id} {:name       "stub-test-ws"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _   {:workspace_id     ws-id
                                                 :database_id      (:id ws-db)
                                                 :database_details {}
                                                 :output_namespace ""
                                                 :input_schemas    ["public"]
                                                 :status           :provisioned}]
      (let [cfg-dbs (-> (config/build-workspace-config ws-id) :config :databases)
            by-name (into {} (map (juxt :name identity)) cfg-dbs)]
        (testing "workspace's own database is present and is NOT a stub"
          (is (contains? by-name "stub-test-ws-db"))
          (is (not (:is_stub (get by-name "stub-test-ws-db")))))
        (testing "non-workspace plain DB appears as a stub with empty :details"
          (is (= {:name    "stub-test-other"
                  :engine  :postgres
                  :details {}
                  :is_stub true}
                 (get by-name "stub-test-other"))))
        (testing "router DB (not a routing target) also appears as a stub"
          (is (= {:name    "stub-test-router"
                  :engine  :postgres
                  :details {}
                  :is_stub true}
                 (get by-name "stub-test-router"))))
        (testing "sample, audit, and routing-target DBs are excluded"
          (is (not (contains? by-name "stub-test-sample")))
          (is (not (contains? by-name "stub-test-audit")))
          (is (not (contains? by-name "stub-test-target"))))))))

(deftest build-workspace-config-missing-workspace-returns-nil-test
  (testing "A missing workspace returns nil"
    (mt/with-model-cleanup [:model/Workspace]
      (is (nil? (config/build-workspace-config Integer/MAX_VALUE))))))

(deftest build-workspace-config-forces-let-user-control-scheduling-false-test
  (testing "Non-stub database entries emit :let-user-control-scheduling false even if the source
            database had it true. The YAML carries :details only — not the schedule cron columns —
            so on import infer-db-schedules must take the auto-schedule branch instead of asserting
            on missing cache_field_values_schedule / metadata_sync_schedule."
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "User-Scheduled DW"
                    :engine  :postgres
                    :details {:host                        "h"
                              :port                        5432
                              :let-user-control-scheduling true}}
                   :model/Workspace {ws-id :id} {:name       "sched"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "ws_alice"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [own-db (->> (config/build-workspace-config ws-id)
                        :config
                        :databases
                        (remove (some-fn :is_stub :is_sample))
                        first)]
        (is (false? (get-in own-db [:details :let-user-control-scheduling])))))))

(deftest build-workspace-config-schemaless-engine-omits-filters-test
  (testing "MySQL (no schemas) omits schema-filters-*/dataset-filters-* entirely (the :else {} branch)"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "MySQL DW" :engine :mysql :details {:dbname "dw"}}
                   :model/Workspace {ws-id :id} {:name       "mysql-ws"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "ws_alice"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      ;; Select the MySQL entry explicitly rather than relying on `first` -- `:databases` also carries
      ;; stub/sample entries (e.g. a pre-existing Sample Database), so its ordering isn't something this
      ;; test should depend on.
      (let [details (->> (config/build-workspace-config ws-id) :config :databases
                         (u/seek #(= :mysql (:engine %)))
                         :details)]
        (is (nil? (:schema-filters-type details)))
        (is (nil? (:schema-filters-patterns details)))
        (is (nil? (:dataset-filters-type details)))
        (is (nil? (:dataset-filters-patterns details)))))))

(deftest build-workspace-config-emits-sample-database-test
  (testing "When a Sample Database exists in the instance, /config emits an entry with
            standardized name/engine, empty :details, and :is_sample true. The entry is
            distinct from stub entries and does not depend on the sample DB's actual
            stored name/engine."
    (mt/with-temp [:model/Database _sample      {:name      "Some Renamed Sample"
                                                 :engine    :h2
                                                 :details   {:db "real-sample-details"}
                                                 :is_sample true}
                   :model/Workspace {ws-id :id} {:name       "sample-emit-ws"
                                                 :creator_id (mt/user->id :crowberto)}]
      (let [cfg-dbs (-> (config/build-workspace-config ws-id) :config :databases)
            samples (filter :is_sample cfg-dbs)]
        (testing "exactly one sample entry is emitted"
          (is (= 1 (count samples))))
        (testing "sample entry uses standardized name/engine with empty :details"
          (is (= {:name      "Sample Database"
                  :engine    "h2"
                  :details   {}
                  :is_sample true}
                 (first samples))))
        (testing "sample entry is NOT also marked as a stub"
          (is (not (:is_stub (first samples)))))))))

(deftest build-workspace-config-drops-parent-auth-provider-test
  (testing "The parent's auth-provider properties stay out of the config: the workspace user authenticates by
            password, and the provider settings (which can carry a client secret) belong to the parent's identity."
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "Auth Provider DW"
                    :engine  :postgres
                    :details {:host                "h"
                              :port                5432
                              :use-auth-provider   true
                              :auth-provider       "oauth"
                              :oauth-token-url     "https://idp.example/token"
                              :oauth-token-headers "{\"client_secret\":\"s3cret\"}"}}
                   :model/Workspace {ws-id :id} {:name       "authp"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "ws_alice"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [details (->> (config/build-workspace-config ws-id)
                         :config
                         :databases
                         (remove (some-fn :is_stub :is_sample))
                         first
                         :details)]
        (is (= {:host "h" :port 5432 :user "u" :password "p"}
               (select-keys details [:host :port :user :password :use-auth-provider :auth-provider
                                     :oauth-token-url :oauth-token-headers :azure-managed-identity-client-id])))))))

;; Tagged so the driver jobs, which have the SQL Server driver on the classpath, run it; the Enterprise Tests job
;; doesn't, so there it would pass with no assertions. It needs no SQL Server.
(deftest ^:mb/driver-tests build-workspace-config-drops-parent-sqlserver-ad-login-test
  (when (workspaces.tu/driver-loadable? :sqlserver)
    (testing "A SQL Server parent on Azure AD auth: `:auth-mode` picks the login, so leaving it in the config would
              make the child connect as the parent's AD identity and ignore the workspace :user/:password. The
              config drops `:auth-mode` and every `ad-*` property, so the child falls back to SQL login."
      (doseq [[auth-mode ad-details]
              {"ad-service-principal"             {:ad-client-id     "parent-client-id"
                                                   :ad-client-secret "parent-client-secret"}
               "ad-service-principal-certificate" {:ad-client-id                        "parent-client-id"
                                                   :ad-client-certificate-options       "uploaded"
                                                   :ad-client-certificate-value         "parent-cert"
                                                   :ad-client-certificate-password-value "parent-cert-password"
                                                   :ad-client-key-options               "uploaded"
                                                   :ad-client-key-value                 "parent-key"
                                                   :ad-client-key-password-value        "parent-key-password"}
               "ad-managed-identity"              {:ad-managed-identity-client-id "parent-identity"}}]
        (testing auth-mode
          (mt/with-temp [:model/Database {db-id :id}
                         {:name    (str "MSSQL " auth-mode)
                          :engine  :sqlserver
                          :details (merge {:host "h" :db "AnalyticsDB" :auth-mode auth-mode} ad-details)}
                         :model/Workspace {ws-id :id} {:name       (str "mssql-" auth-mode)
                                                       :creator_id (mt/user->id :crowberto)}
                         :model/WorkspaceDatabase _
                         {:workspace_id     ws-id
                          :database_id      db-id
                          :database_details {:user "ws_user" :password "ws_password"}
                          :output_namespace "ws_alice"
                          :input_schemas    ["dbo"]
                          :status           :provisioned}]
            (let [details (->> (config/build-workspace-config ws-id)
                               :config
                               :databases
                               (u/seek #(= :sqlserver (:engine %)))
                               :details)]
              (is (= {:user "ws_user" :password "ws_password"}
                     (select-keys details [:user :password])))
              (is (not (contains? details :auth-mode)))
              (is (= [] (filterv #(str/starts-with? (name %) "ad-") (keys details)))))))))))

(defn- with-postgres-workspace
  "Run `f` with the ids of a Postgres database named \"Login DW\" with `details` and of a provisioned workspace over it."
  [details f]
  (mt/with-temp [:model/Database {db-id :id} {:name "Login DW" :engine :postgres :details details}
                 :model/Workspace {ws-id :id} {:name "logins" :creator_id (mt/user->id :crowberto)}
                 :model/WorkspaceDatabase _
                 {:workspace_id     ws-id :database_id db-id
                  :database_details {:user "iso" :password "iso-pass"}
                  :output_namespace "iso" :input_schemas ["public"] :status :provisioned}]
    (f db-id ws-id)))

(defn- login-dw-details [cfg]
  (->> cfg :config :databases (u/seek #(= "Login DW" (:name %))) :details))

(deftest build-workspace-config-additional-options-carry-no-parent-login-test
  (testing "control: JDBC options that carry no login ship as is"
    (with-postgres-workspace
      {:host "h" :port 5432 :user "parent_admin" :password "parent-pw"
       :additional-options "sslmode=require&tcpKeepAlive=true"}
      (fn [_db-id ws-id]
        (is (= {:user "iso" :password "iso-pass" :additional-options "sslmode=require&tcpKeepAlive=true"}
               (select-keys (login-dw-details (config/build-workspace-config ws-id))
                            [:user :password :additional-options]))))))
  (testing "control: option names that contain a credential word but name no credential ship as is"
    (doseq [additional-options ["passwordCharacterEncoding=UTF-8" "TokenType=ACCESS_TOKEN"]]
      (testing additional-options
        (with-postgres-workspace
          {:host "h" :port 5432 :additional-options additional-options}
          (fn [_db-id ws-id]
            (is (= additional-options
                   (:additional-options (login-dw-details (config/build-workspace-config ws-id))))))))))
  (testing "options that set the parent's login are a 422: pgjdbc lets them override the workspace login, and the
            config's holder would read them"
    (doseq [[additional-options option-name] {"user=parent_admin&password=parent-secret" "user"
                                              "?sslmode=require&PASSWORD=parent-secret"  "PASSWORD"
                                              "encrypt=true;sslpassword=parent-secret"   "sslpassword"
                                              ;; the ClickHouse driver percent-decodes option names
                                              "us%65r=parent_admin&pass%77ord=parent-pw" "user"
                                              "us%2565r=parent_admin"                    "user"
                                              ;; an encoded separator hides no name
                                              "x%26user=parent_admin"                    "user"
                                              "a=1%3Bpassword=x"                         "password"
                                              ;; a separator other than & or ;
                                              "a=b,user=parent_admin"                    "user"
                                              "us%25252525252565r=parent_admin"
                                              "an option percent-encoded more than 5 times"
                                              "ssl_key=/parent/key.pem"                  "ssl_key"
                                              ;; Redshift IAM: the credential word need not end the name
                                              "SecretAccessKey=parent-secret"            "SecretAccessKey"
                                              "Session-Token=parent-token"               "Session-Token"}]
      (testing additional-options
        (with-postgres-workspace
          {:host "h" :port 5432 :additional-options additional-options}
          (fn [db-id ws-id]
            (is (=? {:status-code 422 :database_id db-id}
                    (try
                      (config/build-workspace-config ws-id)
                      nil
                      (catch clojure.lang.ExceptionInfo e
                        (is (= (str "Database \"Login DW\" sets " option-name " in its additional JDBC connection "
                                    "options, which would give the workspace the parent's login. Remove it from the "
                                    "database's connection settings, or remove the database from the workspace.")
                               (ex-message e)))
                        (ex-data e)))))))))))

(deftest build-workspace-config-drops-azure-managed-identity-client-id-test
  (testing "the parent's Azure managed-identity client ID does not ship"
    (with-postgres-workspace
      {:host "h" :port 5432 :use-auth-provider true :auth-provider "azure-managed-identity"
       :azure-managed-identity-client-id "parent-mi-client"}
      (fn [db-id ws-id]
        (testing "precondition: the parent stores the client ID in :details"
          (is (= "parent-mi-client"
                 (:azure-managed-identity-client-id (t2/select-one-fn :details :model/Database :id db-id)))))
        (is (= {:host "h" :user "iso" :password "iso-pass"}
               (select-keys (login-dw-details (config/build-workspace-config ws-id))
                            [:host :user :password :use-auth-provider :auth-provider
                             :azure-managed-identity-client-id])))))))

(defn- build-or-refusal
  "The config built for workspace `ws-id`, or `{:refused <status code>}` when the build throws an `ex-info`."
  [ws-id]
  (try
    (config/build-workspace-config ws-id)
    (catch clojure.lang.ExceptionInfo e
      {:refused (:status-code (ex-data e))})))

(defn- cert-dw-details
  "The details of the \"Cert DW\" entry in `cfg`."
  [cfg]
  (->> cfg :config :databases (some #(when (= "Cert DW" (:name %)) (:details %)))))

(defn- refused-with-4xx? [out]
  (and (contains? out :refused) (int? (:refused out)) (<= 400 (:refused out) 499)))

(deftest build-workspace-config-does-not-ship-local-root-cert-file-test
  (let [^java.io.File f (doto (java.io.File/createTempFile "ws-config-not-a-cert" ".txt") .deleteOnExit)
        contents "MB_ENCRYPTION_SECRET_KEY=a-server-file-that-is-not-a-certificate"]
    (try
      (spit f contents)
      ;; A local-file root cert is refused on hosted instances, so run as self-hosted.
      (mt/with-premium-features #{}
        (testing "control: an uploaded root certificate ships"
          (with-cert-workspace
            {:host "h" :port 5432 :ssl true :ssl-mode "verify-full"
             :ssl-root-cert-options "uploaded" :ssl-root-cert-value "-----BEGIN CERTIFICATE-----\nMIIBroot\n-----END CERTIFICATE-----\n"}
            (fn [ws-id]
              (is (= "-----BEGIN CERTIFICATE-----\nMIIBroot\n-----END CERTIFICATE-----\n"
                     (:ssl-root-cert-value (cert-dw-details (build-or-refusal ws-id))))))))
        (testing "a root certificate given as a server file path is refused with a 4xx, or the file's contents stay out
                  of config.yml"
          (with-cert-workspace
            {:host "h" :port 5432 :ssl true :ssl-mode "verify-full"
             :ssl-root-cert-options "local" :ssl-root-cert-path (.getAbsolutePath f)}
            (fn [ws-id]
              (let [out (build-or-refusal ws-id)]
                (if (contains? out :refused)
                  (is (refused-with-4xx? out))
                  (is (not (str/includes? (config/config->yaml out) contents)))))))))
      (finally
        (.delete f)))))

(def ^:private test-ca-der-base64
  "A self-signed CA certificate, DER-encoded, as base64."
  (str "MIIDETCCAfmgAwIBAgIUFqWZGbB/KE16m1TSV8Wc+00vStYwDQYJKoZIhvcNAQELBQAwGDEWMBQGA1UEAwwNZzItYTItdGVzdC1j"
       "YTAeFw0yNjExMTAxNzI5NTVaFw0yNjEyMTAxNzI5NTVaMBgxFjAUBgNVBAMMDWcyLWEyLXRlc3QtY2EwggEiMA0GCSqGSIb3DQEB"
       "AQUAA4IBDwAwggEKAoIBAQClXeQd6bXudJz8Wy0HYyhWwtOdxOC0OV6CJKzfHp6PtJ4Wh3YE2wMNvNTH+CvIDSDImkTWD8sU/E8k"
       "hpjsY7UGRzMz7zbNXTptRHHhSdW6m/IDXg+tTnnd7pjUUbmXEye2Wgpy3whEKI/5DU3ic7vpYIYfH8pg08W7IyXpeUB7ZN7XqZLx"
       "5l+hP0IbdynJ8rz7ZYaMnvgZO63Mf8fxOeDGrlRPkV4XGbgOeUcsdPgtqfGXFTYPHtfe1jnsiaMOkx7PsHk6yKBF/FJVEzHVlj5d"
       "yBN06ZO6xNF2XOyI0iKILv58JKxlm/f6ip1e4JrXpxd/g2rkd4XrD2GF167dBcLZAgMBAAGjUzBRMB0GA1UdDgQWBBRDkLjmwQHD"
       "VUWglpPTo+WY2R6M7DAfBgNVHSMEGDAWgBRDkLjmwQHDVUWglpPTo+WY2R6M7DAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEB"
       "CwUAA4IBAQBq0QJFuefYk3mb4xcQlWnEF2vOIuF51NvtbBtZ6v3KvcswtBKRU06DtApbNSZ5x/nxftD9lcFkiUDBDRHTVD3SGZBN"
       "KSUPW/S2s3FuUjt0LrzYQtabD3EzEFQixSYM5lCt0DU/C0w58qwbN9tnS+qtMF8cNQYAaYcncWmW+Z8vPmlBKEdNS9bxnNojw3T0"
       "TyYlo6AKI1GO/4+SASxGj6BwjlpHJzTbE+57rQmDeLfYx0q2kfzPskGk/Xi3SZugdNz3nLDa54SjTozPYR/wfecRAAFAv8sOJX08"
       "Dt2pnA7ch53YExG7tI3OYums//cUPq0onKlwxoDpuiJZpEK86rJO"))

(def ^:private test-ca-pem
  "[[test-ca-der-base64]] as a PEM certificate."
  (str "-----BEGIN CERTIFICATE-----\n"
       (str/join "\n" (map str/join (partition-all 64 test-ca-der-base64)))
       "\n-----END CERTIFICATE-----\n"))

(defn- import-built-config!
  "Load the config built for `ws-id` through the sidecar's config-file import, rendered to YAML and parsed back as the
   sidecar reads config.yml at boot. Only the \"Cert DW\" entry is imported, renamed \"Cert DW sidecar\", so that in this
   one app DB it becomes a new Database rather than an update of the parent's. The connection check is stubbed.
   Returns the sidecar Database's details."
  [ws-id]
  (let [entry (->> (config/build-workspace-config ws-id) config/config->yaml yaml/parse-string
                   :config :databases (u/seek #(= "Cert DW" (:name %))))]
    (mt/with-premium-features #{:config-text-file}
      (mt/with-temporary-setting-values [config-from-file-sync-databases false]
        (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (constantly true)]
          (advanced-config.file/initialize! {:version 1
                                             :config  {:databases [(assoc entry :name "Cert DW sidecar")]}}
                                            {:expand-templates? true}))))
    (t2/select-one-fn :details :model/Database :name "Cert DW sidecar")))

(defn- secret-bytes ^bytes [secret-id]
  (:value (t2/select-one :model/Secret :id secret-id)))

(deftest root-cert-survives-config-file-import-test
  (testing "the sidecar's config-file import stores the inlined root certificate as a Secret of its own"
    (mt/with-model-cleanup [:model/Database :model/Secret]
      (with-cert-workspace
        {:host "h" :port 5432 :ssl true :ssl-mode "verify-full"
         :ssl-root-cert-options "uploaded" :ssl-root-cert-value test-ca-pem}
        (fn [ws-id]
          (let [parent-id (:ssl-root-cert-id (t2/select-one-fn :details :model/Database :name "Cert DW"))
                child-id  (:ssl-root-cert-id (import-built-config! ws-id))]
            (testing "precondition: the parent stores the certificate as a Secret"
              (is (int? parent-id)))
            (testing "the sidecar's Secret is not the parent's: in one app DB the parent's id would also resolve"
              (is (int? child-id))
              (is (not= parent-id child-id)))
            (is (= test-ca-pem (u/bytes-to-string (secret-bytes child-id))))))))))

(deftest der-root-cert-survives-config-file-import-test
  (testing "a DER root certificate reaches the sidecar's Secret byte for byte"
    (mt/with-model-cleanup [:model/Database :model/Secret]
      (let [^bytes der (u/decode-base64-to-bytes test-ca-der-base64)]
        (with-cert-workspace
          {:host "h" :port 5432 :ssl true :ssl-mode "verify-full"
           :ssl-root-cert-options "uploaded"
           :ssl-root-cert-value   (str "data:application/octet-stream;base64," test-ca-der-base64)}
          (fn [ws-id]
            (let [parent-id (:ssl-root-cert-id (t2/select-one-fn :details :model/Database :name "Cert DW"))
                  child-id  (:ssl-root-cert-id (import-built-config! ws-id))]
              (testing "precondition: the parent's Secret holds the DER bytes"
                (is (java.util.Arrays/equals der (secret-bytes parent-id))))
              (is (int? child-id))
              (is (not= parent-id child-id))
              (let [stored (secret-bytes child-id)]
                (is (= (alength der) (some-> stored alength)))
                (is (java.util.Arrays/equals der stored))))))))))

(deftest build-workspace-config-client-auth-flag-without-ssl-is-not-refused-test
  (testing "a leftover :ssl-use-client-auth with :ssl off does not refuse the config"
    (with-cert-workspace
      {:host "h" :port 5432 :ssl false :ssl-use-client-auth true}
      (fn [ws-id]
        (is (= {:host "h" :ssl false}
               (select-keys (cert-dw-details (config/build-workspace-config ws-id)) [:host :ssl])))))))
