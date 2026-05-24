(ns metabase-enterprise.advanced-config.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.driver.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- yaml-bytes ^bytes [body]
  (.getBytes (yaml/generate-string body) "UTF-8"))

(defn- multipart [bs]
  [{:request-options {:headers {"content-type" "multipart/form-data"}}}
   {:config bs}])

(deftest superuser-only-test
  (testing "POST /api/ee/advanced-config requires superuser"
    (is (= "You don't have permissions to do that."
           (apply mt/user-http-request :rasta :post 403 "ee/advanced-config/"
                  (multipart (yaml-bytes {:version 1 :config {}})))))))

(deftest applies-uploaded-config-test
  (testing "POST /api/ee/advanced-config runs the boot-time loader against the uploaded YAML"
    (let [db-name (str "advanced-config-" (random-uuid))
          payload {:version 1
                   :config  {:databases [{:name    db-name
                                          :engine  "postgres"
                                          :details {:host "ignored" :port 1234 :dbname "x" :user "x"}}]
                             :workspace {:name      "Uploaded"
                                         :databases {(keyword db-name) {:input_schemas    ["public"]
                                                                        :output_namespace "ws_uploaded"}}}}}]
      (try
        ;; `init-from-config-file!` calls `can-connect-with-details?` on every db
        ;; before insert; stub it so the test doesn't need a live warehouse.
        (with-redefs [metabase.driver.util/can-connect-with-details? (constantly true)]
          (mt/user-http-request :crowberto :post 204 "ee/advanced-config/"
                                (first (multipart (yaml-bytes payload)))
                                (second (multipart (yaml-bytes payload)))))
        (testing "Database row was created"
          (is (some? (t2/select-one :model/Database :name db-name :engine "postgres"))))
        (testing "workspace-instance setting reflects the upload"
          (is (= "Uploaded" (:name (ws/instance-workspace)))))
        (finally
          (ws/clear-instance-workspace!)
          (when-let [db-id (t2/select-one-pk :model/Database :name db-name :engine "postgres")]
            (t2/delete! :model/Database db-id)))))))
