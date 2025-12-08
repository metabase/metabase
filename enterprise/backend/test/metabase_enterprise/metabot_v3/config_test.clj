(ns metabase-enterprise.metabot-v3.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase.test :as mt]))

(deftest resolve-dynamic-metabot-id-test
  (testing "metabot ID resolution precedence"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id nil]
        (testing "explicit metabot-id takes precedence"
          (is (= "explicit-id"
                 (metabot-v3.config/resolve-dynamic-metabot-id "explicit-id"))))

        (testing "falls back to environment variable"
          (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id "env-metabot-id"]
            (is (= "env-metabot-id"
                   (metabot-v3.config/resolve-dynamic-metabot-id nil)))))

        (testing "falls back to internal default when no explicit or env value"
          (is (= metabot-v3.config/internal-metabot-id
                 (metabot-v3.config/resolve-dynamic-metabot-id nil))))))))

