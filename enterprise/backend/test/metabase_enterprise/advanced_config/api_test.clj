(ns metabase-enterprise.advanced-config.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.driver.util]
   [metabase.setup.core :as setup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- yaml-bytes ^bytes [body]
  (.getBytes ^String (yaml/generate-string body) "UTF-8"))

(defn- multipart
  ([bs]
   (multipart bs nil))
  ([bs api-key]
   [{:request-options {:headers (cond-> {"content-type" "multipart/form-data"}
                                  api-key (assoc "x-metabase-apikey" api-key))}}
    {:config bs}]))

(deftest superuser-only-test
  (testing "POST /api/ee/advanced-config requires superuser"
    (is (= "You don't have permissions to do that."
           (apply mt/user-http-request :rasta :post 403 "ee/advanced-config/"
                  (multipart (yaml-bytes {:version 1 :config {}})))))))

(deftest external-requires-static-api-key-test
  (testing "POST /api/ee/advanced-config/external"
    (let [payload (yaml-bytes {:version 1 :config {}})]
      (testing "403 when MB_API_KEY is not set"
        (mt/with-temporary-setting-values [api-key nil]
          (apply mt/client :post 403 "ee/advanced-config/external"
                 (multipart payload "anything"))))
      (mt/with-temporary-setting-values [api-key "test-api-key"]
        (testing "403 without the header"
          (apply mt/client :post 403 "ee/advanced-config/external"
                 (multipart payload)))
        (testing "403 with a wrong key"
          (apply mt/client :post 403 "ee/advanced-config/external"
                 (multipart payload "wrong-key")))
        (testing "applies the config with the correct key, no user session needed"
          (mt/with-premium-features #{:config-text-file}
            (apply mt/client :post 204 "ee/advanced-config/external"
                   (multipart payload "test-api-key"))))))))

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

(deftest config-upload-user-entry-test
  (testing "POST /api/ee/advanced-config with a users entry creates the user"
    (mt/with-premium-features #{:config-text-file}
      (mt/with-model-cleanup [:model/User]
        (let [email (u/lower-case-en (str (mt/random-name) "@config.test"))]
          (apply mt/user-http-request :crowberto :post 204 "ee/advanced-config/"
                 (multipart (yaml-bytes {:version 1
                                         :config  {:users [{:first_name   "Work"
                                                            :last_name    "Space"
                                                            :email        email
                                                            :password     "sUp3r-s3cret1"
                                                            :is_superuser true}]}})))
          (is (=? {:is_superuser true}
                  (t2/select-one :model/User :email email))
              "the user from the config lands as a superuser"))))))

(deftest config-user-entry-completes-setup-test
  (testing "a users entry completes the initial setup on an empty instance (has-user-setup flips)"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{:config-text-file}
        (binding [advanced-config.file/*supported-versions* {:min 1 :max 1}]
          (is (false? (setup/has-user-setup)))
          (advanced-config.file/initialize!
           {:version 1
            :config  {:users [{:first_name   "First"
                               :last_name    "Last"
                               :email        "boot@config.test"
                               :password     "sUp3r-s3cret1"
                               :is_superuser true}]}})
          (is (true? (setup/has-user-setup)))
          (is (=? {:is_superuser true}
                  (t2/select-one :model/User :email "boot@config.test"))))))))

(deftest config-user-entry-allows-nil-names-test
  (testing "users entries without a first or last name are allowed"
    (mt/with-premium-features #{:config-text-file}
      (mt/with-model-cleanup [:model/User]
        (let [email (u/lower-case-en (str (mt/random-name) "@config.test"))]
          (binding [advanced-config.file/*supported-versions* {:min 1 :max 1}]
            (advanced-config.file/initialize!
             {:version 1
              :config  {:users [{:first_name nil
                                 :last_name  nil
                                 :email      email
                                 :password   "sUp3r-s3cret1"}]}}))
          (is (=? {:first_name nil, :last_name nil}
                  (t2/select-one :model/User :email email))))))))
