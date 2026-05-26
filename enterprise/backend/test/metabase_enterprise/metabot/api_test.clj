(ns metabase-enterprise.metabot.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest usage-get-returns-token-status-usage-test
  (mt/with-premium-features #{:metabot-v3}
    (with-redefs [premium-features/token-status (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value      12345
                                                                                                           :meter-free-units 1337
                                                                                                           :meter-updated-at "2026-04-02T19:29:12Z"}}})]
      (is (= {:tokens       12345
              :free_tokens  1337
              :updated_at   "2026-04-02T19:29:12Z"
              :is_locked    nil}
             (-> (mt/user-http-request :crowberto :get 200 "ee/metabot/usage")
                 (update :updated_at str)))))))

(deftest usage-permissions-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/user-http-request :rasta :get 403 "ee/metabot/usage")))
