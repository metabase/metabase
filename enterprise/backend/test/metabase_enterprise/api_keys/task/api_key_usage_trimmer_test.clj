(ns metabase-enterprise.api-keys.task.api-key-usage-trimmer-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.api-keys.task.api-key-usage-trimmer :as api-key-usage-trimmer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

;; NOTE: these tests deliberately do NOT wrap in `mt/with-premium-features #{:audit-app}` — API key
;; usage is collected on every EE instance, so its trimmer must run regardless of the audit-app feature.

(defn- usage-log [occurred-at]
  {:api_key_id 1234
   :route_template "/api/usage-trimmer-test/:id"
   :http_method "GET"
   :status 200
   :duration_ms 12
   :client_name "curl"
   :occurred_at occurred-at})

(deftest trims-rows-older-than-custom-retention-test
  (testing "with retention set to 30 days, usage rows older than 30 days are deleted"
    (mt/with-temp
      [:model/ApiKeyUsageLog {recent :id}   (usage-log (t/offset-date-time))
       :model/ApiKeyUsageLog {boundary :id} (usage-log (t/minus (t/offset-date-time) (t/days 31)))
       :model/ApiKeyUsageLog {old :id}      (usage-log (t/minus (t/offset-date-time) (t/days 200)))]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 30]
        (#'api-key-usage-trimmer/trim-old-api-key-usage-data!)
        (is (= #{recent}
               (t2/select-fn-set :id :model/ApiKeyUsageLog {:where [:in :id [recent boundary old]]}))
            "usage rows older than the cutoff are deleted, recent kept")))))

(deftest skips-deletion-when-retention-is-infinite-test
  (testing "when retention is set to 0 (infinite), no rows are deleted"
    (mt/with-temp
      [:model/ApiKeyUsageLog {recent :id} (usage-log (t/offset-date-time))
       :model/ApiKeyUsageLog {old :id}    (usage-log (t/minus (t/offset-date-time) (t/years 5)))]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
        (#'api-key-usage-trimmer/trim-old-api-key-usage-data!)
        (is (= #{recent old}
               (t2/select-fn-set :id :model/ApiKeyUsageLog {:where [:in :id [recent old]]})))))))
