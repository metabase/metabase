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

(deftest ^:parallel test-format-default
  (testing "format-default correctly handles conversion of defaults to strings"
    (let [keyword-default-var {:default :some-keyword}
          string-default-var {:default "some-string"}
          nil-default-var {:default nil}
          false-default-var {:default false}
          number-default-var {:default 42}]
      (is (= "Default: `some-keyword`" (#'sut/format-default keyword-default-var)))
      (is (= "Default: `some-string`" (#'sut/format-default string-default-var)))
      (is (= "Default: `null`" (#'sut/format-default nil-default-var)))
      (is (= "Default: `false`" (#'sut/format-default false-default-var)))
      (is (= "Default: `42`" (#'sut/format-default number-default-var))))))

(deftest ^:parallel test-env-var-docs
  (testing "Environment docs are formatted as expected."
    (let [generated-docs (sut/format-env-var-docs settings-filtered)]
      (is (= expected-docs
             (str/join "\n\n" generated-docs))))))

(deftest ^:parallel format-doc-test
  (testing "format-doc handles different doc values correctly"
    (testing "returns string doc values"
      (is (= "This is documentation"
             (#'sut/format-doc {:doc "This is documentation"}))))
    (testing "returns nil for false doc values (not a string)"
      (is (nil? (#'sut/format-doc {:doc false}))))
    (testing "returns nil for true doc values (not a string)"
      (is (nil? (#'sut/format-doc {:doc true}))))
    (testing "returns nil for nil doc values"
      (is (nil? (#'sut/format-doc {:doc nil}))))
    (testing "returns nil when doc key is missing"
      (is (nil? (#'sut/format-doc {}))))))

(deftest ^:parallel format-env-var-entry-with-false-doc-test
  (testing "format-env-var-entry doesn't crash when env-var has :doc false"
    (let [env-var-with-false-doc {:name :test-setting
                                  :munged-name "test-setting"
                                  :type :string
                                  :default "default-value"
                                  :description (constantly "Test description")
                                  :doc false
                                  :visibility :public}]
      (is (string? (#'sut/format-env-var-entry env-var-with-false-doc)))
      (is (str/includes? (#'sut/format-env-var-entry env-var-with-false-doc) "MB_TEST_SETTING")))))
