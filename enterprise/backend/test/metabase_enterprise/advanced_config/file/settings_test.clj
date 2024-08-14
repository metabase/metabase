(ns ^:mb/once metabase-enterprise.advanced-config.file.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase.models.setting :refer [defsetting]]
   [metabase.test :as mt]
   [metabase.util :as u]))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (mt/with-premium-features #{:config-text-file}
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
             #"Invalid input: .*"
             (advanced-config.file/initialize!)))
        (testing "value should not have been updated"
          (is (= "wow"
                 (config-from-file-settings-test-setting))))))
    (testing "Invalid Setting (does not exist) should log a warning and continue."
      (binding [advanced-config.file/*config* {:version 1
                                               :config  {:settings {:config-from-file-settings-test-setting-FAKE 1000}}}]

        (let [log-messages (mt/with-log-messages-for-level [metabase-enterprise.advanced-config.file.settings :warn]
                             (is (= :ok
                                    (advanced-config.file/initialize!))))]
          (is (= [[:warn nil (u/colorize :yellow "Ignoring unknown setting in config: config-from-file-settings-test-setting-FAKE.")]]
                 log-messages)))))))
