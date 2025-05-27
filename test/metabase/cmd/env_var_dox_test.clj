(ns metabase.cmd.env-var-dox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.cmd.env-var-dox :as sut]))

(def ^:private ns-set (sut/get-settings #{"metabase.system.settings"}))

(deftest ^:parallel test-format-prefix
  (testing "format-prefix handles deprecated variables."
    (let [normal-var {:munged-name "test-setting"}
          deprecated-var {:munged-name "old-setting" :deprecated true}
          deprecated-with-msg-var {:munged-name "very-old-setting" :deprecated "Since v0.53"}]
      (is (= "MB_TEST_SETTING" (#'sut/format-prefix normal-var)))
      (is (= "MB_OLD_SETTING [DEPRECATED]" (#'sut/format-prefix deprecated-var)))
      (is (= "MB_VERY_OLD_SETTING [DEPRECATED]" (#'sut/format-prefix deprecated-with-msg-var))))))

(deftest ^:parallel test-format-deprecated
  (testing "format-deprecated correctly formats deprecation messages"
    (let [not-deprecated-var {:munged-name "current-setting"}
          deprecated-var {:munged-name "old-setting" :deprecated true}
          deprecated-with-msg-var {:munged-name "very-old-setting" :deprecated "Since v0.53"}]
      (is (nil? (#'sut/format-deprecated not-deprecated-var)))
      (is (= "> DEPRECATED" (#'sut/format-deprecated deprecated-var)))
      (is (= "> DEPRECATED: Since v0.53" (#'sut/format-deprecated deprecated-with-msg-var))))))

(def ^:private settings-filtered
  (filter #(#{:active-users-count ;; active-users-count should be excluded
              :aggregated-query-row-limit
              :admin-email}
            (:name %))
          ns-set))

(def ^:private admin-email-docs
  "### `MB_ADMIN_EMAIL`\n\n- Type: string\n- Default: `null`\n- [Configuration file name](./config-file.md): `admin-email`\n\nThe email address users should be referred to if they encounter a problem.")

(def ^:private aggregated-query-row-limit-docs
  "### `MB_AGGREGATED_QUERY_ROW_LIMIT`\n\n- Type: integer\n- Default: `10000`\n- [Exported as](../installation-and-operation/serialization.md): `aggregated-query-row-limit`.\n- [Configuration file name](./config-file.md): `aggregated-query-row-limit`\n\nMaximum number of rows to return for aggregated queries via the API.\n\nMust be less than 1048575. See also MB_UNAGGREGATED_QUERY_ROW_LIMIT.")

(def ^:private expected-docs
  (str/join "\n\n"
            [admin-email-docs
             aggregated-query-row-limit-docs]))

(deftest ^:parallel test-env-var-docs
  (testing "Environment docs are formatted as expected."
    (let [generated-docs (sut/format-env-var-docs settings-filtered)]
      (is (= expected-docs
             (str/join "\n\n" generated-docs))))))
