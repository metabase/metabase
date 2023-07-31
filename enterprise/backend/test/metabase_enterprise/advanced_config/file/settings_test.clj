(ns metabase-enterprise.advanced-config.file.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings.premium-features-test :as premium-features-test]))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (premium-features-test/with-premium-features #{:config-text-file}
                          (thunk)))))

(defsetting config-from-file-settings-test-setting
  "Internal test setting."
  :visibility :internal)

(deftest settings-test
  (testing "Should be able to set settings with config-from-file"
    (config-from-file-settings-test-setting! nil)
    (testing "happy path"
      (binding [advanced-config.file/*config* {:version 1
                                               :config  {:settings {:config-from-file-settings-test-setting "wow"}}}]
        (advanced-config.file/initialize!)
        (is (= "wow"
               (config-from-file-settings-test-setting)))))
    (testing "Wrong value type should throw an error."
      (binding [advanced-config.file/*config* {:version 1
                                               :config  {:settings {:config-from-file-settings-test-setting 1000}}}]

        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Input .* does not match schema"
             (advanced-config.file/initialize!)))
        (testing "value should not have been updated"
          (is (= "wow"
                 (config-from-file-settings-test-setting))))))
    (testing "Invalid Setting (does not exist)"
      (binding [advanced-config.file/*config* {:version 1
                                               :config  {:settings {:config-from-file-settings-test-setting-FAKE 1000}}}]

        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unknown setting: :config-from-file-settings-test-setting-FAKE"
             (advanced-config.file/initialize!)))))))
