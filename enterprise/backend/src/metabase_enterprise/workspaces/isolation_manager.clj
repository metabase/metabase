(ns metabase-enterprise.workspaces.isolation-manager
  "A namespace that will manage database isolation. Will operate on database connection details compatible with
  clojure.java.jdbc. The goal is that satisfy a high level goal of creating an isolated workspace in a database that
  an LLM agent can have read/write access to. This space will be adjacent to data in the rest of the database but
  isolated to it. We must create three things:

  1. a schema (for postgres, snowflake, redshift) or a database (for clickhouse) where data can be ETL'd into. The
  schema should have some pattern to it that includes some identifying information of the workspace, and also a prefix
  so that Metabase knows now to index or sync this schema. It must be very bespoke and at extremely low risk of being
  confused with real customer data. The schema/database will have the following naming converion:

             mb__isolation_7748c_test_workspace_123
             |-----------| |---| |----------------|
                  †         ††         †††

  † mb__isolation: common prefix to all workspace instances. Indicates that metabase owns this and we can sync or not
  as we like

  †† 7748c: derived from instance-uuid. On my instance `7f43c806-7ef1-4308-8fab-cb41b177db91`
                                                        7        7    4    8    c
     Let's an instance know if this isolation unit was created by this instance or not.

  ††† test_workspace_123: a mapping that should tie back to a workspace in some manner. This is largely opaque but
  should indicate uniquely back to a workspace on this instance.

  2. a user with read privileges to the original data and write access to the new schema

  3. a user with read/write privileges _SOLELY_ to the new schema

  The goal is to end up with a scratchpad that an llm agent can issue queries against, but also create tables. It is
  meant to be a sandbox that is granted data for the LLM to consider.

  The public api is
  create-isolation(driver, connection-details, workspace-id)

  delete-isolation(driver, connection-details, workspace-id, [isolation-info])
  Isolation info is optional but nice to have. The isolation mechanism should be deterministic from the connection
  details and worksapce-id.

  It is expected that a workspace can use databases it knows about to create isolations for it's work."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- instance-uuid-slug
  "Create a slug from the site UUID, taking the first character of each section."
  [site-uuid-string]
  (apply str (map first (str/split site-uuid-string #"-"))))

(defn- isolation-schema-name
  "Generate schema/database name for workspace isolation following mb__isolation_<slug>_<workspace-id> pattern."
  [workspace-id]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str workspace-id) #"[^a-zA-Z0-9]" "_")]
    (format "mb__isolation_%s_%s" instance-slug clean-workspace-id)))

(defn- isolation-user-name
  "Generate username for workspace isolation."
  [workspace-id user-type]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str workspace-id) #"[^a-zA-Z0-9]" "_")]
    (format "mb_iso_%s_%s_%s" instance-slug clean-workspace-id (name user-type))))

(mr/def ::rule :string)
(mr/def ::options :map)
(mr/def ::steps
  [:cat :keyword ::options [:* [:alt [:schema [:ref ::steps]] ::rule]]])

(defmulti ^:private create-isolation*
  "Create database isolation for a workspace."
  (fn [driver workspace] driver))

;; todo: use (jdbc/metadata-result (.getSchemas metadata))

(mu/defn- postgres-steps :- ::steps
  "Return postgres steps."
  [{:keys [populator reader schema-name]}]
  [:schema
   {}
   (format "CREATE SCHEMA %s" schema-name)
   [:users
    {}
    ;; Create populator user with random password
    [:populator
     {}
     (format "CREATE USER %s WITH PASSWORD '%s'" (:user populator) (:password populator))
     [:populator-privileges
      {}
      ;; Grant privileges to populator user

      ;; source data hardcorded to public: FIX
      (format "GRANT USAGE ON SCHEMA %s TO %s" "public" (:user populator))
      ;; todo: don't hardcode this to public
      (format "GRANT USAGE ON SCHEMA public TO %s" (:user populator))

      (format "GRANT USAGE ON SCHEMA %s TO %s" schema-name (:user populator))
      (format "GRANT SELECT ON ALL TABLES IN SCHEMA %s TO %s" "public" (:user populator))
      (format "GRANT CREATE ON SCHEMA %s TO %s" schema-name (:user populator))
      (format "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %s TO %s"
              schema-name (:user populator))]]
    [:reader
     {}
     ;; Create reader user with random password
     (format "CREATE USER %s WITH PASSWORD '%s'" (:user reader) (:password reader))
     [:reader-privileges
      {}
      ;; Grant privileges to reader user
      (format "GRANT USAGE ON SCHEMA %s TO %s" schema-name (:user reader))
      (format "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %s TO %s"
              schema-name (:user reader))]]]])


(comment
  (postgres-steps {:populator {:user "populator" :password "populator-pw"}
                   :reader {:user "reader" :password "reader-pw"}
                   :schema-name "scratchpad"})
  (malli.core/validate ::steps
                       (postgres-steps {:populator {:user "populator" :password "populator-pw"}
                                        :reader {:user "reader" :password "reader-pw"}
                                        :schema-name "scratchpad"}))
  )

(mu/defn evaluate-steps
  [steps :- ::steps f]
  ;; todo: put options onto each rule using options from the tree?  todo: how do i want to do that? making each leaf
  ;; more complicated, or have a stack of frames? lets do a proper interpreter that can have stack frames. can get
  ;; parent tree rule in this manner
  (letfn [(subtree? [rule] (vector? rule))]
    (loop [process (into [] (reverse (nthrest steps 2)))
           acc     [[:tree (first steps)]]
           state   :running]
      (let [rule (peek process)]
        ;; done
        (cond (not (seq process))
              [acc state]

              ;; scoot through
              (= state :error)
              (let [info (if (vector? rule)
                           [:skipping-tree (first rule)]
                           [:skipping-step rule])]
                (recur (pop process) (conj acc info) state))

              ;; hit a tree node
              (subtree? rule)
              ;; todo: include options onto each rule from the rule?
              (let [[tree-name _options & sub-rules] rule]
                (recur (into (pop process) (reverse sub-rules))
                       (conj acc [:tree tree-name])
                       state))
              :else
              (let [[status _response :as result] (f rule)]
                (when-not (#{:error :success} status)
                  (throw (ex-info "Bad status from rule" {:rule rule :result result})))
                (recur (pop process)
                       (conj acc result)
                       (case status :success state :error :error))))))))

#_(mu/defn evaluate-steps
  [steps :- ::steps f]
  (reduce (fn [[acc running-state] rule]
            ;; don't continue and prune space
            (cond (= running-state :error)
                  (let [info (if (vector? rule)
                               [:skipping-tree (first rule)]
                               [:skipping-step rule])]
                    [(conj acc info) running-state])

                  ;; recursive rule. if here we are running
                  (vector? rule)
                  (let [[result running-state] (evaluate-steps rule f)]
                    [(into acc result) running-state])


                  :else
                  (let [[status _response :as result] (f rule)]
                    [(conj acc result)
                     (if (= status :error) :error running-state)])))
          [[[:tree (first steps)]] :running]
          (drop 2 steps)))

(comment
  (evaluate-steps (postgres-steps {:populator {:user "populator" :password "populator-pw"}
                                   :reader {:user "reader" :password "reader-pw"}
                                   :schema-name "scratchpad"})
                  (fn [step] (if (= 0 (rand-int 10))
                               [:error (format "error during: %s" step)]
                               [:success (format "performed: %s" step)])))

  (evaluate-steps [:schema
                   {}
                   "CREATE SCHEMA scratchpad"
                   [:users
                    {}
                    [:populator
                     {}
                     "CREATE USER populator WITH PASSWORD 'populator-pw'"
                     [:populator-privileges
                      {}
                      "GRANT USAGE ON SCHEMA public TO populator"
                      "GRANT USAGE ON SCHEMA scratchpad TO populator"
                      ]]
                    [:reader
                     {}
                     "CREATE USER reader WITH PASSWORD 'reader-pw'"
                     [:reader-privileges
                      {}
                      "GRANT USAGE ON SCHEMA scratchpad TO reader"]]]]
                  (fn [step] (if (= 0 (rand-int 10))
                               [:error (format "error during: %s" step)]
                               [:success (format "performed: %s" step)]))))



(defmethod create-isolation* :postgres
  [_driver {:keys [id connection-details]}]
  (let [schema-name (isolation-schema-name id)
        populator {:user (isolation-user-name id :populator)
                   :password (str (random-uuid))}
        reader {:user (isolation-user-name id :reader)
                :password (str (random-uuid))}
        jdbc-spec (sql-jdbc.conn/connection-details->spec :postgres connection-details)
        steps (postgres-steps {:populator populator
                               :reader reader
                               :schema-name schema-name})]
    (jdbc/with-db-transaction [tx jdbc-spec]
      ;; Create schema

      (let [results (evaluate-steps steps (fn [sql]
                                            (try [:success
                                                  sql
                                                  (jdbc/execute! tx [sql])]
                                                 (catch Exception e
                                                   [:error sql (ex-message e)]))))]
        ;; Return isolation info
        {:isolation-type :schema
         :schema-name schema-name
         :populator populator
         :reader reader
         :results results}))))

;; todo: create an evaluator of steps. steps will perhaps for a dag, preconditions, checks, failures. ideally a test
;; would have a list of all steps, randomly execute one, and then execute all steps and ensure that we can proceed to
;; the end. ie, any particular step tha tis already satisfied (schema already exists, user already exists) is ok and
;; we can carry on.

(mu/defn- clickhouse-steps :- ::steps
  [{:keys [populator reader database-name source-database-name]}]
  (letfn [(q [d]
            (try
              (sql.u/quote-name :clickhouse :database (ddl.i/format-name :clickhouse d))
              (catch Exception e
                (log/errorf e "Error quoting %s" (pr-str d))
                (throw e))))]
    [:database
     {}
     (format "CREATE DATABASE %s" (q database-name))
     [:users
      {}
      [:populator
       {}
       (format "CREATE USER %s IDENTIFIED WITH sha256_password BY '%s'"
               (:user populator) (:password populator))
       [:populator-privileges
        {}
        (format "GRANT SELECT ON %s.* TO %s" (q source-database-name)  (:user populator))
        (format "GRANT CREATE ON %s.* TO %s" (q database-name) (:user populator))
        (format "GRANT INSERT ON %s.* TO %s" (q database-name) (:user populator))
        (format "GRANT SELECT ON %s.* TO %s" (q database-name) (:user populator))
        (format "GRANT DROP ON %s.* TO %s" (q database-name) (:user populator))
        (format "GRANT SHOW DATABASES ON *.* TO %s" (:user populator))]]
      [:reader
       {}
       (format "CREATE USER %s IDENTIFIED WITH sha256_password BY '%s'"
               (:user reader) (:password reader))
       [:reader-privileges
        {}
        (format "GRANT CREATE ON %s.* TO %s" (q database-name) (:user reader))
        (format "GRANT INSERT ON %s.* TO %s" (q database-name) (:user reader))
        (format "GRANT DROP ON %s.* TO %s" (q database-name) (:user reader))
        (format "GRANT SELECT ON %s.* TO %s" (q database-name) (:user reader))]]]]))

(comment
  (malli.core/validate ::steps
                       (clickhouse-steps {:populator {:user "populator" :password "populator-pw"}
                                          :reader {:user "reader" :password "reader-pw"}
                                          :database-name "scratchpad"
                                          :source-database-name "foo"}))
  )

(defmethod create-isolation* :clickhouse
  [_driver {:keys [id connection-details]}]
  (let [database-name (isolation-schema-name id)
        populator {:user (isolation-user-name id :populator) :password (str (random-uuid))}
        reader {:user (isolation-user-name id :reader) :password (str (random-uuid))}
        jdbc-spec (sql-jdbc.conn/connection-details->spec :clickhouse connection-details)
        steps (clickhouse-steps {:populator populator :reader reader :database-name database-name
                                 :source-database-name ((some-fn :db :dbname) connection-details)})]

    (jdbc/with-db-transaction [tx jdbc-spec]
      (let [results (evaluate-steps steps (fn [sql]
                                            (try [:success sql (jdbc/execute! tx [sql])]
                                                 (catch Exception e
                                                   [:error sql (ex-message e)]))))]
        {:isolation-type :database
         :database-name database-name
         :populator populator
         :reader reader
         :results results}))))

(comment

  ;; future work to check for existing schemas
  (let [metadata (.getMetaData (:connection tx))]
    (let [schemas (into [] (map :table_schem) (jdbc/result-set-seq (.getSchemas metadata)))]
      (tap> {:schemas schemas
             :isolations (filter #(String/.startsWith % "mb__isolation_") schemas)
             :our-isolations (filter #(String/.startsWith % "mb__isolation_7748c") schemas)
             :already-exists? (some #{schema-name} schemas)
             :driver _driver})))
  (def workspace {:connection-details (:details (toucan2.core/select-one :model/Database :id 19))
                  :id "workspace_manual_01"})
  ;; we're a bit sloppy with db vs dbname?
  ((some-fn :db :dbname) (:details (toucan2.core/select-one :model/Database :id 19)))
  (let [workspace-id "workspace_manual_01"
        connection-details {:scan-all-databases false, :ssl false, :password "password", :destination-database false,
                            :port 8123, :advanced-options false, :dbname "sales_data", :host "localhost",
                            :tunnel-enabled false, :user "default"}]
    (create-isolation :clickhouse (:connection-details workspace) workspace-id))

  {:isolation-type :database,
   :database-name "mb__isolation_7748c_workspace_manual_01",
   :populator {:user "mb_iso_7748c_workspace_manual_01_populator",
               :password "9d8285d5-94c3-4e87-a98a-1c47c9fb727b"},
   :reader {:user "mb_iso_7748c_workspace_manual_01_reader",
            :password "57e6ba7e-ff76-49e6-a743-f6277ea8fada"}}


  (delete-isolation :clickhouse (:connection-details workspace) (:id workspace))
  {:deleted-database "mb__isolation_7748c_workspace_manual_01",
   :deleted-users ["mb_iso_7748c_workspace_manual_01_populator"
                   "mb_iso_7748c_workspace_manual_01_reader"]}
  )

(defn create-isolation
  "Create database isolation for a single database.

  Creates an isolated environment in the specified database where LLM agents can operate safely.
  The isolation includes:
  - A schema (PostgreSQL) or database (ClickHouse) with workspace-specific naming
  - A populator user with read access to original data + write access to isolated area
  - A reader user with read/write access ONLY to the isolated area

  Args:
    engine             - Database engine keyword (:postgres, :clickhouse, etc.)
    connection-details - Database connection details (compatible with Metabase format)
    workspace-id       - Unique workspace identifier for naming isolation resources

  Returns:
    Map containing isolation details:
      :schema-name/:database-name - Name of created isolation area
      :populator                  - map with user and password for populator (read original +
                                    write isolated)
      :reader                     - map with user and passwrod for reader (read/write
                                    isolated only)

  Example:
    (create-isolation :postgres db-connection-details \"workspace-123\")
       ;; postgres isolations by schema
       {:isolation-type :schema
        :schema-name    \"mb__isolation_7748c_test_workspace_123\"
        :populator      {:user \"mb_iso_7748c_test_workspace_123_populator\"
                         :password \"d632f61c-398a-467d-856c-d8411665bd0f\"}
        :reader         {:user \"mb_iso_7748c_test_workspace_123_reader\"
                         :password \"4a21a094-cf0a-479d-a429-ca8edeb1f3df\"}}

       ;; clickhouse isolates by database
      {:isolation-type :database
       :database-name  \"mb__isolation_7748c_testing_workspace216479\"
       :populator      {:user     \"mb_iso_7748c_testing_workspace216479_populator\"
                        :password \"a9445a75-621f-4211-82e1-9f96ee797dd6\"}
       :reader         {:user     \"mb_iso_7748c_testing_workspace216479_reader\"
                        :password \"5106f7f8-ed70-44db-889d-9e314debe020\"}}"
  [engine connection-details workspace-id]
  (create-isolation* engine {:id workspace-id :connection-details connection-details}))

(defmulti ^:private delete-isolation*
  "Delete database isolation for a workspace. This is deliberately not public. Use `delete-isolation` as an entrypoint."
  (fn [driver workspace] driver))

(defmethod delete-isolation* :postgres
  [_driver {:keys [id connection-details isolation-info]}]
  (let [schema-name (or (:schema-name isolation-info)
                        (isolation-schema-name id))
        populator-user (or (-> isolation-info :populator :user)
                           (isolation-user-name id :populator))
        reader-user (or (-> isolation-info :reader :user)
                        (isolation-user-name id :reader))
        jdbc-spec (sql-jdbc.conn/connection-details->spec :postgres connection-details)
        teardown-steps [:remove-user
                        {::continue-on-error? true}
                        [:remove-privileges
                         {}
                         (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN  SCHEMA %s FROM %s" "public" populator-user)
                         (format "REVOKE ALL PRIVILEGES ON SCHEMA %s FROM %s" "public" populator-user)]
                        [:remove-new-schema
                         {}
                         ;; Drop schema (CASCADE to drop all objects in it).
                         (format "DROP SCHEMA IF EXISTS %s CASCADE" schema-name)]
                        [:drop-user
                         {}
                         ;; Drop users
                         (format "DROP USER IF EXISTS %s" populator-user)
                         (format "DROP USER IF EXISTS %s" reader-user)]]]
    (jdbc/with-db-transaction [tx jdbc-spec]
      (let [results (evaluate-steps teardown-steps (fn [sql]
                                                     (try [:success sql (jdbc/execute! tx [sql])]
                                                          (catch Exception e
                                                            [:error sql (ex-message e)]))))]
        {:deleted-schema schema-name
         :deleted-users [populator-user reader-user]}))))

(defmethod delete-isolation* :clickhouse
  [_driver {:keys [id connection-details isolation-info]}]
  (let [database-name (or (:database-name isolation-info)
                          (isolation-schema-name id))
        populator-user (or (-> isolation-info :populator :user)
                           (isolation-user-name id :populator))
        reader-user (or (-> isolation-info :reader :user)
                        (isolation-user-name id :reader))
        jdbc-spec (sql-jdbc.conn/connection-details->spec :clickhouse connection-details)]
    (jdbc/with-db-transaction [tx jdbc-spec]
      ;; Drop database
      (jdbc/execute! tx [(format "DROP DATABASE IF EXISTS %s" database-name)])

      ;; Drop users
      (jdbc/execute! tx [(format "DROP USER IF EXISTS %s" populator-user)])
      (jdbc/execute! tx [(format "DROP USER IF EXISTS %s" reader-user)])

      {:deleted-database database-name
       :deleted-users [populator-user reader-user]})))

(defn delete-isolation
  "Delete database isolation for a single database.

  Cleans up all isolation resources created for the specified database:
  - Drops the isolated schema/database
  - Drops the created users (populator and reader)
  - Revokes any granted privileges

  Args:
    engine             - Database engine keyword (:postgres, :clickhouse, etc.)
    connection-details - Database connection details (compatible with Metabase format)
    workspace-id       - Unique workspace identifier used when creating isolation
    isolation-info     - (Optional) Result from create-isolation for more efficient cleanup

  Returns:
    Map containing cleanup details:
      :deleted-schema/:deleted-database - Name of dropped isolation area
      :deleted-users                   - List of dropped usernames

  Example:
    (delete-isolation :postgres db-connection-details \"workspace-123\" isolation-result)"
  ([engine connection-details workspace-id]
   (delete-isolation* engine {:id workspace-id :connection-details connection-details}))
  ([engine connection-details workspace-id isolation-info]
   (delete-isolation* engine {:id workspace-id
                              :connection-details connection-details
                              :isolation-info isolation-info})))
