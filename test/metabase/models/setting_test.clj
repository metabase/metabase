(ns metabase.models.setting-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [environ.core :as env]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting :refer [defsetting Setting]]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;; ## TEST SETTINGS DEFINITIONS

(defsetting test-setting-1
  "Test setting - this only shows up in dev (1)")

(defsetting test-setting-2
  "Test setting - this only shows up in dev (2)"
  :default "[Default Value]")

(defsetting test-setting-3
  "Test setting - this only shows up in dev (3)"
  :visibility :internal)

(defsetting test-boolean-setting
  "Test setting - this only shows up in dev (3)"
  :visibility :internal
  :type :boolean)

(defsetting test-json-setting
  "Test setting - this only shows up in dev (4)"
  :type :json)

(defsetting test-csv-setting
  "Test setting - this only shows up in dev (5)"
  :visibility :internal
  :type :csv)

(defsetting ^:private test-csv-setting-with-default
  "Test setting - this only shows up in dev (6)"
  :visibility :internal
  :type :csv
  :default ["A" "B" "C"])

(defsetting test-env-setting
  "Test setting - this only shows up in dev (7)"
  :visibility :internal)

(defsetting toucan-name
  "Name for the Metabase Toucan mascot."
  :visibility :internal)

(defsetting test-setting-calculated-getter
  "Test setting - this only shows up in dev (8)"
  :type       :boolean
  :setter     :none
  :getter     (constantly true))

(defsetting test-setting-custom-init
  "Test setting - this only shows up in dev (0)"
  :type       :string
  :init       (comp str random-uuid))

(def ^:private ^:dynamic *enabled?* false)

(defsetting test-enabled-setting-no-default
  "Setting to test the `:enabled?` property of settings. This only shows up in dev."
  :visibility :internal
  :type       :string
  :enabled?   (fn [] *enabled?*))

(defsetting test-enabled-setting-default
  "Setting to test the `:enabled?` property of settings. This only shows up in dev."
  :visibility :internal
  :type       :string
  :default    "setting-default"
  :enabled?   (fn [] *enabled?*))

(defsetting test-feature-setting
  "Setting to test the `:feature` property of settings. This only shows up in dev."
  :visibility :internal
  :type       :string
  :default    "setting-default"
  :feature    :test-feature)

;; ## HELPER FUNCTIONS

(defn db-fetch-setting
  "Fetch `Setting` value from the DB to verify things work as we expect."
  [setting-name]
  (t2/select-one-fn :value Setting, :key (name setting-name)))

(defn setting-exists-in-db?
  "Returns a boolean indicating whether a setting has a value stored in the application DB."
  [setting-name]
  (boolean (t2/select-one Setting :key (name setting-name))))

(defn- test-assert-setting-has-tag [setting-var expected-tag]
  (let [{:keys [tag arglists]} (meta setting-var)]
    (testing "There should not be a tag on the var itself"
      (is (nil? tag)))
    (testing "Arglists should be tagged\n"
      (doseq [arglist arglists]
        (testing (binding [*print-meta* true] (pr-str arglist))
          (is (= expected-tag
                 (:tag (meta arglist)))))))))

(deftest preserve-metadata-test
  (testing "defsetting should preserve metadata on the setting symbol in the getter/setter functions"
    (doseq [varr [#'test-csv-setting-with-default #'test-csv-setting-with-default!]]
      (testing (format "\nvar = %s" (pr-str varr))
        (is (:private (meta varr)))))))

(deftest string-tag-test
  (testing "String vars defined by `defsetting` should have correct `:tag` metadata\n"
    (doseq [varr [#'test-setting-1 #'test-setting-1!]]
      (testing (format "\nVar = %s" (pr-str varr))
        (test-assert-setting-has-tag varr 'java.lang.String)))))

(deftest defsetting-getter-fn-test
  (testing "Test defsetting getter fn. Should return the value from env var MB_TEST_ENV_SETTING"
    (test-env-setting! nil)
    (is (= "ABCDEFG"
           (test-env-setting))))

  (testing "Test getting a default value -- if you clear the value of a Setting it should revert to returning the default value"
    (test-setting-2! nil)
    (is (= "[Default Value]"
           (test-setting-2)))))

(deftest user-facing-value-test
  (testing "`user-facing-value` should return `nil` for a Setting that is using the default value"
    (test-setting-2! nil)
    (is (= nil
           (setting/user-facing-value :test-setting-2))))
  (testing "`user-facing-value` should work correctly for calculated Settings (no underlying value)"
    (is (= true
           (test-setting-calculated-getter)))
    (is (= true
           (setting/user-facing-value :test-setting-calculated-getter))))

  (testing "`user-facing-value` will initialize pending values"
    (mt/discard-setting-changes [:test-setting-custom-init]
      (is (some? (setting/user-facing-value :test-setting-custom-init))))))

(deftest do-not-define-setter-function-for-setter-none-test
  (testing "Settings with `:setter` `:none` should not have a setter function defined"
    (testing "Sanity check: getter should be defined"
      (is (some? (resolve `test-setting-calculated-getter))))
    (is (not (resolve `test-setting-calculated-getter!)))))

;; TODO: I suspect we're seeing stale values in CI due to parallel tests or state persisting between runs
;;  We should at least make this an error when running locally without parallelism.
(defn- clear-setting-if-leak! []
  (when-let [existing-value (some? (#'setting/read-setting :test-setting-custom-init))]
    (log/warn "Test environment corrupted, perhaps due to parallel tests or state kept between runs" existing-value)
    (setting/set! :test-setting-custom-init nil :bypass-read-only? true)))

(deftest setting-initialization-test
  (testing "The value will be initialized and saved"
    (clear-setting-if-leak!)
    (mt/discard-setting-changes [:test-setting-custom-init]
      (let [val (setting/get :test-setting-custom-init)]
        (is (some? val))
        (is (= val (test-setting-custom-init)))
        (is (= val (#'setting/read-setting :test-setting-custom-init)))))))

(deftest validate-without-initialization-test
  (testing "Validation does not initialize the setting"
    (clear-setting-if-leak!)
    (setting/validate-settings-formatting!)
    (is (= nil (#'setting/read-setting :test-setting-custom-init)))))

(deftest init-requires-db-test
  (testing "We will fail instead of implicitly initializing a setting if the db is not ready"
    (mt/discard-setting-changes [:test-setting-custom-init]
      (clear-setting-if-leak!)
      (binding [mdb.connection/*application-db* {:status (atom @#'mdb.connection/initial-db-status)}]
        (is (= false (mdb/db-is-set-up?)))
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"Cannot initialize setting before the db is set up"
              (test-setting-custom-init)))
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"Cannot initialize setting before the db is set up"
              (setting/get :test-setting-custom-init)))))))

(def ^:private base-options
  {:setter   :none
   :default  "totally-basic"})

(defsetting test-no-default-with-base-setting
  "Setting to test the `:base` property of settings. This only shows up in dev."
  :visibility :internal
  :base       base-options)

(defsetting test-default-with-base-setting
  "Setting to test the `:base` property of settings. This only shows up in dev."
  :visibility :internal
  :base       base-options
  :default    "fully-bespoke")

(deftest ^:parallel defsetting-with-base-test
  (testing "A setting which specifies some base options"
    (testing "Uses base options when no top-level options are specified"
      (let [without-override (setting/resolve-setting :test-no-default-with-base-setting)]
        (is (= "totally-basic" (:default without-override)))
        (is (= "totally-basic" (test-no-default-with-base-setting)))))
    (testing "Uses top-level options when they are specified"
      (let [with-override (setting/resolve-setting :test-default-with-base-setting)]
        (is (= "fully-bespoke" (:default with-override)))
        (is (= "fully-bespoke" (test-default-with-base-setting)))))))

;; Avoid a false positive from `deftest-check-parallel` due to referencing the setter function.
;; Even though we only resolve the (non-existent) setter, and don't call anything, the linter flags it.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel defsetting-with-setter-in-base-test
  (testing "A setting which inherits :setter from the base options"
    (let [setting (setting/resolve-setting :test-default-with-base-setting)]
      (testing "Does not generate a setter"
        (is (= :none (:setter setting)))
        (is (nil? (resolve 'test-default-with-base-setting!)))))))

(deftest defsetting-setter-fn-test
  (test-setting-2! "FANCY NEW VALUE <3")
  (is (= "FANCY NEW VALUE <3"
         (test-setting-2)))
  (is (= "FANCY NEW VALUE <3"
         (db-fetch-setting :test-setting-2))))

(deftest set!-test
  (setting/set! :test-setting-2 "WHAT A NICE VALUE <3")
  (is (= "WHAT A NICE VALUE <3"
         (test-setting-2)))
  (is (= "WHAT A NICE VALUE <3"
         (db-fetch-setting :test-setting-2))))

(deftest set-many!-test
  (testing "should be able to set multiple settings at one time"
    (setting/set-many! {:test-setting-1 "I win!"
                        :test-setting-2 "For realz"})
    (is (= "I win!"
           (db-fetch-setting :test-setting-1)))
    (is (= "For realz"
           (db-fetch-setting :test-setting-2))))

  (testing "if one change fails, the entire set of changes should be reverted"
    (mt/with-temporary-setting-values [test-setting-1 "123"
                                       test-setting-2 "123"]
      (let [orig  setting/set!
            calls (atom 0)]
        ;; allow the first Setting change to succeed, then throw an Exception after that
        (with-redefs [setting/set! (fn [& args]
                                     (if (zero? @calls)
                                       (do
                                         (swap! calls inc)
                                         (apply orig args))
                                       (throw (ex-info "Oops!" {}))))]
          (is (thrown-with-msg?
               Throwable
               #"Oops"
               (setting/set-many! {:test-setting-1 "ABC", :test-setting-2 "DEF"})))
          (testing "changes should be reverted"
            (is (= "123"
                   (test-setting-1)))
            (is (= "123"
                   (test-setting-2)))))))))

(deftest delete-test
  (testing "delete"
    (testing "w/o default value"
      (test-setting-1! "COOL")
      (is (= "COOL"
             (test-setting-1)))
      (is (= true
             (setting-exists-in-db? :test-setting-1)))
      (test-setting-1! nil)
      (is (= nil
             (test-setting-1)))
      (is (= nil
             (setting/get :test-setting-1)))
      (is (= false
             (setting-exists-in-db? :test-setting-1))))

    (testing "w/ default value"
      (test-setting-2! "COOL")
      (is (= "COOL"
             (test-setting-2)))
      (is (= true
             (setting-exists-in-db? :test-setting-2)))
      (test-setting-2! nil)
      (is (= "[Default Value]"
             (test-setting-2))
          "default value should get returned if none is set")
      (is (= false
             (setting-exists-in-db? :test-setting-2))
          "setting still shouldn't exist in the DB"))))


;;; --------------------------------------------- all & user-facing-info ---------------------------------------------

;; these tests are to check that settings get returned with the correct information; these functions are what feed
;; into the API

(defn- user-facing-info-with-db-and-env-var-values [setting db-value env-var-value]
  (tu/do-with-temporary-setting-value setting db-value
    (fn []
      (tu/do-with-temp-env-var-value!
       (setting/setting-env-map-name (keyword setting))
       env-var-value
       (fn []
         (dissoc (#'setting/user-facing-info (#'setting/resolve-setting setting))
                 :key :description))))))

(deftest user-facing-info-test
  (testing "user-facing info w/ no db value, no env var value, no default value"
    (is (= {:value nil, :is_env_setting false, :env_name "MB_TEST_SETTING_1", :default nil}
           (user-facing-info-with-db-and-env-var-values :test-setting-1 nil nil))))

  (testing "user-facing info w/ no db value, no env var value, default value"
    (is (= {:value nil, :is_env_setting false, :env_name "MB_TEST_SETTING_2", :default "[Default Value]"}
           (user-facing-info-with-db-and-env-var-values :test-setting-2 nil nil))))

  (testing "user-facing info w/ no db value, env var value, no default value -- shouldn't leak env var value"
    (is (= {:value nil, :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using value of env var $MB_TEST_SETTING_1"}
           (user-facing-info-with-db-and-env-var-values :test-setting-1 nil "TOUCANS"))))

  (testing "user-facing info w/ no db value, env var value, default value"
    (is (= {:value nil, :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using value of env var $MB_TEST_SETTING_2"}
           (user-facing-info-with-db-and-env-var-values :test-setting-2 nil "TOUCANS"))))

  (testing "user-facing info w/ db value, no env var value, no default value"
    (is (= {:value "WOW", :is_env_setting false, :env_name "MB_TEST_SETTING_1", :default nil}
           (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" nil))))

  (testing "user-facing info w/ db value, no env var value, default value"
    (is (= {:value "WOW", :is_env_setting false, :env_name "MB_TEST_SETTING_2", :default "[Default Value]"}
           (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" nil))))

  (testing "user-facing info w/ db value, env var value, no default value -- the env var should take precedence over the db value, but should be obfuscated"
    (is (= {:value nil, :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using value of env var $MB_TEST_SETTING_1"}
           (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" "ENV VAR"))))

  (testing "user-facing info w/ db value, env var value, default value -- env var should take precedence over default, but should be obfuscated"
    (is (= {:value nil, :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using value of env var $MB_TEST_SETTING_2"}
           (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" "ENV VAR")))))

(deftest writable-settings-test
  (testing `setting/writable-settings
    (mt/with-test-user :crowberto
      (test-setting-1! nil)
      (test-setting-2! "TOUCANS")
      (is (= {:key            :test-setting-2
              :value          "TOUCANS"
              :description    "Test setting - this only shows up in dev (2)"
              :is_env_setting false
              :env_name       "MB_TEST_SETTING_2"
              :default        "[Default Value]"}
             (some (fn [setting]
                     (when (re-find #"^test-setting-2$" (name (:key setting)))
                       setting))
                   (setting/writable-settings))))

      (testing "with a custom getter"
        (test-setting-1! nil)
        (test-setting-2! "TOUCANS")
        (is (= {:key            :test-setting-2
                :value          7
                :description    "Test setting - this only shows up in dev (2)"
                :is_env_setting false
                :env_name       "MB_TEST_SETTING_2"
                :default        "[Default Value]"}
               (some (fn [setting]
                       (when (re-find #"^test-setting-2$" (name (:key setting)))
                         setting))
                     (setting/writable-settings :getter (comp count (partial setting/get-value-of-type :string)))))))

      ;; TODO -- probably don't need both this test and the "TOUCANS" test above, we should combine them
      (testing "test settings"
        (test-setting-1! nil)
        (test-setting-2! "S2")
        (is (= [{:key            :test-setting-1
                 :value          nil
                 :is_env_setting false
                 :env_name       "MB_TEST_SETTING_1"
                 :description    "Test setting - this only shows up in dev (1)"
                 :default        nil}
                {:key            :test-setting-2
                 :value          "S2"
                 :is_env_setting false
                 :env_name       "MB_TEST_SETTING_2"
                 :description    "Test setting - this only shows up in dev (2)"
                 :default        "[Default Value]"}]
               (for [setting (setting/writable-settings)
                     :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
                 setting)))))))

(defsetting test-i18n-setting
  (deferred-tru "Test setting - with i18n"))

(deftest validate-description-test
  (testing "Validate setting description with i18n string"
    (mt/with-test-user :crowberto
      (mt/with-mock-i18n-bundles {"zz" {:messages {"Test setting - with i18n" "TEST SETTING - WITH I18N"}}}
        (letfn [(description []
                  (some (fn [{:keys [key description]}]
                          (when (= :test-i18n-setting key)
                            description))
                        (setting/writable-settings)))]
          (is (= "Test setting - with i18n"
                 (description)))
          (mt/with-user-locale "zz"
            (is (= "TEST SETTING - WITH I18N"
                   (description)))))))))

(defsetting test-dynamic-i18n-setting
  (deferred-tru "Test setting - with i18n: {0}" (test-i18n-setting)))

(deftest dynamic-description-test
  (testing "Descriptions with i18n string should update if it depends on another setting's value."
    (mt/with-test-user :crowberto
      (mt/with-mock-i18n-bundles {"zz" {:messages {"Test setting - with i18n: {0}" "TEST SETTING - WITH I18N: {0}"}}}
        (letfn [(description []
                  (some (fn [{:keys [key description]}]
                          (when (= :test-dynamic-i18n-setting key)
                            description))
                        (setting/admin-writable-site-wide-settings)))]
          (test-i18n-setting! "test-setting-value!")
          (is (= "Test setting - with i18n: test-setting-value!"
                 (description)))
          (mt/with-user-locale "zz"
            (is (= "TEST SETTING - WITH I18N: test-setting-value!"
                   (description))))
          (test-i18n-setting! nil))))))


;;; ------------------------------------------------ BOOLEAN SETTINGS ------------------------------------------------

(deftest boolean-settings-tag-test
  (testing "Boolean settings should have correct `:tag` metadata"
    (test-assert-setting-has-tag #'test-boolean-setting 'java.lang.Boolean)))

(deftest boolean-setting-user-facing-info-test
  (is (= {:value nil, :is_env_setting false, :env_name "MB_TEST_BOOLEAN_SETTING", :default nil}
         (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil nil))))

(deftest boolean-setting-env-vars-test
  (testing "values set by env vars should never be shown to the User"
    (let [expected {:value          nil
                    :is_env_setting true
                    :env_name       "MB_TEST_BOOLEAN_SETTING"
                    :default        "Using value of env var $MB_TEST_BOOLEAN_SETTING"}]
      (is (= expected
             (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "true")))

      (testing "env var values should be case-insensitive"
        (is (= expected
               (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "TRUE"))))))

  (testing "if value isn't true / false"
    (testing "getter should throw exception"
      (is (thrown-with-msg?
           Exception
           #"Invalid value for string: must be either \"true\" or \"false\" \(case-insensitive\)"
           (test-boolean-setting! "X"))))

    (testing "user-facing info should just return `nil` instead of failing entirely"
      (is (= {:value          nil
              :is_env_setting true
              :env_name       "MB_TEST_BOOLEAN_SETTING"
              :default        "Using value of env var $MB_TEST_BOOLEAN_SETTING"}
             (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "X"))))))

(deftest set-boolean-setting-test
  (testing "should be able to set value with a string..."
    (is (= "false"
           (test-boolean-setting! "FALSE")))
    (is (= false
           (test-boolean-setting)))

    (testing "... or a boolean"
      (is (= "false"
             (test-boolean-setting! false)))
      (is (= false
             (test-boolean-setting))))))


;;; ------------------------------------------------- JSON SETTINGS --------------------------------------------------

(deftest set-json-setting-test
  (is (= "{\"a\":100,\"b\":200}"
         (test-json-setting! {:a 100, :b 200})))
  (is (= {:a 100, :b 200}
         (test-json-setting))))


;;; -------------------------------------------------- CSV Settings --------------------------------------------------

(defn- fetch-csv-setting-value [v]
  (with-redefs [setting/db-or-cache-value (constantly v)]
    (test-csv-setting)))

(deftest get-csv-setting-test
  (testing "should be able to fetch a simple CSV setting"
    (is (= ["A" "B" "C"]
           (fetch-csv-setting-value "A,B,C"))))

  (testing "should also work if there are quoted values that include commas in them"
    (is  (= ["A" "B" "C1,C2" "ddd"]
            (fetch-csv-setting-value "A,B,\"C1,C2\",ddd")))))

(defn- set-and-fetch-csv-setting-value! [v]
  (test-csv-setting! v)
  {:db-value     (t2/select-one-fn :value setting/Setting :key "test-csv-setting")
   :parsed-value (test-csv-setting)})

(deftest csv-setting-test
  (testing "should be able to correctly set a simple CSV setting"
    (is (= {:db-value "A,B,C", :parsed-value ["A" "B" "C"]}
           (set-and-fetch-csv-setting-value! ["A" "B" "C"]))))

  (testing "should be a able to set a CSV setting with a value that includes commas"
    (is (= {:db-value "A,B,C,\"D1,D2\"", :parsed-value ["A" "B" "C" "D1,D2"]}
           (set-and-fetch-csv-setting-value! ["A" "B" "C" "D1,D2"]))))

  (testing "should be able to set a CSV setting with a value that includes spaces"
    (is (= {:db-value "A,B,C, D ", :parsed-value ["A" "B" "C" " D "]}
           (set-and-fetch-csv-setting-value! ["A" "B" "C" " D "]))))

  (testing "should be a able to set a CSV setting when the string is already CSV-encoded"
    (is (= {:db-value "A,B,C", :parsed-value ["A" "B" "C"]}
           (set-and-fetch-csv-setting-value! "A,B,C"))))

  (testing "should be able to set nil CSV setting"
    (is (= {:db-value nil, :parsed-value nil}
           (set-and-fetch-csv-setting-value! nil))))

  (testing "default values for CSV settings should work"
    (test-csv-setting-with-default! nil)
    (is (= ["A" "B" "C"]
           (test-csv-setting-with-default)))))

(deftest csv-setting-user-facing-value-test
  (testing "`user-facing-value` should be `nil` for CSV Settings with default values"
    (test-csv-setting-with-default! nil)
    (is (= nil
           (setting/user-facing-value :test-csv-setting-with-default)))))


;;; ----------------------------------------------- Encrypted Settings -----------------------------------------------

(defn- actual-value-in-db [setting-key]
  (-> (mdb.query/query {:select [:value]
                        :from   [:setting]
                        :where  [:= :key (name setting-key)]})
      first :value))

(deftest encrypted-settings-test
  (testing "If encryption is *enabled*, make sure Settings get saved as encrypted!"
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (toucan-name! "Sad Can")
      (is (u/base64-string? (actual-value-in-db :toucan-name)))

      (testing "make sure it can be decrypted as well..."
        (is (= "Sad Can"
               (toucan-name)))))

    (testing "But if encryption is not enabled, of course Settings shouldn't get saved as encrypted."
      (encryption-test/with-secret-key nil
        (toucan-name! "Sad Can")
        (is (= "Sad Can"
               (actual-value-in-db :toucan-name)))))))

(deftest previously-encrypted-settings-test
  (testing "Make sure settings that were encrypted don't cause `user-facing-info` to blow up if encyrption key changed"
    (mt/discard-setting-changes [test-json-setting]
      (encryption-test/with-secret-key "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="
        (test-json-setting! {:abc 123})
        (is (not= "{\"abc\":123}"
                  (actual-value-in-db :test-json-setting))))
      (testing (str "If fetching the Setting fails (e.g. because key changed) `user-facing-info` should return `nil` "
                    "rather than failing entirely")
        (encryption-test/with-secret-key nil
          (is (= {:key            :test-json-setting
                  :value          nil
                  :is_env_setting false
                  :env_name       "MB_TEST_JSON_SETTING"
                  :description    "Test setting - this only shows up in dev (4)"
                  :default        nil}
                 (#'setting/user-facing-info (setting/resolve-setting :test-json-setting)))))))))


;;; ----------------------------------------------- TIMESTAMP SETTINGS -----------------------------------------------

(defsetting test-timestamp-setting
  "Test timestamp setting"
  :visibility :internal
  :type :timestamp)

(deftest timestamp-settings-test
  (test-assert-setting-has-tag #'test-timestamp-setting 'java.time.temporal.Temporal)

  (testing "make sure we can set & fetch the value and that it gets serialized/deserialized correctly"
    (test-timestamp-setting! #t "2018-07-11T09:32:00.000Z")
    (is (= #t "2018-07-11T09:32:00.000Z"
           (test-timestamp-setting)))))


;;; ----------------------------------------------- Uncached Settings ------------------------------------------------

(defn clear-settings-last-updated-value-in-db!
  "Deletes the timestamp for the last updated setting from the DB."
  []
  (t2/delete! (t2/table-name Setting) :key setting.cache/settings-last-updated-key))

(defn settings-last-updated-value-in-db
  "Fetches the timestamp of the last updated setting."
  []
  (t2/select-one-fn :value Setting :key setting.cache/settings-last-updated-key))

(defsetting uncached-setting
  "A test setting that should *not* be cached."
  :visibility :internal
  :cache? false)

(deftest uncached-settings-test
  (encryption-test/with-secret-key nil
    (testing "make sure uncached setting still saves to the DB"
      (uncached-setting! "ABCDEF")
      (is (= "ABCDEF"
             (actual-value-in-db "uncached-setting"))))

    (testing "make sure that fetching the Setting always fetches the latest value from the DB"
      (uncached-setting! "ABCDEF")
      (t2/update! Setting {:key "uncached-setting"}
                  {:value "123456"})
      (is (= "123456"
             (uncached-setting))))

    (testing "make sure that updating the setting doesn't update the last-updated timestamp in the cache $$"
      (clear-settings-last-updated-value-in-db!)
      (uncached-setting! "abcdef")
      (is (= nil
             (settings-last-updated-value-in-db))))))


;;; ---------------------------------------------- Runtime Setting Options ----------------------------------------------

(def my-setter :none)

(defsetting test-dynamic-setting
  (deferred-tru "This is a sample sensitive Setting.")
  :type       :integer
  :setter     my-setter
  :visibility (if (some? my-setter) :internal :public))

(deftest var-value-test
  (let [setting-definition (setting/resolve-setting :test-dynamic-setting)]
    (testing "The defsetting macro allows references to vars for inputs"
      (is (= :none (:setter setting-definition)))
      (testing "And these options are used everywhere as expected"
        (is (not (resolve `test-dynamic-setting!)))))
    (testing "The defsetting macro allows arbitrary code forms for values"
      (is (= :internal (:visibility setting-definition))))))


;;; ----------------------------------------------- Sensitive Settings -----------------------------------------------

(defsetting test-sensitive-setting
  (deferred-tru "This is a sample sensitive Setting.")
  :sensitive? true)

(deftest sensitive-settings-test
  (testing "`user-facing-value` should obfuscate sensitive settings"
    (test-sensitive-setting! "ABC123")
    (is (=  "**********23"
            (setting/user-facing-value "test-sensitive-setting"))))

  (testing "Attempting to set a sensitive setting to an obfuscated value should be ignored -- it was probably done accidentally"
    (test-sensitive-setting! "123456")
    (test-sensitive-setting! "**********56")
    (is (= "123456"
           (test-sensitive-setting)))))


;;; ------------------------------------------------- CACHE SYNCING --------------------------------------------------

(deftest cache-sync-test
  (testing "make sure that if for some reason the cache gets out of sync it will reset so we can still set new settings values (#4178)"
    ;; clear out any existing values of `toucan-name`
    (t2/delete! (t2/table-name setting/Setting) :key "toucan-name")
    ;; restore the cache
    (setting.cache/restore-cache-if-needed!)
    ;; now set a value for the `toucan-name` setting the wrong way
    (t2/insert! setting/Setting {:key "toucan-name", :value "Reggae"})
    ;; ok, now try to set the Setting the correct way
    (toucan-name! "Banana Beak")
    ;; ok, make sure the setting was set
    (is (= "Banana Beak"
           (toucan-name)))))


;;; ------------------------------------------------- Setting Visibility ------------------------------------------------

(defsetting test-internal-setting
  "test Setting"
  :visibility :internal)

(defsetting test-public-setting
  (deferred-tru "test Setting")
  :visibility :public)

(defsetting test-authenticated-setting
  (deferred-tru "test Setting")
  :visibility :authenticated)

(defsetting test-settings-manager-setting
  (deferred-tru "test Setting")
  :visibility :settings-manager)

(defsetting test-admin-setting
  (deferred-tru "test Setting")
  :visibility :admin)

(deftest can-read-setting-test
  (testing "no authenticated user"
    (mt/with-current-user nil
      (doseq [[setting expected] {:test-public-setting           true
                                  :test-authenticated-setting    false
                                  :test-settings-manager-setting false
                                  :test-admin-setting            false}]
        (testing setting
          (is (= expected (setting/can-read-setting? setting (setting/current-user-readable-visibilities))))))))
  (testing "authenticated non-admin user"
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [[setting expected] {:test-public-setting           true
                                  :test-authenticated-setting    true
                                  :test-settings-manager-setting false
                                  :test-admin-setting            false}]
        (testing setting
          (is (= expected (setting/can-read-setting? setting (setting/current-user-readable-visibilities))))))))
  (testing "non-admin user with advanced setting access"
    (with-redefs [setting/has-advanced-setting-access? (constantly true)]
      (mt/with-current-user (mt/user->id :rasta)
        (doseq [[setting expected] {:test-public-setting           true
                                    :test-authenticated-setting    true
                                    :test-settings-manager-setting true
                                    :test-admin-setting            false}]
          (testing setting
            (is (= expected (setting/can-read-setting? setting (setting/current-user-readable-visibilities)))))))))
  (testing "admin user"
    (mt/with-current-user (mt/user->id :crowberto)
      (doseq [[setting expected] {:test-public-setting           true
                                  :test-authenticated-setting    true
                                  :test-settings-manager-setting true
                                  :test-admin-setting            true}]
        (testing setting
          (is (= expected (setting/can-read-setting? setting (setting/current-user-readable-visibilities)))))))))

;;; ------------------------------------------------- DB-local Settings ------------------------------------------------

(defsetting ^:private test-database-local-only-setting
  "test Setting"
  :visibility     :internal
  :type           :integer
  :database-local :only)

(defsetting ^:private test-database-local-allowed-setting
  (deferred-tru "test Setting")
  :visibility     :authenticated
  :type           :integer
  :database-local :allowed)

(defsetting ^:private test-database-local-never-setting
  "test Setting"
  :visibility :internal
  :type       :integer) ; `:never` should be the default

(deftest database-local-settings-test
  (doseq [[database-local-type {:keys [setting-name setting-getter-fn setting-setter-fn returns]}]
          {:only    {:setting-name      :test-database-local-only-setting
                     :setting-getter-fn test-database-local-only-setting
                     :setting-setter-fn test-database-local-only-setting!
                     :returns           [:database-local]}
           :allowed {:setting-name      :test-database-local-allowed-setting
                     :setting-getter-fn test-database-local-allowed-setting
                     :setting-setter-fn test-database-local-allowed-setting!
                     :returns           [:database-local :site-wide]}
           :never   {:setting-name      :test-database-local-never-setting
                     :setting-getter-fn test-database-local-never-setting
                     :setting-setter-fn test-database-local-never-setting!
                     :returns           [:site-wide]}}]
    (testing (format "A Setting with :database-local = %s" database-local-type)
      (doseq [site-wide-value         [1 nil]
              database-local-value    [2 nil]
              do-with-site-wide-value [(fn [thunk]
                                         (testing "\nsite-wide value set in application DB"
                                           ;; Set the setting directly instead of using
                                           ;; [[mt/with-temporary-setting-values]] because that blows up when the
                                           ;; Setting is Database-local-only
                                           (t2/delete! Setting :key (name setting-name))
                                           (when site-wide-value
                                             (t2/insert! Setting :key (name setting-name), :value (str site-wide-value)))
                                           (setting.cache/restore-cache!)
                                           (try
                                             (thunk)
                                             (finally
                                               (t2/delete! Setting :key (name setting-name))
                                               (setting.cache/restore-cache!)))))
                                       (fn [thunk]
                                         (tu/do-with-temp-env-var-value!
                                          (setting/setting-env-map-name setting-name)
                                          site-wide-value
                                          thunk))]]
        ;; clear out Setting if it was already set for some reason (except for `:only` where this is explicitly
        ;; disallowed)
        (when-not (= database-local-type :only)
          (setting-setter-fn nil))
        ;; now set the Site-wide value
        (testing (format "\nSite-wide value = %s\nDatabase-local value = %s"
                         (pr-str site-wide-value) (pr-str database-local-value))
          (do-with-site-wide-value
           (fn []
             ;; set the database-local-value
             (binding [setting/*database-local-values* {setting-name (some-> database-local-value str)}]
               ;; now fetch the value
               (let [[expected-value-type expected-value] (some (fn [return-value-type]
                                                                  (when-let [value ({:database-local database-local-value
                                                                                     :site-wide      site-wide-value}
                                                                                    return-value-type)]
                                                                    [return-value-type value]))
                                                                returns)]
                 (testing (format "\nShould return %s value %s" (pr-str expected-value-type) (pr-str expected-value))
                   (is (= expected-value
                          (setting-getter-fn)))))))))))))

(defsetting ^:private test-boolean-database-local-setting
  "test Setting"
  :visibility     :internal
  :type           :boolean
  :database-local :allowed)

(deftest boolean-database-local-settings-test
  (testing "Boolean Database-local Settings\n"
    (testing "Site-wide value is `true`"
      (test-boolean-database-local-setting! true)
      (is (= true
             (test-boolean-database-local-setting))))
    (testing "Site-wide value is `false`"
      (test-boolean-database-local-setting! false)
      (is (= false
             (test-boolean-database-local-setting)))
      (testing "Database-local value is `true`"
        (binding [setting/*database-local-values* {:test-boolean-database-local-setting "true"}]
          (is (= true
                 (test-boolean-database-local-setting)))))
      (testing "Database-local value is explicitly set to `nil` -- fall back to site-wide value"
        (binding [setting/*database-local-values* {:test-boolean-database-local-setting nil}]
          (is (= false
                 (test-boolean-database-local-setting))))))))

(defsetting ^:private test-database-local-only-setting-with-default
  (deferred-tru "test Setting")
  :visibility     :authenticated
  :database-local :only
  :default        "DEFAULT")

(deftest database-local-only-settings-test
  (testing "Disallow setting Database-local-only Settings"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Site-wide values are not allowed for Setting :test-database-local-only-setting"
         (test-database-local-only-setting! 2))))

  (testing "Default values should be allowed for Database-local-only Settings"
    (is (= "DEFAULT"
           (test-database-local-only-setting-with-default)))
    (binding [setting/*database-local-values* {:test-database-local-only-setting-with-default "WOW"}]
      (is (= "WOW"
             (test-database-local-only-setting-with-default))))))

(deftest database-local-settings-api-functions-test
  ;; we'll use `::not-present` below to signify that the Setting isn't returned AT ALL (as opposed to being returned
  ;; with a `nil` value)
  (mt/with-test-user :crowberto
    (doseq [[fn-name f] {`setting/writable-settings
                         (fn [k]
                           (let [m (into {} (map (juxt :key :value)) (setting/writable-settings))]
                             (get m k ::not-present)))

                         `setting/user-readable-values-map
                         (fn [k]
                           (get (setting/user-readable-values-map #{:authenticated}) k ::not-present))}]
      (testing fn-name
        (testing "should return Database-local-allowed Settings (site-wide-value only)"
          (mt/with-temporary-setting-values [test-database-local-allowed-setting 2]
            (binding [setting/*database-local-values* {:test-database-local-allowed-setting "1"}]
              (is (= 2
                     (f :test-database-local-allowed-setting))))))
        (testing "should not return Database-local-only Settings regardless of visibility even if they have a default value"
          (is (= ::not-present
                 (f :test-database-local-only-setting-with-default))))))))


;;; ------------------------------------------------- User-local Settings ----------------------------------------------

(defsetting test-user-local-only-setting
  (deferred-tru  "test Setting")
  :visibility :authenticated
  :user-local :only)

(defsetting test-user-local-allowed-setting
  (deferred-tru "test Setting")
  :visibility :authenticated
  :user-local :allowed)

(defsetting ^:private test-user-local-never-setting
  (deferred-tru "test Setting")
  :visibility :internal) ; `:never` should be the default

(deftest user-local-settings-test
  (testing "Reading and writing a user-local-only setting in the context of a user uses the user-local value"
    (mt/with-current-user (mt/user->id :rasta)
      (test-user-local-only-setting! "ABC")
      (is (= "ABC" (test-user-local-only-setting))))
    (mt/with-current-user (mt/user->id :crowberto)
      (test-user-local-only-setting! "DEF")
      (is (= "DEF" (test-user-local-only-setting))))
    (mt/with-current-user (mt/user->id :rasta)
      (is (= "ABC" (test-user-local-only-setting)))))

  (testing "A user-local-only setting cannot have a site-wide value"
    (is (thrown-with-msg? Throwable #"Site-wide values are not allowed" (test-user-local-only-setting! "ABC"))))

  (testing "Reading and writing a user-local-allowed setting in the context of a user uses the user-local value"
    ;; TODO: mt/with-temporary-setting-values only affects site-wide value, we should figure out whether it should also
    ;; affect user-local settings.
    (mt/with-temporary-setting-values [test-user-local-allowed-setting nil]
      (mt/with-current-user (mt/user->id :rasta)
        (test-user-local-allowed-setting! "ABC")
        (is (= "ABC" (test-user-local-allowed-setting))))
      (mt/with-current-user (mt/user->id :crowberto)
        (test-user-local-allowed-setting! "DEF")
        (is (= "DEF" (test-user-local-allowed-setting))))
      (mt/with-current-user (mt/user->id :rasta)
        (is (= "ABC" (test-user-local-allowed-setting))))
      ;; Calling the setter when not in the context of a user should set the site-wide value
      (is (nil? (test-user-local-allowed-setting)))
      (test-user-local-allowed-setting! "GHI")
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= "DEF" (test-user-local-allowed-setting))))
      (mt/with-current-user (mt/user->id :rasta)
        (is (= "ABC" (test-user-local-allowed-setting))))))

  (testing "Reading and writing a user-local-never setting in the context of a user uses the site-wide value"
    (mt/with-current-user (mt/user->id :rasta)
      (test-user-local-never-setting! "ABC")
      (is (= "ABC" (test-user-local-never-setting))))
    (mt/with-current-user (mt/user->id :crowberto)
      (test-user-local-never-setting! "DEF")
      (is (= "DEF" (test-user-local-never-setting))))
    (mt/with-current-user (mt/user->id :rasta)
      (is (= "DEF" (test-user-local-never-setting))))
    (is (= "DEF" (test-user-local-never-setting))))

  (testing "A setting cannot be defined to allow both user-local and database-local values"
    (is (thrown-with-msg?
         Throwable
         #"Setting .* allows both user-local and database-local values; this is not supported"
         (defsetting test-user-local-and-db-local-setting
           (deferred-tru "test Setting")
           :user-local     :allowed
           :database-local :allowed)))))

(deftest identity-hash-test
  (testing "Settings are hashed based on the key"
    (mt/with-temporary-setting-values [test-setting-1 "123"
                                       test-setting-2 "123"]
      (is (= "5f7f150c"
             (serdes/raw-hash ["test-setting-1"])
             (serdes/identity-hash (t2/select-one Setting :key "test-setting-1")))))))

(deftest enabled?-test
  (testing "Settings can be disabled"
    (testing "With no default returns nil"
      (is (nil? (test-enabled-setting-no-default)))
      (testing "Updating the value throws an exception"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting test-enabled-setting-no-default is not enabled"
             (test-enabled-setting-no-default! "a value")))))
    (testing "Returns default value"
      (is (= "setting-default" (test-enabled-setting-default)))
      (testing "Updating the value throws an exception"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting test-enabled-setting-default is not enabled"
             (test-enabled-setting-default! "a value"))))))
  (testing "When enabled, the setting can be read and written as normal"
    (binding [*enabled?* true]
      (test-enabled-setting-default! "custom")
      (test-enabled-setting-no-default! "custom")
      (is (= "custom" (test-enabled-setting-default)))
      (is (= "custom" (test-enabled-setting-no-default))))))

(deftest feature-test
  (testing "Settings can be assigned an Enterprise feature flag, required for them to be enabled"
    (mt/with-premium-features #{:test-feature}
      (test-feature-setting! "custom")
      (is (= "custom" (test-feature-setting))))

    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting test-feature-setting is not enabled because feature :test-feature is not available"
           (test-feature-setting! "custom 2")))
      (is (= "setting-default" (test-feature-setting)))))

  (testing "A setting cannot have both the :enabled? and :feature options at once"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Setting :test-enabled-and-feature uses both :enabled\? and :feature options, which are mutually exclusive"
         (defsetting test-enabled-and-feature
           "Setting with both :enabled? and :feature options"
           :visibility :internal
           :type       :string
           :default    "setting-default"
           :enabled?   (fn [] false)
           :feature    :test-feature)))))


;;; ------------------------------------------------- Misc tests -------------------------------------------------------

(defsetting ^:private test-no-default-setting
  "Setting with a falsey default"
  :visibility :internal
  :type       :boolean)

(defsetting ^:private test-falsey-default-setting
  "Setting with a falsey default"
  :visibility :internal
  :type       :boolean
  :default    false)

(deftest ^:parallel falsey-default-setting-test
  (testing "We should use default values even if they are falsey"
    (is (= false (test-falsey-default-setting))))
  (testing "We should return no value for an uninitialized setting with no default or initializer"
    (is (= nil (test-no-default-setting)))))

(defsetting ^:private test-integer-setting
  "test Setting"
  :visibility :internal
  :type       :integer)

(deftest integer-setting-test
  (testing "Should be able to set integer setting with a string"
    (test-integer-setting! "100")
    (is (= 100
           (test-integer-setting)))
    (testing "should be able to set to a negative number (thanks Howon for spotting this)"
      (test-integer-setting! "-2")
      (is (= -2
             (test-integer-setting))))))

(deftest retired-settings-test
  (testing "Should not be able to define a setting with a retired name"
    (with-redefs [setting/retired-setting-names #{"retired-setting"}]
      (try
        (defsetting retired-setting (deferred-tru "A retired setting name"))
        (catch Exception e
          (is (= "Setting name 'retired-setting' is retired; use a different name instead"
                 (ex-message e))))))))

(deftest duplicated-setting-name
  (testing "can re-register a setting in the same ns (redefining or reloading ns)"
    (is (defsetting foo (deferred-tru "A testing setting") :visibility :public))
    (is (defsetting foo (deferred-tru "A testing setting") :visibility :public)))
  (testing "if attempt to register in a different ns throws an error"
    (let [current-ns (ns-name *ns*)]
      (try
        (ns nested-setting-test
          (:require
           [metabase.models.setting :refer [defsetting]]
           [metabase.util.i18n :as i18n :refer [deferred-tru]]))
        (defsetting foo (deferred-tru "A testing setting") :visibility :public)
        (catch Exception e
          (is (=? {:existing-setting
                   {:description (deferred-tru "A testing setting")
                    :name        :foo
                    :munged-name "foo"
                    :type        :string
                    :sensitive?  false
                    :tag         'java.lang.String
                    :namespace   current-ns
                    :visibility  :public}}
                  (ex-data e)))
          (is (= (str "Setting :foo already registered in " current-ns)
                 (ex-message e))))
        (finally (in-ns current-ns))))))

(defsetting test-setting-with-question-mark?
  "Test setting - this only shows up in dev (6)"
  :visibility :internal)

(deftest munged-setting-name-test
  (testing "Only valid characters used for environment lookup"
    (is (nil? (test-setting-with-question-mark?)))
    ;; note now question mark on the environmental setting
    (with-redefs [env/env {:mb-test-setting-with-question-mark "resolved"}]
      (binding [config/*disable-setting-cache* false]
        (is (= "resolved" (test-setting-with-question-mark?))))))
  (testing "Setting a setting that would munge the same throws an error"
    (is (= {:existing-setting
            {:name :test-setting-with-question-mark?
             :munged-name "test-setting-with-question-mark"}
            :new-setting
            {:name :test-setting-with-question-mark????
             :munged-name "test-setting-with-question-mark"}}
           (m/map-vals #(select-keys % [:name :munged-name])
                       (try (defsetting test-setting-with-question-mark????
                              "Test setting - this only shows up in dev (6)"
                              :visibility :internal)
                            (catch Exception e (ex-data e)))))))
  (testing "Munge collision on first definition"
    (defsetting test-setting-normal
      "Test setting - this only shows up in dev (6)"
      :visibility :internal)
    (is (= {:existing-setting {:name :test-setting-normal, :munged-name "test-setting-normal"},
            :new-setting {:name :test-setting-normal??, :munged-name "test-setting-normal"}}
           (m/map-vals #(select-keys % [:name :munged-name])
                       (try (defsetting test-setting-normal??
                              "Test setting - this only shows up in dev (6)"
                              :visibility :internal)
                            (catch Exception e (ex-data e)))))))
  (testing "Munge collision on second definition"
    (defsetting test-setting-normal-1??
      "Test setting - this only shows up in dev (6)"
      :visibility :internal)
    (is (= {:new-setting {:munged-name "test-setting-normal-1", :name :test-setting-normal-1},
             :existing-setting {:munged-name "test-setting-normal-1", :name :test-setting-normal-1??}}
           (m/map-vals #(select-keys % [:name :munged-name])
                       (try (defsetting test-setting-normal-1
                              "Test setting - this only shows up in dev (6)"
                              :visibility :internal)
                            (catch Exception e (ex-data e)))))))
  (testing "Removes characters not-compliant with shells"
    (is (= "aa1aa-b2b_cc3c"
           (#'setting/munge-setting-name "aa1'aa@#?-b2@b_cc'3?c?")))))

(deftest validate-default-value-for-type-test
  (letfn [(validate [tag default]
            (@#'setting/validate-default-value-for-type
             {:tag tag, :default default, :name :a-setting, :type :fake-type}))]
    (testing "No default value"
      (is (nil? (validate `String nil))))
    (testing "No tag"
      (is (nil? (validate nil "abc"))))
    (testing "tag is not a symbol or string"
      (is (thrown-with-msg?
           AssertionError
           #"Setting :tag should be a symbol or string, got: \^clojure\.lang\.Keyword :string"
           (validate :string "Green Friend"))))
    (doseq [[tag valid-tag?]     {"String"           false
                                  "java.lang.String" true
                                  'STRING            false
                                  `str               false
                                  `String            true}
            [value valid-value?] {"Green Friend" true
                                  :green-friend  false}]
      (testing (format "Tag = %s (valid = %b)" (pr-str tag) valid-tag?)
        (testing (format "Value = %s (valid = %b)" (pr-str value) valid-value?)
          (cond
            (and valid-tag? valid-value?)
            (is (nil? (validate tag value)))

            (not valid-tag?)
            (is (thrown-with-msg?
                 Exception
                 #"Cannot resolve :tag .+ to a class"
                 (validate tag value)))

            (not valid-value?)
            (is (thrown-with-msg?
                 Exception
                 #"Wrong :default type: got \^clojure\.lang\.Keyword :green-friend, but expected a java\.lang\.String"
                 (validate tag value)))))))))

(deftest validate-description-translation-test
  (with-redefs [setting/ns-in-test? (constantly false)]
    (testing "When not in a test, defsetting descriptions must be i18n'ed"
      (try
        (walk/macroexpand-all
         `(defsetting ~'test-asdf-asdf-asdf
            "untranslated description"))
        (catch Exception e
          (is (re-matches #"defsetting docstrings must be a \*deferred\* i18n form.*"
                          (:cause (Throwable->map e)))))))))

(defsetting test-setting-audit-never
 "Test setting with no auditing"
  :audit :never)

(defsetting test-setting-audit-raw-value
  "Test setting with auditing raw values"
  :type  :integer
  :audit :raw-value)

(defsetting test-setting-audit-getter
  "Test setting with auditing values returned from getter"
  :type   :string
  :getter (constantly "GETTER VALUE")
  :audit  :getter)

(defsetting test-sensitive-setting-audit
  "Test that a sensitive setting has its value obfuscated before being audited"
  :type       :string
  :sensitive? true
  :audit      :getter)

(deftest setting-audit-test
  (mt/with-premium-features #{:audit-app}
    (let [last-audit-event-fn #(t2/select-one [:model/AuditLog :topic :user_id :model :details]
                                              :topic :setting-update
                                              {:order-by [[:id :desc]]})]
      (testing "Settings are audited by default without their value included"
        (mt/with-test-user :rasta
          (test-setting-1! "DON'T INCLUDE THIS VALUE"))
        (is (= {:topic   :setting-update
                :user_id  (mt/user->id :rasta)
                :model   "Setting"
                :details {:key "test-setting-1"}}
               (last-audit-event-fn))))

      (testing "Auditing can be disabled with `:audit :never`"
        (test-setting-audit-never! "DON'T AUDIT")
        (is (not= "test-setting-audit-never"
                  (-> (last-audit-event-fn) :details :key))))

      (testing "Raw values (as stored in the DB) can be logged with `:audit :raw-value`"
        (mt/with-temporary-setting-values [test-setting-audit-raw-value 99]
          (test-setting-audit-raw-value! 100)
          (is (= {:topic   :setting-update
                  :user_id  nil
                  :model   "Setting"
                  :details {:key            "test-setting-audit-raw-value"
                            :previous-value "99"
                            :new-value      "100"}}
                 (last-audit-event-fn)))))

      (testing "Values returned from the setting's getter can be logged with `:audit :getter`"
        (mt/with-temporary-setting-values [test-setting-audit-getter "PREVIOUS VALUE"]
          (test-setting-audit-getter! "NEW RAW VALUE")
          (is (= {:topic   :setting-update
                  :user_id  nil
                  :model   "Setting"
                  :details {:key            "test-setting-audit-getter"
                            :previous-value "GETTER VALUE"
                            :new-value      "GETTER VALUE"}}
                 (last-audit-event-fn)))))

      (testing "Sensitive settings have their values obfuscated automatically"
        (mt/with-temporary-setting-values [test-sensitive-setting-audit nil]
          (test-sensitive-setting-audit! "old password")
          (test-sensitive-setting-audit! "new password")
          (is (= {:topic   :setting-update
                  :user_id  nil
                  :model   "Setting"
                  :details {:key            "test-sensitive-setting-audit"
                            :previous-value "**********rd"
                            :new-value      "**********rd"}}
                 (last-audit-event-fn))))))))

(defsetting test-user-local-only-audited-setting
  (deferred-tru  "Audited user-local setting")
  :visibility :authenticated
  :user-local :only
  :audit      :raw-value)

(deftest user-local-settings-audit-test
  (mt/with-premium-features #{:audit-app}
    (testing "User-local settings are not audited by default"
      (mt/with-test-user :rasta
        (test-user-local-only-setting! "DON'T AUDIT"))
      (is (not= "test-user-local-only-setting"
                (-> (mt/latest-audit-log-entry :setting-update) :details :key))))

    (testing "User-local settings can be audited"
      (mt/with-test-user :rasta
        (mt/with-temporary-setting-values [test-user-local-only-audited-setting nil]
          (test-user-local-only-audited-setting! "AUDIT ME")
          (is (= {:topic   :setting-update
                  :user_id  (mt/user->id :rasta)
                  :model_id nil
                  :model   "Setting"
                  :details {:key            "test-user-local-only-audited-setting"
                            :previous-value nil
                            :new-value      "AUDIT ME"}}
                 (mt/latest-audit-log-entry :setting-update))))))))

(defsetting exported-setting
  "This setting would be serialized"
  :export? true
  ;; make sure it's internal so it doesn't interfere with export test
  :visibility :internal)

(defsetting non-exported-setting
  "This setting would not be serialized"
  :export? false)

(deftest export?-test
  (testing "The :export? property is exposed"
    (is (#'setting/export? :exported-setting))
    (is (not (#'setting/export? :non-exported-setting))))

  (testing "By default settings are not exported"
    (is (not (#'setting/export? :test-setting-1)))))

(deftest realize-throwing-test
  (testing "The realize function ensures all nested lazy values are calculated"
    (let [ok (lazy-seq (cons 1 (lazy-seq (list 2))))
          ok-deep (lazy-seq (cons 1 (lazy-seq (list (lazy-seq (list 2))))))
          shallow (lazy-seq (cons 1 (throw (ex-info "Surprise!" {}))))
          deep (lazy-seq (cons 1 (cons 2 (list (lazy-seq (throw (ex-info "Surprise!" {})))))))]
      (is (= '(1 2) (#'setting/realize ok)))
      (is (= '(1 (2)) (#'setting/realize ok-deep)))
      (doseq [x [shallow deep]]
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"^Surprise!$"
              (#'setting/realize x)))))))

(defn- validation-setting-symbol [format]
  (symbol (str "test-" (name format) "-validation-setting")))

(defmacro define-setting-for-type [format]
  `(defsetting ~(validation-setting-symbol format)
     "Setting to test validation of this format - this only shows up in dev"
     :type ~(keyword (name format))))

(defmacro get-parse-exception [format raw-value]
  `(mt/with-temp-env-var-value! [~(symbol (str "mb-" (validation-setting-symbol format))) ~raw-value]
     (try
       (setting/validate-settings-formatting!)
       nil
       (catch java.lang.Exception e# e#))))

(defn- assert-parser-exception! [format-type ex cause-message]
  (is (= (format "Invalid %s configuration for setting: %s"
                 (u/upper-case-en (name format-type))
                 (validation-setting-symbol format-type))
         (ex-message ex)))
  (is (= cause-message (ex-message (ex-cause ex)))))

(define-setting-for-type :json)

(deftest valid-json-setting-test
  (testing "Validation is a no-op if the JSON is valid"
    (is (nil? (get-parse-exception :json "[1, 2]")))))

(deftest invalid-json-setting-test
  (testing "Validation will throw an exception if a setting has invalid JSON via an environment variable"
    (let [ex (get-parse-exception :json "[1, 2,")]
      (assert-parser-exception!
        :json ex
        ;; TODO it would be safe to expose the raw Jackson exception here, we could improve redaction logic
        #_(str "Unexpected end-of-input within/between Array entries\n"
               " at [Source: REDACTED (`StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION` disabled); line: 1, column: 7]")
        "Error of type class com.fasterxml.jackson.core.JsonParseException thrown while parsing a setting"))))

(deftest sensitive-data-redacted-test
  (testing "The exception thrown by validation will not contain sensitive info from the config"
    (let [password "$ekr3t"
          ex (get-parse-exception :json (str "[" password))]
      (is (not (str/includes? (pr-str ex) password)))
      (assert-parser-exception!
        :json ex "Error of type class com.fasterxml.jackson.core.JsonParseException thrown while parsing a setting"))))

(deftest safe-exceptions-not-redacted-test
  (testing "An exception known not to contain sensitive info will not be redacted"
    (let [password "123abc"
          ex (get-parse-exception :json "{\"a\": \"123abc\", \"b\": 2")]
      (is (not (str/includes? (pr-str ex) password)))
      (assert-parser-exception!
        :json ex
        (str "Unexpected end-of-input: expected close marker for Object (start marker at [Source: REDACTED"
             " (`StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION` disabled); line: 1, column: 1])\n"
             " at [Source: REDACTED (`StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION` disabled); line: 1, column: 23]")))))

(define-setting-for-type :csv)

(deftest valid-csv-setting-test
  (testing "Validation is a no-op if the CSV is valid"
    (is (nil? (get-parse-exception :csv "1, 2")))))

(deftest invalid-csv-setting-eof-test
  (testing "Validation will throw an exception if a setting has invalid CSV via an environment variable"
    (let [ex (get-parse-exception :csv "1,2,2,\",,")]
      (assert-parser-exception!
        :csv ex "CSV error (unexpected end of file)"))))

(deftest invalid-csv-setting-char-test
  (testing "Validation will throw an exception if a setting has invalid CSV via an environment variable"
    (let [ex (get-parse-exception :csv "\"1\"$ekr3t")]
      (assert-parser-exception!
        :csv ex
        ;; we don't expose the raw exception here, as it would give away the first character of the secret
        #_"CSV error (unexpected character: $)"
        "Error of type class java.lang.Exception thrown while parsing a setting"))))

(define-setting-for-type :boolean)

(deftest valid-boolean-setting-test
  (testing "Validation is a no-op if the string represents a boolean"
    (is (nil? (get-parse-exception :boolean "")))
    (is (nil? (get-parse-exception :boolean "true")))
    (is (nil? (get-parse-exception :boolean "false")))))

(deftest invalid-boolean-setting-test
  (doseq [raw-value ["0" "1" "2" "a" ":b" "[true]"]]
    (testing (format "Validation will throw an exception when trying to parse %s as a boolean" raw-value)
      (let [ex (get-parse-exception :boolean raw-value)]
        (assert-parser-exception!
          :boolean ex "Invalid value for string: must be either \"true\" or \"false\" (case-insensitive).")))))

(define-setting-for-type :double)

(deftest valid-double-setting-test
  (testing "Validation is a no-op if the string represents a double"
    (is (nil? (get-parse-exception :double "1")))
    (is (nil? (get-parse-exception :double "-1")))
    (is (nil? (get-parse-exception :double "2.4")))
    (is (nil? (get-parse-exception :double "1e9")))))

(deftest invalid-double-setting-test
  (doseq [raw-value ["a" "1.2.3" "0x3" "[2]"]]
    (testing (format "Validation will throw an exception when trying to parse %s as a double" raw-value)
      (let [ex (get-parse-exception :double raw-value)]
        (assert-parser-exception!
          #_"For input string: \"{raw-value}\""
          :double ex "Error of type class java.lang.NumberFormatException thrown while parsing a setting")))))

(define-setting-for-type :keyword)

(deftest valid-keyword-setting-test
  (testing "Validation is a no-op if the string represents a keyword"
    (is (nil? (get-parse-exception :keyword "1")))
    (is (nil? (get-parse-exception :keyword "a")))
    (is (nil? (get-parse-exception :keyword "a/b")))
    ;; [[keyword]] actually accepts any string without complaint, there is no way to have a parse failure
    (is (nil? (get-parse-exception :keyword ":a/b")))
    (is (nil? (get-parse-exception :keyword "a/b/c")))
    (is (nil? (get-parse-exception :keyword "\"")))))

(define-setting-for-type :integer)

(deftest valid-integer-setting-test
  (testing "Validation is a no-op if the string represents a integer"
    (is (nil? (get-parse-exception :integer "1")))
    (is (nil? (get-parse-exception :integer "-1")))))

(deftest invalid-integer-setting-test
  (doseq [raw-value ["a" "2.4" "1e9" "1.2.3" "0x3" "[2]"]]
    (testing (format "Validation will throw an exception when trying to parse %s as a integer" raw-value)
      (let [ex (get-parse-exception :integer raw-value)]
        (assert-parser-exception!
          #_"For input string: \"{raw-value}\""
          :integer ex "Error of type class java.lang.NumberFormatException thrown while parsing a setting")))))

(define-setting-for-type :positive-integer)

(deftest valid-positive-integer-setting-test
  (testing "Validation is a no-op if the string represents a positive-integer"
    (is (nil? (get-parse-exception :positive-integer "1")))
    ;; somewhat un-intuitively this is legal input, and parses to nil
    (is (nil? (get-parse-exception :positive-integer "-1")))))

(deftest invalid-positive-integer-setting-test
  (doseq [raw-value ["a" "2.4" "1e9" "1.2.3" "0x3" "[2]"]]
    (testing (format "Validation will throw an exception when trying to parse %s as a positive-integer" raw-value)
      (let [ex (get-parse-exception :positive-integer raw-value)]
        (assert-parser-exception!
          #_"For input string: \"{raw-value}\""
          :positive-integer ex "Error of type class java.lang.NumberFormatException thrown while parsing a setting")))))

(define-setting-for-type :timestamp)

(deftest valid-timestamp-setting-test
  (testing "Validation is a no-op if the string represents a timestamp"
    (is (nil? (get-parse-exception :timestamp "2024-01-01")))))

(deftest invalid-timestamp-setting-test
  (testing "Validation will throw an exception when trying to parse an invalid timestamp"
    (let [ex (get-parse-exception :timestamp "2024-01-48")]
      (assert-parser-exception!
        #_"Text '{raw-value}' could not be parsed, unparsed text found at index 0"
        :timestamp ex "Error of type class java.time.format.DateTimeParseException thrown while parsing a setting"))))

(defn ns-validation-setting-symbol [format]
  (symbol "metabase.models.setting-test" (name (validation-setting-symbol format))))

(deftest validation-completeness-test
  (let [string-formats #{:string :metabase.public-settings/uuid-nonce}
        formats-to-check (remove string-formats (keys (methods setting/get-value-of-type)))]

    (testing "Every settings format has its redaction predicate defined"
      (doseq [format formats-to-check]
        (testing (format "We have defined a redaction multimethod for the %s format" format)
          (is (some? (format (methods setting/may-contain-raw-token?)))))))

    (testing "Every settings format has tests for its validation"
      (doseq [format formats-to-check]
        ;; We operate on trust that tests are added along with this var
        (testing (format "We have defined a setting for the %s validation tests" format)
          (is (var? (resolve (ns-validation-setting-symbol format)))))))))
