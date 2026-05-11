(ns metabase-enterprise.metabot.task.ai-usage-trimmer-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.metabot.task.ai-usage-trimmer :as ai-usage-trimmer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- usage-log-defaults
  []
  {:source            "test"
   :model             "test/model"
   :prompt_tokens     0
   :completion_tokens 0
   :total_tokens      0})

(deftest trims-rows-older-than-default-retention-test
  (testing "with default retention (180 days), only rows older than 180 days are deleted"
    (mt/with-temp
      [:model/AiUsageLog {recent-id :id} (assoc (usage-log-defaults)
                                                :created_at (t/offset-date-time))
       :model/AiUsageLog {old-id :id}    (assoc (usage-log-defaults)
                                                :created_at (t/minus (t/offset-date-time) (t/days 200)))]
      (#'ai-usage-trimmer/trim-old-usage-data!)
      (is (= #{recent-id}
             (t2/select-fn-set :id :model/AiUsageLog {:where [:in :id [recent-id old-id]]}))))))

(deftest trims-rows-older-than-custom-retention-test
  (testing "with retention set to 30 days, rows older than 30 days are deleted"
    (mt/with-temp
      [:model/AiUsageLog {recent-id :id} (assoc (usage-log-defaults)
                                                :created_at (t/offset-date-time))
       :model/AiUsageLog {boundary-id :id} (assoc (usage-log-defaults)
                                                  :created_at (t/minus (t/offset-date-time) (t/days 31)))
       :model/AiUsageLog {old-id :id}    (assoc (usage-log-defaults)
                                                :created_at (t/minus (t/offset-date-time) (t/days 200)))]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 30]
        (#'ai-usage-trimmer/trim-old-usage-data!)
        (is (= #{recent-id}
               (t2/select-fn-set :id :model/AiUsageLog {:where [:in :id [recent-id boundary-id old-id]]})))))))

(deftest skips-deletion-when-retention-is-infinite-test
  (testing "when retention is set to 0 (infinite), no rows are deleted"
    (mt/with-temp
      [:model/AiUsageLog {recent-id :id} (assoc (usage-log-defaults)
                                                :created_at (t/offset-date-time))
       :model/AiUsageLog {old-id :id}    (assoc (usage-log-defaults)
                                                :created_at (t/minus (t/offset-date-time) (t/years 5)))]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
        (#'ai-usage-trimmer/trim-old-usage-data!)
        (is (= #{recent-id old-id}
               (t2/select-fn-set :id :model/AiUsageLog {:where [:in :id [recent-id old-id]]})))))))
