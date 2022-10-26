(ns metabase-enterprise.config-from-file.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.config-from-file.core :as config-from-file]
   [metabase.models.setting :refer [defsetting]]))

(defsetting config-from-file-settings-test-setting
  "Internal test setting."
  :visibility :internal)

(deftest settings-test
  (testing "Should be able to set settings with config-from-file"
    (config-from-file-settings-test-setting! nil)
    (binding [config-from-file/*supported-versions* {:min 1, :max 1}]
      (testing "happy path"
        (binding [config-from-file/*config* {:version 1
                                             :config  {:settings {:config-from-file-settings-test-setting "wow"}}}]
          (config-from-file/initialize!)
          (is (= "wow"
                 (config-from-file-settings-test-setting)))))
      (testing "Wrong value type should throw an error."
        (binding [config-from-file/*config* {:version 1
                                             :config  {:settings {:config-from-file-settings-test-setting 1000}}}]

          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Input .* does not match schema"
               (config-from-file/initialize!)))
          (testing "value should not have been updated"
            (is (= "wow"
                   (config-from-file-settings-test-setting))))))
      (testing "Invalid Setting (does not exist)"
        (binding [config-from-file/*config* {:version 1
                                             :config  {:settings {:config-from-file-settings-test-setting-FAKE 1000}}}]

          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Unknown setting: :config-from-file-settings-test-setting-FAKE"
               (config-from-file/initialize!))))))))
