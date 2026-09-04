(ns metabase.cmd.config-file-gen-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.config-file-gen :refer [config-file-settings create-settings-map get-name-and-default]]))

(def example-settings '({:database-local :never,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default nil,
                         :name :admin-email,
                         :export? false,
                         :type :string,
                         :enabled? nil,
                         :encryption :maybe,
                         :deprecated nil,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.String,
                         :on-change nil,
                         :doc nil,
                         :feature nil,
                         :namespace metabase.system.settings,
                         :munged-name "admin-email",
                         :visibility :authenticated}
                        {:database-local :allowed,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default nil,
                         :name :aggregated-query-row-limit,
                         :export? true,
                         :type :integer,
                         :enabled? nil,
                         :encryption :maybe,
                         :deprecated nil,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.Long,
                         :on-change nil,
                         :doc
                         "Must be less than 1048575. This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.\n  This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.\n  See also MB_UNAGGREGATED_QUERY_ROW_LIMIT.",
                         :feature nil,
                         :namespace metabase.query-processor.middleware.constraints,
                         :munged-name "aggregated-query-row-limit",
                         :visibility :authenticated}
                        {:database-local :never,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default true,
                         :name :anon-tracking-enabled,
                         :export? false,
                         :type :boolean,
                         :enabled? nil,
                         :encryption :never,
                         :deprecated nil,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.Boolean,
                         :on-change nil,
                         :doc nil,
                         :feature nil,
                         :namespace metabase.system.settings,
                         :munged-name "anon-tracking-enabled",
                         :visibility :public}
                        {:database-local :never,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default "old-value",
                         :name :deprecated-setting,
                         :export? false,
                         :type :string,
                         :enabled? nil,
                         :encryption :never,
                         :deprecated true,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.String,
                         :on-change nil,
                         :doc nil,
                         :feature nil,
                         :namespace metabase.system.settings,
                         :munged-name "deprecated-setting",
                         :visibility :public}))

(def ^:private read-only-setting
  "A read-only (`:setter :none`) setting that also carries a `:doc` string, like
  `ai-usage-max-retention-days`. It can be read from an environment variable, so it belongs in the
  env var docs, but a config file can never set it."
  {:database-local :never,
   :cache? true,
   :user-local :never,
   :init nil,
   :default nil,
   :name :ai-usage-max-retention-days,
   :export? true,
   :type :integer,
   :enabled? nil,
   :encryption :no,
   :deprecated nil,
   :audit :never,
   :sensitive? false,
   :tag java.lang.Long,
   :on-change nil,
   :setter :none,
   :doc
   "Sets the maximum number of days Metabase preserves rows for the following application database tables:\n\n- `ai_usage_log`",
   :feature nil,
   :namespace 'metabase.metabot.settings,
   :munged-name "ai-usage-max-retention-days",
   :visibility :admin})

(def settings-map
  {:admin-email nil
   :aggregated-query-row-limit nil
   :anon-tracking-enabled true})

(deftest computed-default-test
  (testing "a :default computed at runtime has no value the template can carry; it is left unset, which the config file loads as such"
    (is (= {:computed-setting nil}
           (get-name-and-default {:munged-name "computed-setting" :default (fn [] :depends-on-the-instance)})))
    (testing "while a plain default is carried as it is"
      (is (= {:plain-setting :sunday}
             (get-name-and-default {:munged-name "plain-setting" :default :sunday}))))))

(deftest test-config-template
  (testing "Setting map for config file is formatted as expected."
    (let [settings (create-settings-map example-settings)]
      (is (= settings-map
             settings)))))

(deftest config-file-settings-excludes-read-only-settings-test
  (testing "Read-only settings are excluded from the config file template, even when they have a `:doc`"
    (let [names (->> (conj (vec example-settings) read-only-setting)
                     config-file-settings
                     (map :munged-name)
                     set)]
      (is (not (contains? names "ai-usage-max-retention-days"))
          "a `:setter :none` setting must never be offered as a config file setting")
      (testing "and settable settings are still included"
        (is (contains? names "admin-email"))
        (is (contains? names "aggregated-query-row-limit"))))))

(def ^:private setting-without-env-var
  "A setting with `:can-read-from-env? false`, like the Metabot system prompts. It has no environment
  variable to document, but a config file can still set it."
  {:database-local :never,
   :cache? true,
   :user-local :never,
   :init nil,
   :default "",
   :name :metabot-chat-system-prompt,
   :export? true,
   :type :string,
   :enabled? nil,
   :encryption :no,
   :deprecated nil,
   :audit :no-value,
   :sensitive? false,
   :tag java.lang.String,
   :on-change nil,
   :can-read-from-env? false,
   :doc nil,
   :feature :ai-controls,
   :namespace 'metabase.metabot.settings,
   :munged-name "metabot-chat-system-prompt",
   :visibility :admin})

(deftest config-file-settings-includes-settings-without-env-vars-test
  (testing "Settings that ignore their environment variable are still offered in the config file template"
    (let [names (->> (conj (vec example-settings) setting-without-env-var)
                     config-file-settings
                     (map :munged-name)
                     set)]
      (is (contains? names "metabot-chat-system-prompt")))))
