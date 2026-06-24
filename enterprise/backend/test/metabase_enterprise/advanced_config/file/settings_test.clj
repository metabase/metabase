(ns metabase-enterprise.advanced-config.file.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.premium-features.token-check :as token-check]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.test :as mt]
   [metabase.util :as u]))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (mt/with-premium-features #{:config-text-file}
                          (thunk)))))

(defsetting config-from-file-settings-test-setting
  "Internal test setting."
  :visibility :internal
  :encryption :no)

(defsetting config-from-file-feature-gated-test-setting
  "Internal test setting gated behind a premium feature."
  :visibility :internal
  :encryption :no
  :feature    :test-config-ordering-feature)

(deftest settings-applied-token-first-test
  (testing "premium-embedding-token is applied before other settings, regardless of file order (UXW-3782)"
    ;; Simulate a token that, once set, unlocks `:test-config-ordering-feature`. We stub the token setter so we don't
    ;; hit the MetaStore, and make the feature set reflect whether the token has been applied yet.
    (mt/with-dynamic-fn-redefs [token-check/-set-premium-embedding-token!
                                #(setting/set-value-of-type! :string :premium-embedding-token %)]
      (binding [token-check/*token-features* (fn []
                                               (cond-> #{"config-text-file"}
                                                 (premium-features.settings/premium-embedding-token)
                                                 (conj "test-config-ordering-feature")))]
        (setting/set-value-of-type! :string :premium-embedding-token nil)
        ;; reset via set-value-of-type! to bypass the feature check (the feature is unavailable until the token is set)
        (setting/set-value-of-type! :string :config-from-file-feature-gated-test-setting nil)
        (testing "feature-gated setting listed BEFORE the token still succeeds"
          (advanced-config.file/initialize!
           {:version 1
            ;; array-map preserves insertion order: gated setting first, token second
            ;; The YAML reader preserves order similarly, so this is a good test without needing a real file.
            :config  {:settings (array-map
                                 :config-from-file-feature-gated-test-setting "yes"
                                 :premium-embedding-token                     "test-token")}})
          (is (= "yes"
                 (config-from-file-feature-gated-test-setting))))))))

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
