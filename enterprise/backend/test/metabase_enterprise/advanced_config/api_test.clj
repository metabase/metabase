(ns metabase-enterprise.advanced-config.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
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
