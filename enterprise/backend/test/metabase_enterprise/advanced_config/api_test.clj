(ns metabase-enterprise.advanced-config.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.driver.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- yaml-bytes ^bytes [body]
  (.getBytes ^String (yaml/generate-string body) "UTF-8"))

(defn- multipart [bs]
  [{:request-options {:headers {"content-type" "multipart/form-data"}}}
   {:config bs}])

(deftest superuser-only-test
  (testing "POST /api/ee/advanced-config requires superuser"
    (is (= "You don't have permissions to do that."
           (apply mt/user-http-request :rasta :post 403 "ee/advanced-config/"
                  (multipart (yaml-bytes {:version 1 :config {}})))))))

(deftest does-not-expand-templates-test
  (testing "POST /api/ee/advanced-config does NOT expand `{{env VAR}}` templates"
    ;; The literal template appears in the inserted database's name; if env
    ;; expansion happened, the row would be created under a different name.
    (let [db-name  "advanced-config-literal-{{env SECRET}}"
          payload  {:version 1
                    :config  {:databases [{:name    db-name
                                           :engine  "postgres"
                                           :details {}}]}}]
      (try
        (mt/with-premium-features #{:config-text-file}
          (mt/with-temporary-setting-values [config-from-file-sync-databases false]
            (with-redefs [metabase.driver.util/can-connect-with-details? (constantly true)]
              (mt/user-http-request :crowberto :post 204 "ee/advanced-config/"
                                    (first (multipart (yaml-bytes payload)))
                                    (second (multipart (yaml-bytes payload)))))))
        (is (some? (t2/select-one :model/Database :name db-name :engine "postgres"))
            "Database row carries the LITERAL name with templates unexpanded")
        (finally
          (when-let [db-id (t2/select-one-pk :model/Database :name db-name :engine "postgres")]
            (t2/delete! :model/Database db-id)))))))

(deftest applies-workspace-section-test
  (testing "POST /api/ee/advanced-config applies the :workspace section into the instance-workspace setting"
    (let [db-name (str "advanced-config-ws-" (random-uuid))
          payload {:version 1
                   :config  {:databases [{:name    db-name
                                          :engine  "postgres"
                                          :details {}}]
                             :workspace {:name      "Uploaded Workspace"
                                         :databases {(keyword db-name) {:input_schemas ["public"]
                                                                        :output        {:schema "ws_uploaded"}}}}}}]
      (try
        (mt/with-premium-features #{:config-text-file :workspaces}
          (mt/with-temporary-setting-values [config-from-file-sync-databases false]
            (with-redefs [metabase.driver.util/can-connect-with-details? (constantly true)]
              (mt/user-http-request :crowberto :post 204 "ee/advanced-config/"
                                    (first (multipart (yaml-bytes payload)))
                                    (second (multipart (yaml-bytes payload)))))))
        (testing "Database row was created"
          (let [db (t2/select-one :model/Database :name db-name :engine "postgres")]
            (is (some? db))
            (testing "Workspace instance setting was set"
              (let [stored (ws/instance-workspace)]
                (is (= "Uploaded Workspace" (:name stored)))
                (is (= {:schema "ws_uploaded"} (get-in stored [:databases (:id db) :output])))))))
        (finally
          (ws/clear-instance-workspace!)
          (when-let [db-id (t2/select-one-pk :model/Database :name db-name :engine "postgres")]
            (t2/delete! :model/Database db-id)))))))

(deftest runtime-upload-via-api-does-not-set-the-lock-test
  (testing "POST /api/ee/advanced-config with a :workspace section does NOT lock the workspace (only the boot loader does)"
    (let [db-name   (str "advanced-config-ws-" (random-uuid))
          payload   {:version 1
                     :config  {:databases [{:name    db-name
                                            :engine  "postgres"
                                            :details {}}]
                               :workspace {:name      "Uploaded Workspace"
                                           :databases {(keyword db-name) {:input_schemas ["public"]
                                                                          :output        {:schema "ws_uploaded"}}}}}}
          lock-atom @#'ws/locked-by-config?*
          prior     @lock-atom]
      (try
        (reset! lock-atom false)
        (mt/with-premium-features #{:config-text-file :workspaces}
          (mt/with-temporary-setting-values [config-from-file-sync-databases false]
            (with-redefs [metabase.driver.util/can-connect-with-details? (constantly true)]
              (mt/user-http-request :crowberto :post 204 "ee/advanced-config/"
                                    (first (multipart (yaml-bytes payload)))
                                    (second (multipart (yaml-bytes payload)))))))
        (is (false? (ws/workspace-locked-by-config?))
            "a runtime upload must not flip the boot lock")
        (finally
          (reset! lock-atom prior)
          (ws/clear-instance-workspace!)
          (when-let [db-id (t2/select-one-pk :model/Database :name db-name :engine "postgres")]
            (t2/delete! :model/Database db-id)))))))

(deftest workspace-section-rejected-without-workspaces-feature-test
  (testing "POST /api/ee/advanced-config returns 402 when :workspace section requires :workspaces"
    (let [payload {:version 1
                   :config  {:workspace {:name      "Rejected Workspace"
                                         :databases {:some-db {:input_schemas ["public"]
                                                               :output        {:schema "ws_rejected"}}}}}}]
      (mt/with-premium-features #{:config-text-file}
        (mt/assert-has-premium-feature-error
         "Workspaces"
         (mt/user-http-request :crowberto :post 402 "ee/advanced-config/"
                               (first (multipart (yaml-bytes payload)))
                               (second (multipart (yaml-bytes payload)))))))))
