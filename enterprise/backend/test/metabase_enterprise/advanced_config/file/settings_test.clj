(ns metabase-enterprise.advanced-config.file.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.settings.env-file :as setting.env-file]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (mt/with-premium-features #{:config-text-file}
                          (thunk)))))

(defsetting config-from-file-settings-test-setting
  "Internal test setting."
  :visibility :internal
  :encryption :no)

(deftest settings-test
  (testing "Should be able to set settings with config-from-file"
    (config-from-file-settings-test-setting! nil)
    (testing "happy path"
      (advanced-config.file/initialize!
       {:version 1
        :config  {:settings {:config-from-file-settings-test-setting "wow"}}})
      (is (= "wow"
             (config-from-file-settings-test-setting))))
    (testing "Wrong value type should throw an error."
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid input: .*"
           (advanced-config.file/initialize!
            {:version 1
             :config  {:settings {:config-from-file-settings-test-setting 1000}}})))
      (testing "value should not have been updated"
        (is (= "wow"
               (config-from-file-settings-test-setting)))))
    (testing "Invalid Setting (does not exist) should log a warning and continue."
      (mt/with-log-messages-for-level [messages [metabase-enterprise.advanced-config.file.settings :warn]]
        (is (= :ok
               (advanced-config.file/initialize!
                {:version 1
                 :config  {:settings {:config-from-file-settings-test-setting-FAKE 1000}}})))
        (is (=? [{:level :warn, :message (u/colorize :yellow "Ignoring unknown setting in config: config-from-file-settings-test-setting-FAKE.")}]
                (messages)))))))

(defsetting config-from-file-sysadmin-only-test-setting
  "Internal sysadmin-only test setting."
  :visibility :internal
  :type       :string
  :default    "server-default"
  :sysadmin-only? true)

(defsetting config-from-file-sysadmin-env-only-test-setting
  "Internal sysadmin-only test setting the config file may not carry."
  :visibility :internal
  :type       :string
  :default    "server-default"
  :setter     :none
  :sysadmin-only? true)

(deftest sysadmin-only-setter-none-refused-test
  (testing "a sysadmin-only setting with :setter :none is refused by the config file: only the environment may set it"
    (mt/with-env-file-values! {}
      (is (thrown-with-msg? UnsupportedOperationException
                            #"You cannot set config-from-file-sysadmin-env-only-test-setting; it is a read-only setting"
                            (advanced-config.file/initialize!
                             {:version 1
                              :config  {:settings {:config-from-file-sysadmin-env-only-test-setting "from-config"}}})))
      (is (= "server-default" (config-from-file-sysadmin-env-only-test-setting)))
      (is (not (contains? (setting.env-file/env-file-values) :mb-config-from-file-sysadmin-env-only-test-setting))))))

(deftest sysadmin-only-settings-test
  (testing "a sysadmin-only setting in the config file is loaded into the metabase.env layer, not the application DB"
    (mt/with-env-file-values! {}
      (advanced-config.file/initialize!
       {:version 1
        :config  {:settings {:config-from-file-sysadmin-only-test-setting "from-config"
                             :config-from-file-settings-test-setting      "also-set"}}})
      (is (= "from-config" (config-from-file-sysadmin-only-test-setting)))
      (is (= :env (setting/get-raw-value-source :config-from-file-sysadmin-only-test-setting)))
      (is (nil? (setting/db-stored-value :config-from-file-sysadmin-only-test-setting)))
      (is (nil? (t2/select-one :model/Setting :key "config-from-file-sysadmin-only-test-setting")))
      (testing "other settings in the same section are still written the ordinary way"
        (is (= "also-set" (config-from-file-settings-test-setting)))
        (is (= :database (setting/get-raw-value-source :config-from-file-settings-test-setting))))))
  (testing "a value metabase.env already set wins over the config file"
    (mt/with-env-file-values! {:mb-config-from-file-sysadmin-only-test-setting "from-file"}
      (advanced-config.file/initialize!
       {:version 1
        :config  {:settings {:config-from-file-sysadmin-only-test-setting "from-config"}}})
      (is (= "from-file" (config-from-file-sysadmin-only-test-setting)))))
  (testing "and a real env var wins over both"
    (mt/with-env-file-values! {}
      (mt/with-temp-env-var-value! [mb-config-from-file-sysadmin-only-test-setting "from-env"]
        (advanced-config.file/initialize!
         {:version 1
          :config  {:settings {:config-from-file-sysadmin-only-test-setting "from-config"}}})
        (is (= "from-env" (config-from-file-sysadmin-only-test-setting)))))))
