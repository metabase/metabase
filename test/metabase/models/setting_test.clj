(ns metabase.models.setting-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [environ.core :as env]
   [medley.core :as m]
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
   [schema.core :as s]
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
           (setting/user-facing-value :test-setting-calculated-getter)))))

(deftest do-not-define-setter-function-for-setter-none-test
  (testing "Settings with `:setter` `:none` should not have a setter function defined"
    (testing "Sanity check: getter should be defined"
      (is (some? (resolve `test-setting-calculated-getter))))
    (is (not (resolve `test-setting-calculated-getter!)))))

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
      (tu/do-with-temp-env-var-value
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
                                         (tu/do-with-temp-env-var-value
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
      (testing "Updating the value succeeds but still get nil because no default"
        (test-enabled-setting-default! "a value")
        (is (nil? (test-enabled-setting-no-default)))))
    (testing "Returns default value"
      (is (= "setting-default" (test-enabled-setting-default)))
      (testing "Updating the value succeeds but still get default"
        (test-enabled-setting-default! "non-default-value")
        (is (= "setting-default" (test-enabled-setting-default))))))
  (testing "When enabled get the value"
    (test-enabled-setting-default! "custom")
    (test-enabled-setting-no-default! "custom")
    (binding [*enabled?* true]
      (is (= "custom" (test-enabled-setting-default)))
      (is (= "custom" (test-enabled-setting-no-default))))))


;;; ------------------------------------------------- Misc tests -------------------------------------------------------

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
          (is (schema= {:existing-setting
                        {:description (s/eq (deferred-tru "A testing setting"))
                         :name        (s/eq :foo)
                         :munged-name (s/eq "foo")
                         :type        (s/eq :string)
                         :sensitive?  (s/eq false)
                         :tag         (s/eq 'java.lang.String)
                         :namespace   (s/eq current-ns)
                         :visibility  (s/eq :public)
                         s/Keyword s/Any}}
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
      (binding [setting/*disable-cache* false]
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
  (with-redefs [metabase.models.setting/in-test? (constantly false)]
    (testing "When not in a test, defsetting descriptions must be i18n'ed"
      (try
        (walk/macroexpand-all
         `(defsetting ~'test-asdf-asdf-asdf
            "untranslated description"))
        (catch Exception e
          (is (re-matches #"defsetting docstrings must be a \*deferred\* i18n form.*"
                          (:cause (Throwable->map e)))))))))
