(ns metabase-enterprise.workspaces.api.workspace-instance-test
  "Smoke tests for the workspace-instance HTTP API.
   Behavioral logic is tested elsewhere — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.api :as ws.api]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each
  (fn [thunk]
    (mt/with-premium-features #{:workspaces}
      (try
        (thunk)
        (finally
          (ws/clear-instance-workspace!))))))

(deftest current-superuser-only-test
  (testing "GET /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/current")))))

(deftest current-empty-test
  (testing "GET /ee/workspace-instance/current returns {:data nil} when no workspace is loaded"
    (mt/with-dynamic-fn-redefs [ws/instance-workspace (constantly nil)]
      (is (= {:data nil}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace-instance/current returns {:data {:databases [{:database_id :schema}]}} from the settings"
    (ws.tu/with-workspace-db! (mt/id) "ws_alice"
      (fn []
        (is (= {:data {:databases [{:database_id (mt/id) :schema "ws_alice"}]}}
               (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))))))

(deftest current-enabled-without-schemas-test
  (testing "workspaces-enabled with no database-workspace-schema anywhere is a workspace with no databases, not null"
    (ws.settings/workspaces-enabled! true)
    (is (= {:data {:databases []}}
           (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))))

(deftest post-current-superuser-only-test
  (testing "POST /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/workspace-instance/current"
                                 {:databases []})))))

(deftest post-current-round-trip-test
  (testing "POST /ee/workspace-instance/current sets the settings and is readable via GET"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {}}
      (let [expected {:databases [{:database_id (mt/id) :schema "ws_api_install"}]}]
        (is (= expected
               (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current"
                                     expected)))
        (testing "the settings hold it"
          (is (true? (ws.settings/workspaces-enabled)))
          (is (= {:schema "ws_api_install"} (ws/db-workspace-namespace (mt/id)))))
        (testing "GET reflects the workspace just installed"
          (is (= {:data expected}
                 (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))))

(deftest post-current-rejects-unknown-database-test
  (testing "POST /ee/workspace-instance/current returns 400 for a database id this instance doesn't have"
    (is (re-find #"Unknown database ids"
                 (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                       {:databases [{:database_id Integer/MAX_VALUE :schema "ws"}]})))
    (is (false? (ws.settings/workspaces-enabled)))))

(deftest post-current-rejects-old-shape-test
  (testing "POST /ee/workspace-instance/current rejects (not strips) the pre-settings body with name and input_schemas"
    (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                          {:name      "old"
                           :databases {(mt/id) {:input_schemas ["PUBLIC"] :output {:schema "ws"}}}})
    (testing "and a list entry with the old keys instead of :schema"
      (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                            {:databases [{:database_id (mt/id) :output {:schema "ws"}}]}))
    (is (false? (ws.settings/workspaces-enabled)))))

(deftest post-current-refused-on-a-parent-test
  (testing "POST /ee/workspace-instance/current returns 400 on an instance with workspaces of its own"
    (mt/with-temp [:model/Workspace _ {:name "parent-ws"}]
      (is (re-find #"manages workspaces"
                   (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                         {:databases []}))))))

(deftest delete-current-rejects-when-env-var-set-test
  (testing "DELETE /ee/workspace-instance/current returns 400 when MB_WORKSPACES_ENABLED sets the setting"
    (mt/with-temp-env-var-value! [:mb-workspaces-enabled "true"]
      (is (re-find #"MB_WORKSPACES_ENABLED"
                   (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current"))))))

(deftest post-current-refuses-schema-change-under-env-var-test
  (testing "while MB_WORKSPACES_ENABLED is set, POST /ee/workspace-instance/current refuses to change a schema"
    (mt/with-temp [:model/Database {db-id :id} {:engine :postgres :settings {:database-workspace-schema "ws"}}]
      (mt/with-model-cleanup [:model/TableRemapping]
        (t2/insert! :model/TableRemapping {:database_id db-id :from_schema "public" :from_table_name "orders"
                                           :to_schema "ws" :to_table_name "orders"})
        (let [post!  (fn [status databases]
                       (mt/user-http-request :crowberto :post status "ee/workspace-instance/current"
                                             {:databases databases}))
              ;; every database that has a schema now, so that a POST of `others` plus an entry changes one database
              others (vec (for [database (t2/select :model/Database :id [:not= db-id])
                                :let     [schema (get-in database [:settings :database-workspace-schema])]
                                :when    schema]
                            {:database_id (:id database) :schema schema}))
              stored #(t2/select-one-fn :settings :model/Database :id db-id)
              rows   #(t2/count :model/TableRemapping :database_id db-id)]
          (mt/with-temp-env-var-value! [:mb-workspaces-enabled "true"]
            (doseq [[what databases] {"a different schema"            (conj others {:database_id db-id :schema "prod"})
                                      "a database left out (cleared)" others}]
              (testing what
                (is (= (str "database-workspace-schema can't be changed at runtime while the MB_WORKSPACES_ENABLED"
                            " env var is set. Change it in config.yml, or restart with new configuration.")
                       (post! 400 databases)))
                (is (= {:database-workspace-schema "ws"} (stored)))
                (is (= 1 (rows)))))
            (testing "a POST of the schemas the databases already have changes nothing, so it is not refused"
              (is (= {:databases (vec (sort-by :database_id (conj others {:database_id db-id :schema "ws"})))}
                     (post! 200 (conj others {:database_id db-id :schema " ws "}))))
              (is (= {:database-workspace-schema "ws"} (stored)))
              (is (= 1 (rows)))))
          (testing "MB_WORKSPACES_ENABLED=false: a schema change gets the same 400"
            (mt/with-temp-env-var-value! [:mb-workspaces-enabled "false"]
              (is (re-find #"database-workspace-schema can't be changed at runtime while the MB_WORKSPACES_ENABLED"
                           (post! 400 (conj others {:database_id db-id :schema "prod"}))))
              (is (= {:database-workspace-schema "ws"} (stored)))
              (is (= 1 (rows)))))
          (testing "without the env var, the same call changes the schema and deletes the remap rows"
            (post! 200 (conj others {:database_id db-id :schema "prod"}))
            (is (= {:database-workspace-schema "prod"} (stored)))
            (is (zero? (rows)))))))))

(deftest delete-current-superuser-only-test
  (testing "DELETE /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :delete 403 "ee/workspace-instance/current")))))

(deftest delete-current-clears-workspace-test
  (testing "DELETE /ee/workspace-instance/current clears any installed workspace"
    (ws/set-instance-workspace! {})
    (is (some? (ws/instance-workspace)))
    (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
    (is (nil? (ws/instance-workspace)))))

(deftest delete-current-drops-table-remappings-test
  (testing "DELETE /ee/workspace-instance/current drops any TableRemapping rows"
    (mt/with-model-cleanup [:model/TableRemapping]
      (ws/set-instance-workspace! {})
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (is (t2/exists? :model/TableRemapping :database_id (mt/id)))
      (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
      (is (not (t2/exists? :model/TableRemapping :database_id (mt/id)))))))

(deftest delete-current-drops-table-remappings-when-flag-already-off-test
  (testing "DELETE /ee/workspace-instance/current drops TableRemapping rows when workspaces-enabled is already off"
    (mt/with-model-cleanup [:model/TableRemapping]
      (let [remapping-id (t2/insert-returning-pk! :model/TableRemapping {:database_id     (mt/id)
                                                                         :from_schema     "public"
                                                                         :from_table_name "orders"
                                                                         :to_schema       "mb_iso"
                                                                         :to_table_name   "orders"})]
        (is (false? (ws.settings/workspaces-enabled)))
        (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
        (is (false? (ws.settings/workspaces-enabled)))
        (is (not (t2/exists? :model/TableRemapping :id remapping-id)))))))

(deftest post-current-repeat-with-padded-schema-keeps-table-remappings-test
  (testing "A repeat POST /ee/workspace-instance/current with a padded schema stores it trimmed and keeps the remap rows"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {}}
      (mt/with-model-cleanup [:model/TableRemapping]
        (let [body {:databases [{:database_id (mt/id) :schema " ws "}]}]
          (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current" body)
          (is (= "ws" (:database-workspace-schema (t2/select-one-fn :settings :model/Database :id (mt/id)))))
          (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                             :from_schema     "public"
                                             :from_table_name "orders"
                                             :to_schema       "ws"
                                             :to_table_name   "orders"})
          (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current" body)
          (is (t2/exists? :model/TableRemapping :database_id (mt/id))))))))

(deftest table-remappings-superuser-only-test
  (testing "GET /ee/workspace-instance/table-remappings requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/table-remappings")))))

(deftest table-remappings-smoke-test
  (testing "GET /ee/workspace-instance/table-remappings returns all rows"
    (mt/with-model-cleanup [:model/TableRemapping]
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/table-remappings")]
        (is (some #(= "orders" (:from_table_name %)) result))))))

(deftest contract-version-header-test
  (testing "GET /api/ee/workspace-instance/current 200 carries X-Metabase-Workspaces-Version: 2"
    (mt/with-dynamic-fn-redefs [ws/instance-workspace (constantly nil)]
      (is (= "2" (get-in (mt/user-http-request-full-response :crowberto :get 200 "ee/workspace-instance/current")
                         [:headers "X-Metabase-Workspaces-Version"]))))))

(deftest contract-version-header-every-route-test
  (testing "every workspace-instance route sends X-Metabase-Workspaces-Version: 2 on its success status, and on the 401"
    (let [version (fn [resp] (get-in resp [:headers "X-Metabase-Workspaces-Version"]))]
      ;; DELETE /current keeps each database's schema, so restore the test database's settings.
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {}}
        (testing "POST /current 200"
          (is (= "2" (version (mt/user-http-request-full-response
                               :crowberto :post 200 "ee/workspace-instance/current"
                               {:databases [{:database_id (mt/id) :schema "ws_hdr"}]})))))
        (testing "DELETE /current 204"
          (is (= "2" (version (mt/user-http-request-full-response :crowberto :delete 204 "ee/workspace-instance/current"))))))
      (testing "GET /table-remappings 200"
        (is (= "2" (version (mt/user-http-request-full-response :crowberto :get 200 "ee/workspace-instance/table-remappings")))))
      (testing "401 from the auth wrapper"
        (is (= "2" (version (mt/client-full-response :get 401 "ee/workspace-instance/current"))))))))

(deftest contract-version-header-on-thrown-errors-test
  (testing "errors a workspace-instance endpoint throws carry X-Metabase-Workspaces-Version: 2, with the status and body they had without it"
    (let [version (fn [resp] (get-in resp [:headers "X-Metabase-Workspaces-Version"]))]
      (testing "403"
        (let [resp (mt/user-http-request-full-response :rasta :get 403 "ee/workspace-instance/current")]
          (is (= "You don't have permissions to do that." (:body resp)))
          (is (= "2" (version resp)))))
      (testing "400 from request validation"
        (let [resp (mt/user-http-request-full-response :crowberto :post 400 "ee/workspace-instance/current" {:name 1})]
          (is (=? {:errors map?} (:body resp)))
          (is (= "2" (version resp)))))
      (testing "400 an endpoint throws"
        (let [resp (mt/user-http-request-full-response :crowberto :post 400 "ee/workspace-instance/current"
                                                       {:databases [{:database_id Integer/MAX_VALUE :schema "ws"}]})]
          (is (= (str "Unknown database ids: [" Integer/MAX_VALUE "]") (:body resp)))
          (is (= "2" (version resp)))))
      (testing "500"
        (mt/with-dynamic-fn-redefs [ws/instance-workspace (fn [] (throw (ex-info "boom" {})))]
          (let [resp (mt/user-http-request-full-response :crowberto :get 500 "ee/workspace-instance/current")]
            (is (=? {:message "boom"} (:body resp)))
            (is (= "2" (version resp)))))))))

(deftest contract-version-header-absent-outside-the-routes-test
  (testing "characterization: responses built outside the workspace-instance routes have no header"
    (let [version (fn [resp] (get-in resp [:headers "X-Metabase-Workspaces-Version"]))]
      (testing "the premium-feature 402"
        (mt/with-premium-features #{}
          (is (nil? (version (mt/user-http-request-full-response :crowberto :get 402 "ee/workspace-instance/current"))))))
      (testing "the 404 of a path no route matches"
        (is (nil? (version (mt/user-http-request-full-response :crowberto :get 404
                                                               "ee/workspace-instance/no-such-route"))))))))

(deftest contract-version-header-wrapper-test
  (testing "the wrapper answers an error with the standard error response plus the version header, however the error arrives"
    (let [wrap     @#'ws.api/add-contract-version-header
          request  {:request-method :get :uri "/x" :headers {"origin" "http://localhost:3000"}}
          e        (ex-info "Nope" {:status-code 409 :workspace_id 1})
          stable   (fn [response] (cond-> response (map? response) (update :headers dissoc "Last-Modified")))
          call     (fn [handler]
                     (let [result (promise)]
                       ((wrap handler) request #(deliver result [:respond (stable %)]) #(deliver result [:raise %]))
                       (deref result 5000 :timeout)))
          expected [:respond (-> (mw.exceptions/api-exception-response e request)
                                 (assoc-in [:headers "X-Metabase-Workspaces-Version"] "2")
                                 stable)]]
      (is (= 409 (:status (second expected))))
      (testing "thrown"
        (is (= expected (call (fn [_request _respond _raise] (throw e))))))
      (testing "passed to raise"
        (is (= expected (call (fn [_request _respond raise] (raise e))))))
      (testing "passed to raise on another thread"
        (is (= expected (call (fn [_request _respond raise] (future (raise e)))))))
      (testing "passed to respond"
        (is (= expected (call (fn [_request respond _raise] (respond e))))))
      (testing "a nil response, which lets routing try the next handler, passes through"
        (is (= [:respond nil] (call (fn [_request respond _raise] (respond nil)))))))))
