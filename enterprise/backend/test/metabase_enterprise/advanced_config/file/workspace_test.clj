(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- unlock! []
  (reset! @#'ws/locked-by-config-file? false))

(defmacro ^:private with-clean-workspace! [& body]
  `(binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
     (mt/with-premium-features #{:config-text-file :workspaces}
       (mt/with-temporary-setting-values [~'instance-workspace nil]
         (mt/with-model-cleanup [:model/TableRemapping]
           (try
             ~@body
             (finally
               (unlock!))))))))

(defn- workspace-section
  "The `workspace:` section as YAML parsing reads it: keyword keys."
  [database-name]
  {:name      "orders-cleanup"
   :databases {(keyword database-name) {:schemas {:sales   "mb__isolation_k3f9q2xa_s42_sales"
                                                  :finance "mb__isolation_k3f9q2xa_s43_finance"}}}})

(defn- workspace-instance [database-name]
  {:name      "orders-cleanup"
   :databases {database-name {:schemas {"sales"   "mb__isolation_k3f9q2xa_s42_sales"
                                        "finance" "mb__isolation_k3f9q2xa_s43_finance"}}}})

(deftest workspace-section-installs-and-locks-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (is (= :ok (advanced-config.file/initialize! {:version 1
                                                    :config  {:workspace (workspace-section db-name)}})))
      (testing "the workspace is installed with string database and schema names"
        (is (= (workspace-instance db-name) (ws/instance-workspace)))
        (is (true? (ws/workspace-mode?))))
      (testing "GET /current says the API can't change it"
        (is (=? {:data {:name "orders-cleanup"}, :can_write false}
                (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))
      (testing "POST and DELETE /current are refused"
        (is (= "This instance's workspace is locked by config.yml and can't be changed through the API."
               (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                     (workspace-instance db-name))))
        (is (= "This instance's workspace is locked by config.yml and can't be changed through the API."
               (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current")))
        (is (= (workspace-instance db-name) (ws/instance-workspace)))))))

(deftest workspace-section-runs-after-databases-test
  (testing "the workspace section names databases the databases section creates, so it goes last whatever the file order"
    (is (= [:settings :users :databases :workspace]
           (map first (#'advanced-config.file/sort-by-initialization-order
                       [[:workspace {}] [:users {}] [:settings {}] [:databases {}]]))))))

(deftest workspace-section-errors-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (testing "a section that fails its spec"
        (doseq [section [{:databases {(keyword db-name) {:schemas {:sales "s"}}}}
                         {:name "w", :databases {}}
                         {:name "w", :databases {(keyword db-name) {:schemas {}}}}
                         {:name "w", :databases {(keyword db-name) {:schemas {:sales ""}}}}]]
          (is (thrown? Exception
                       (advanced-config.file/initialize! {:version 1, :config {:workspace section}})))))
      (testing "a database name that matches no database"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No database is named \"nope\""
                              (advanced-config.file/initialize! {:version 1
                                                                 :config  {:workspace (workspace-section "nope")}}))))
      (testing "two main schemas sent to one scratch namespace"
        (is (thrown? Exception
                     (advanced-config.file/initialize!
                      {:version 1
                       :config  {:workspace {:name      "w"
                                             :databases {(keyword db-name) {:schemas {:sales "x", :finance "x"}}}}}}))))
      (testing "a refused section installs nothing and does not lock"
        (is (nil? (ws/instance-workspace)))
        (is (false? (ws/workspace-locked?)))))))

(deftest workspace-section-needs-config-text-file-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (mt/with-premium-features #{:workspaces}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #":config-text-file"
                              (advanced-config.file/initialize! {:version 1
                                                                 :config  {:workspace (workspace-section db-name)}}))))
      (is (nil? (ws/instance-workspace)))
      (is (zero? (t2/count :model/TableRemapping))))))

;;; ------------------------------------- POST /api/ee/workspace-instance/config -------------------------------------

(def ^:private password "s3cr3t-workspace-password")

(defn- config-yml
  "A config.yml as `GET /api/ee/workspace-manager/:id/connection?format=yaml` serves it."
  [database-name]
  (str "version: 1\n"
       "config:\n"
       "  databases:\n"
       "    - name: " database-name "\n"
       "      engine: postgres\n"
       "      details:\n"
       "        host: warehouse.example.com\n"
       "        port: 5432\n"
       "        dbname: analytics\n"
       "        user: mb__isolation_k3f9q2xa\n"
       "        password: \"" password "\"\n"
       "        schema-filters-type: inclusion\n"
       "        schema-filters-patterns: \"sales,finance,mb__isolation_k3f9q2xa_*\"\n"
       "  workspace:\n"
       "    name: orders-cleanup\n"
       "    databases:\n"
       "      " database-name ":\n"
       "        schemas:\n"
       "          sales: mb__isolation_k3f9q2xa_s42_sales\n"
       "          finance: mb__isolation_k3f9q2xa_s43_finance\n"))

(defmacro ^:private with-fake-warehouse!
  "No warehouse answers in these tests: the connection test passes, and nothing syncs."
  [& body]
  `(mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (constantly true)]
     (mt/with-temporary-setting-values [~'config-from-file-sync-databases false]
       ~@body)))

(defn- state
  "What applying a config.yml leaves behind: the database, the installed workspace and whether the API may change it."
  [database-name]
  {:database  (t2/select-one [:model/Database :engine :details] :name database-name)
   :workspace (ws/instance-workspace)
   :current   (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")
   :post      (mt/user-http-request :crowberto :post "ee/workspace-instance/current" (workspace-instance database-name))
   :delete    (mt/user-http-request :crowberto :delete "ee/workspace-instance/current")})

(defn- applied-at-boot! [database-name]
  (try
    (advanced-config.file/initialize! (yaml/parse-string (config-yml database-name)) {:expand-templates? true})
    (state database-name)
    (finally
      (t2/delete! :model/Database :name database-name)
      (ws/clear-instance-workspace!)
      (unlock!))))

(defn- applied-over-http! [database-name]
  (try
    (let [response (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/config"
                                         {:config (config-yml database-name)})]
      (assoc (state database-name) :response response))
    (finally
      (t2/delete! :model/Database :name database-name)
      (ws/clear-instance-workspace!)
      (unlock!))))

(deftest same-config-yml-through-both-paths-test
  (with-clean-workspace!
    (with-fake-warehouse!
      (let [database-name (mt/random-name)
            boot          (applied-at-boot! database-name)
            http          (applied-over-http! database-name)]
        (testing "the same database details"
          (is (=? {:engine  :postgres
                   :details {:host "warehouse.example.com", :user "mb__isolation_k3f9q2xa", :password password
                             :schema-filters-patterns "sales,finance,mb__isolation_k3f9q2xa_*"}}
                  (:database boot)))
          (is (= (:database boot) (:database http))))
        (testing "the same workspace map"
          (is (= (workspace-instance database-name) (:workspace boot) (:workspace http))))
        (testing "the same lock: POST and DELETE /current are refused after either path"
          (is (false? (get-in boot [:current :can_write])))
          (is (= "This instance's workspace is locked by config.yml and can't be changed through the API."
                 (:post boot) (:delete boot)))
          (is (= (select-keys boot [:current :post :delete])
                 (select-keys http [:current :post :delete]))))
        (testing "the response is the GET /current shape"
          (is (= (:current http) (:response http))))))))

(deftest http-apply-errors-test
  (with-clean-workspace!
    (with-fake-warehouse!
      (let [database-name (mt/random-name)
            post!         (fn [config-yml]
                            (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/config" {:config config-yml}))]
        (testing "YAML that does not parse"
          (is (= "This config.yml is not valid YAML."
                 (post! (str (config-yml database-name) "  bad: [\n")))))
        (testing "a section the boot loader does not know"
          (is (= "This config.yml has sections Metabase does not know: nonsense."
                 (post! (str (config-yml database-name) "  nonsense: 1\n")))))
        (testing "a section that fails its spec; the error names the path, not the values"
          (let [message (post! (str/replace (config-yml database-name) "      engine: postgres\n"
                                            "      engine: 1\n"))]
            (is (re-find #"databases section .* not valid at \[0" message))
            (is (not (re-find (re-pattern password) message)))))
        (testing "a connection test that fails, with the password in its message, is scrubbed"
          (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (fn [_ _ _] (throw (ex-info (str "bad login " password) {:password password})))]
            (let [message (post! (config-yml database-name))]
              (is (= "Could not apply the databases section of this config.yml: bad login ****" message))
              (is (not (re-find (re-pattern password) message))))))
        (testing "a workspace map that sends two main schemas to one scratch namespace"
          (is (re-find #"its own scratch namespace"
                       (post! (str/replace (config-yml database-name) "mb__isolation_k3f9q2xa_s43_finance"
                                           "mb__isolation_k3f9q2xa_s42_sales")))))
        (testing "nothing was applied"
          (is (nil? (ws/instance-workspace)))
          (is (zero? (t2/count :model/Database :name database-name))))
        (testing "MB_INSTANCE_WORKSPACE locks this endpoint"
          (mt/with-temp-env-var-value! [:mb-instance-workspace "{}"]
            (is (re-find #"MB_INSTANCE_WORKSPACE" (post! (config-yml database-name))))))))))

(deftest http-apply-replaces-a-config-yml-workspace-test
  (testing "a workspace a config.yml set, at boot or here, may be replaced here, as a boot with the new file would"
    (with-clean-workspace!
      (with-fake-warehouse!
        (mt/with-temp [:model/Database {booted :name} {:name (mt/random-name), :engine :postgres}]
          (let [database-name (mt/random-name)]
            (try
              (advanced-config.file/initialize! {:version 1, :config {:workspace (workspace-section booted)}})
              (is (= (workspace-instance booted) (ws/instance-workspace)))
              (doseq [schemas [{"sales" "mb__isolation_k3f9q2xa_s42_sales", "finance" "mb__isolation_k3f9q2xa_s43_finance"}
                               {"sales" "mb__isolation_k3f9q2xa_s42_sales"}]]
                (is (=? {:data      {:databases {(keyword database-name) {:schemas (update-keys schemas keyword)}}}
                         :can_write false}
                        (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/config"
                                              {:config (cond-> (config-yml database-name)
                                                         (= 1 (count schemas))
                                                         (str/replace "          finance: mb__isolation_k3f9q2xa_s43_finance\n" ""))}))))
              (is (= {"sales" "mb__isolation_k3f9q2xa_s42_sales"}
                     (get-in (ws/instance-workspace) [:databases database-name :schemas])))
              (finally
                (t2/delete! :model/Database :name database-name)))))))))

(deftest http-apply-permissions-test
  (with-clean-workspace!
    (mt/user-http-request :rasta :post 403 "ee/workspace-instance/config" {:config "version: 1"})
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/workspace-instance/config" {:config "version: 1"}))))

(deftest http-apply-takes-every-boot-section-test
  (testing "every section the boot loader takes is applied, through the boot loader's section code (MBCWS-43 revisits this)"
    (with-clean-workspace!
      (with-fake-warehouse!
        (let [database-name (mt/random-name)
              email         (str (mt/random-name) "@example.com")]
          (try
            (let [response (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/config"
                                                 {:config (str (config-yml database-name)
                                                               "  users:\n"
                                                               "    - first_name: Ci\n"
                                                               "      last_name: Bot\n"
                                                               "      email: " email "\n"
                                                               "      password: \"" password "-user\"\n")})]
              (is (=? {:data {:name "orders-cleanup"}, :can_write false} response)))
            (is (t2/exists? :model/User :email email))
            (is (t2/exists? :model/Database :name database-name))
            (finally
              (t2/delete! :model/User :email email)
              (t2/delete! :model/Database :name database-name))))))))

(deftest http-apply-does-not-expand-templates-test
  (testing "{{env ...}} templates would read this instance's environment, so they are applied as written"
    (with-clean-workspace!
      (with-fake-warehouse!
        (let [database-name (mt/random-name)]
          (try
            (mt/with-temp-env-var-value! [:mbcws-24-template "expanded"]
              (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/config"
                                    {:config (str/replace (config-yml database-name) "dbname: analytics"
                                                          "dbname: \"{{env MBCWS_24_TEMPLATE}}\"")}))
            (is (= "{{env MBCWS_24_TEMPLATE}}"
                   (get-in (t2/select-one :model/Database :name database-name) [:details :dbname])))
            (finally
              (t2/delete! :model/Database :name database-name))))))))

;;; ------------------------------------------------ Review round 1 ------------------------------------------------

(deftest http-apply-is-all-or-nothing-test
  (with-clean-workspace!
    (with-fake-warehouse!
      (let [database-name (mt/random-name)
            other-name    (mt/random-name)
            post          (fn [config-yml]
                            (mt/user-http-request :crowberto :post "ee/workspace-instance/config" {:config config-yml}))]
        (try
          (testing "a workspace naming a database that neither exists nor is in the file: nothing is created"
            (is (= "No database is named \"nope\", here or in this config.yml."
                   (post (str/replace (config-yml database-name) (str "      " database-name ":\n") "      nope:\n"))))
            (is (not (t2/exists? :model/Database :name database-name)))
            (is (nil? (ws/instance-workspace))))
          (testing "a section that fails while applying rolls back the sections before it"
            (is (re-find #"Could not apply the api-keys section"
                         (post (str (config-yml database-name)
                                    "  api-keys:\n"
                                    "    - name: k\n"
                                    "      key: mb_" (apply str (repeat 40 "a")) "\n"
                                    "      creator: nobody@example.com\n"
                                    "      group: admin\n"))))
            (is (not (t2/exists? :model/Database :name database-name)))
            (is (nil? (ws/instance-workspace))))
          (testing "a locked re-apply whose workspace section fails keeps the workspace, the lock and the databases as they were"
            (is (=? {:can_write false} (post (config-yml database-name))))
            (let [before (ws/instance-workspace)
                  yml    (-> (config-yml database-name)
                             (str/replace "  workspace:\n" (str "    - name: " other-name "\n"
                                                                 "      engine: postgres\n"
                                                                 "      details: {host: h, user: u, password: p2-" password "}\n"
                                                                 "  workspace:\n"))
                             (str/replace (str "      " database-name ":\n") "      nope:\n"))]
              (is (re-find #"No database is named" (post yml)))
              (is (not (t2/exists? :model/Database :name other-name)))
              (is (= before (ws/instance-workspace)))
              (is (= :config-file (ws/workspace-lock)))))
          (finally
            (t2/delete! :model/Database :name [:in [database-name other-name]])
            (ws/clear-instance-workspace!)))))))

(deftest failed-connection-test-logs-no-secret-test
  (testing "a real failed connection test, through the driver's own logging, writes the password nowhere"
    (with-clean-workspace!
      (let [database-name (mt/random-name)
            yml           (-> (config-yml database-name)
                              (str/replace "host: warehouse.example.com" "host: localhost")
                              (str/replace "port: 5432" "port: 1"))]
        (mt/with-log-messages-for-level [oss-messages :debug]
          (mt/with-log-messages-for-level [ee-messages ["metabase-enterprise" :debug]]
            (let [message (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/config" {:config yml})]
              (is (re-find #"^Could not apply the databases section of this config.yml: " message))
              (is (not (str/includes? message password))))
            (let [logged (pr-str (concat (oss-messages) (ee-messages)))]
              (is (re-find #"Failed to connect to Database" logged)
                  "the driver's connection-test log ran")
              (is (not (str/includes? logged password))))))
        (is (not (t2/exists? :model/Database :name database-name)))))))

(deftest boot-under-env-var-skips-the-workspace-section-test
  (testing "MB_INSTANCE_WORKSPACE wins: the section neither installs, prunes the env var workspace's remappings, nor fails on unknown names"
    (with-clean-workspace!
      (mt/with-temp [:model/Database {db-id :id, db-name :name} {:name (mt/random-name), :engine :postgres}
                     :model/TableRemapping _ {:database_id db-id, :from_db "", :from_schema "sales", :from_table_name "orders"
                                              :to_db "", :to_schema "mb__isolation_env_sales", :to_table_name "orders"}]
        (let [env-workspace {:name "env", :databases {db-name {:schemas {"sales" "mb__isolation_env_sales"}}}}]
          (mt/with-temp-env-var-value! [:mb-instance-workspace (json/encode env-workspace)]
            (mt/with-log-messages-for-level [messages ["metabase-enterprise.workspaces" :warn]]
              (is (= :ok (advanced-config.file/initialize!
                          {:version 1
                           :config  {:workspace {:name      "from-config"
                                                 :databases {(keyword db-name) {:schemas {:sales "mb__isolation_cfg_sales"}}
                                                             :nope             {:schemas {:sales "x"}}}}}})))
              (is (some #(re-find #"MB_INSTANCE_WORKSPACE .* the env var wins" (:message %)) (messages))))
            (is (= env-workspace (ws/instance-workspace)))
            (is (= :env-var (ws/workspace-lock)))
            (is (= 1 (t2/count :model/TableRemapping :database_id db-id)))))))))

(deftest lock-check-and-install-are-serialized-test
  (testing "a POST /current that arrives while POST /config is applying waits, then sees the config.yml lock"
    (with-clean-workspace!
      (mt/with-temporary-setting-values [config-from-file-sync-databases false]
        (mt/with-temp [:model/Database {other-name :name} {:name (mt/random-name), :engine :postgres}]
          (let [database-name (mt/random-name)
                testing?      (promise)
                release       (promise)
                apply-config  (future
                                (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details?
                                                            (fn [& _]
                                                              (deliver testing? true)
                                                              @release
                                                              true)]
                                  (mt/user-http-request :crowberto :post "ee/workspace-instance/config"
                                                        {:config (config-yml database-name)})))]
            (try
              (is (true? (deref testing? 10000 :timed-out)))
              (let [post-current (future
                                   (mt/user-http-request :crowberto :post "ee/workspace-instance/current"
                                                         (workspace-instance other-name)))]
                (is (= :waiting (deref post-current 1000 :waiting))
                    "POST /current waits for the apply in progress")
                (deliver release true)
                (is (=? {:can_write false} (deref apply-config 10000 :timed-out)))
                (is (= "This instance's workspace is locked by config.yml and can't be changed through the API."
                       (deref post-current 10000 :timed-out))))
              (is (= (workspace-instance database-name) (ws/instance-workspace)))
              (finally
                (deliver release true)
                (t2/delete! :model/Database :name database-name)
                (ws/clear-instance-workspace!)))))))))
