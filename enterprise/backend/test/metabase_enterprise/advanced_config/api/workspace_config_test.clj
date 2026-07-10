(ns metabase-enterprise.advanced-config.api.workspace-config-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.response :as api.response]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.driver.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server))

(defn- yaml-bytes ^bytes [body]
  (.getBytes ^String (yaml/generate-string body) "UTF-8"))

(defn- multipart [bs headers]
  [{:request-options {:headers (merge {"content-type" "multipart/form-data"} headers)}}
   {:config bs}])

(def ^:private api-key-header {"x-metabase-apikey" "test-api-key"})

(defn- post! [expected-status payload headers]
  (apply mt/client :post expected-status "ee/workspace-config/apply"
         (multipart (yaml-bytes payload) headers)))

(def ^:private empty-payload {:version 1 :config {}})

(deftest authentication-test
  (testing "POST /api/ee/workspace-config/apply"
    (mt/with-premium-features #{:config-text-file :workspaces}
      (testing "requires MB_API_KEY to be set"
        (mt/with-temporary-setting-values [api-key nil]
          (is (= (-> @#'api.routes.common/key-not-set-response :body str)
                 (post! 403 empty-payload {})))))
      (mt/with-temporary-setting-values [api-key "test-api-key"]
        (testing "requires the X-METABASE-APIKEY header"
          (is (= (get api.response/response-forbidden :body)
                 (post! 403 empty-payload {}))))
        (testing "rejects an incorrect key"
          (is (= (get api.response/response-forbidden :body)
                 (post! 403 empty-payload {"x-metabase-apikey" "wrong-key"}))))))))

(deftest requires-workspaces-feature-test
  (testing "POST /api/ee/workspace-config/apply returns 402 without the :workspaces feature"
    (mt/with-temporary-setting-values [api-key "test-api-key"]
      (mt/with-premium-features #{:config-text-file}
        (mt/assert-has-premium-feature-error
         "Workspaces"
         (post! 402 empty-payload api-key-header))))))

(deftest applies-config-synchronously-test
  (testing "POST /api/ee/workspace-config/apply applies the config before responding"
    (let [db-name (str "workspace-config-ws-" (random-uuid))
          payload {:version 1
                   :config  {:databases [{:name    db-name
                                          :engine  "postgres"
                                          :details {}}]
                             :workspace {:name      "Provisioned Workspace"
                                         :databases {(keyword db-name) {:input_schemas ["public"]
                                                                        :output        {:schema "ws_provisioned"}}}}}}]
      (try
        (mt/with-premium-features #{:config-text-file :workspaces}
          (mt/with-temporary-setting-values [api-key "test-api-key"
                                             config-from-file-sync-databases false]
            (with-redefs [metabase.driver.util/can-connect-with-details? (constantly true)]
              (post! 204 payload api-key-header))))
        (testing "config is fully applied by the time the response arrives"
          (let [db (t2/select-one :model/Database :name db-name :engine "postgres")]
            (is (some? db) "Database row was created")
            (let [stored (ws/instance-workspace)]
              (is (= "Provisioned Workspace" (:name stored)))
              (is (= {:schema "ws_provisioned"} (get-in stored [:databases (:id db) :output]))))))
        (finally
          (ws/clear-instance-workspace!)
          (when-let [db-id (t2/select-one-pk :model/Database :name db-name :engine "postgres")]
            (t2/delete! :model/Database db-id)))))))
