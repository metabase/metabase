(ns metabase-enterprise.metabot-v3.api.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest document-api-feature-toggle-test
  (testing "Document API endpoints respect metabot feature toggle"
    (mt/with-premium-features #{:metabot-v3}
      (testing "when metabot is disabled"
        (mt/with-temp-env-var-value! ["MB_METABOT_FEATURE_ENABLED" "false"]
          (testing "POST /api/ee/metabot-v3/document/generate-content returns 403"
            (is (= {:message "Metabot is disabled."}
                   (mt/user-http-request :rasta :post 403
                                         "ee/metabot-v3/document/generate-content"
                                         {:instructions "Generate a summary of sales data"})))))))))
