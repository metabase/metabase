(ns metabase.models.setting-test
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models.setting :as setting :refer [defsetting Setting]]
            [metabase.models.setting.cache :as cache]
            [metabase.test
             [fixtures :as fixtures]
             [util :refer :all]]
            [metabase.util
             [encryption-test :as encryption-test]
             [i18n :as i18n :refer [deferred-tru]]]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

;; ## TEST SETTINGS DEFINITIONS
;; TODO! These don't get loaded by `lein ring server` unless this file is touched
;; so if you run unit tests while `lein ring server` is running (i.e., no Jetty server is started)
;; these tests will fail. FIXME

(defsetting test-setting-1
  (deferred-tru "Test setting - this only shows up in dev (1)"))

(defsetting test-setting-2
  (deferred-tru "Test setting - this only shows up in dev (2)")
  :default "[Default Value]")

(defsetting test-setting-3
  (deferred-tru "Test setting - this only shows up in dev (3)")
  :visibility :internal)

(defsetting ^:private test-boolean-setting
  "Test setting - this only shows up in dev (3)"
  :visibility :internal
  :type :boolean)

(defsetting ^:private test-json-setting
  (deferred-tru "Test setting - this only shows up in dev (4)")
  :type :json)

(defsetting ^:private test-csv-setting
  "Test setting - this only shows up in dev (5)"
  :visibility :internal
  :type :csv)

(defsetting ^:private test-csv-setting-with-default
  "Test setting - this only shows up in dev (6)"
  :visibility :internal
  :type :csv
  :default "A,B,C")

(setting/defsetting toucan-name
  "Name for the Metabase Toucan mascot."
  :visibility :internal)

;; ## HELPER FUNCTIONS

(defn db-fetch-setting
  "Fetch `Setting` value from the DB to verify things work as we expect."
  [setting-name]
  (db/select-one-field :value Setting, :key (name setting-name)))

(defn setting-exists-in-db? [setting-name]
  (boolean (Setting :key (name setting-name))))

(deftest string-tag-test
  (testing "String vars defined by `defsetting` should have correct `:tag` metadata"
    (is (= 'java.lang.String
           (:tag (meta #'test-setting-1))))))

(deftest defsetting-getter-fn-test
  (testing "Test defsetting getter fn. Should return the value from env var MB_TEST_SETTING_1"
    (test-setting-1 nil)
    (is (= "ABCDEFG"
           (test-setting-1))))

  (testing "Test getting a default value -- if you clear the value of a Setting it should revert to returning the default value"
    (test-setting-2 nil)
    (is (= "[Default Value]"
           (test-setting-2))))

  (testing "`user-facing-value` should return `nil` for a Setting that is using the default value"
    (test-setting-2 nil)
    (is (= nil
           (setting/user-facing-value :test-setting-2)))))

(deftest defsetting-setter-fn-test
  (test-setting-2 "FANCY NEW VALUE <3")
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
    (testing "w/o default value, but with env var value"
      (test-setting-1 "COOL")
      (is (= "COOL"
             (test-setting-1)))
      (is (= true
             (setting-exists-in-db? :test-setting-1)))
      (test-setting-1 nil)
      (testing "env var value"
        (is (= "ABCDEFG"
               (test-setting-1)))
        (is (= "ABCDEFG"
               (setting/get :test-setting-1))))
      (is (= false
             (setting-exists-in-db? :test-setting-1))))

    (testing "w/ default value"
      (test-setting-2 "COOL")
      (is (= "COOL"
             (test-setting-2)))
      (is (= true
             (setting-exists-in-db? :test-setting-2)))
      (test-setting-2 nil)
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
  (do-with-temporary-setting-value setting db-value
    (fn []
      (with-redefs [environ.core/env {(keyword (str "mb-" (name setting))) env-var-value}]
        (dissoc (#'setting/user-facing-info (#'setting/resolve-setting setting))
                :key :description)))))

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

  (testing "user-facing info w/ db value, env var value, no default value -- the DB value should take precedence over the env var"
    (is (= {:value "WOW", :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using value of env var $MB_TEST_SETTING_1"}
           (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" "ENV VAR"))))

  (testing "user-facing info w/ db value, env var value, default value -- env var should take precedence over default"
    (is (= {:value "WOW", :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using value of env var $MB_TEST_SETTING_2"}
           (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" "ENV VAR")))))

(deftest all-test
  (testing "setting/all"
    (test-setting-1 nil)
    (test-setting-2 "TOUCANS")
    (is (= {:key            :test-setting-2
            :value          "TOUCANS"
            :description    "Test setting - this only shows up in dev (2)"
            :is_env_setting false
            :env_name       "MB_TEST_SETTING_2"
            :default        "[Default Value]"}
           (some (fn [setting]
                   (when (re-find #"^test-setting-2$" (name (:key setting)))
                     setting))
                 (setting/all))))

    (testing "with a custom getter"
      (test-setting-1 nil)
      (test-setting-2 "TOUCANS")
      (is (= {:key            :test-setting-2
              :value          7
              :description    "Test setting - this only shows up in dev (2)"
              :is_env_setting false
              :env_name       "MB_TEST_SETTING_2"
              :default        "[Default Value]"}
             (some (fn [setting]
                     (when (re-find #"^test-setting-2$" (name (:key setting)))
                       setting))
                   (setting/all :getter (comp count setting/get-string))))))

    ;; TODO -- probably don't need both this test and the "TOUCANS" test above, we should combine them
    (testing "test settings"
      (test-setting-1 nil)
      (test-setting-2 "S2")
      (is (= [{:key            :test-setting-1
               :value          nil
               :is_env_setting true
               :env_name       "MB_TEST_SETTING_1"
               :description    "Test setting - this only shows up in dev (1)"
               :default        "Using value of env var $MB_TEST_SETTING_1"}
              {:key            :test-setting-2
               :value          "S2"
               :is_env_setting false,
               :env_name       "MB_TEST_SETTING_2"
               :description    "Test setting - this only shows up in dev (2)"
               :default        "[Default Value]"}]
             (for [setting (setting/all)
                   :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
               setting))))))

(defsetting ^:private test-i18n-setting
  (deferred-tru "Test setting - with i18n"))

(deftest validate-description-test
  (testing "Validate setting description with i18n string"
    (mt/with-mock-i18n-bundles {"zz" {"Test setting - with i18n" "TEST SETTING - WITH I18N"}}
      (letfn [(description []
                (some (fn [{:keys [key description]}]
                        (when (= :test-i18n-setting key)
                          description))
                      (setting/all)))]
        (is (= "Test setting - with i18n"
               (description)))
        (mt/with-user-locale "zz"
          (is (= "TEST SETTING - WITH I18N"
                 (description))))))))


;;; ------------------------------------------------ BOOLEAN SETTINGS ------------------------------------------------

(deftest boolean-settings-tag-test
  (testing "Boolean settings should have correct `:tag` metadata"
    (is (= 'java.lang.Boolean
           (:tag (meta #'test-boolean-setting))))))

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
      (is (thrown?
           Exception
           (test-boolean-setting "X"))))

    (testing "user-facing info should just return `nil` instead of failing entirely"
      (is (= {:value          nil
              :is_env_setting true
              :env_name       "MB_TEST_BOOLEAN_SETTING"
              :default        "Using value of env var $MB_TEST_BOOLEAN_SETTING"}
             (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "X"))))))

(deftest set-boolean-setting-test
  (testing "should be able to set value with a string..."
    (is (= "false"
           (test-boolean-setting "FALSE")))
    (is (= false
           (test-boolean-setting)))

    (testing "... or a boolean"
      (is (= "false"
             (test-boolean-setting false)))
      (is (= false
             (test-boolean-setting))))))


;;; ------------------------------------------------- JSON SETTINGS --------------------------------------------------

(deftest set-json-setting-test
  (is (= "{\"a\":100,\"b\":200}"
         (test-json-setting {:a 100, :b 200})))
  (is (= {:a 100, :b 200}
         (test-json-setting))))


;;; -------------------------------------------------- CSV Settings --------------------------------------------------

(defn- fetch-csv-setting-value [v]
  (with-redefs [setting/get-string (constantly v)]
    (test-csv-setting)))

(deftest get-csv-setting-test
  (testing "should be able to fetch a simple CSV setting"
    (is (= ["A" "B" "C"]
           (fetch-csv-setting-value "A,B,C"))))

  (testing "should also work if there are quoted values that include commas in them"
    (is  (= ["A" "B" "C1,C2" "ddd"]
            (fetch-csv-setting-value "A,B,\"C1,C2\",ddd")))))

(defn- set-and-fetch-csv-setting-value! [v]
  (test-csv-setting v)
  {:db-value     (db/select-one-field :value setting/Setting :key "test-csv-setting")
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
    (test-csv-setting-with-default nil)
    (is (= ["A" "B" "C"]
           (test-csv-setting-with-default)))))

(deftest csv-setting-user-facing-value-test
  (testing "`user-facing-value` should be `nil` for CSV Settings with default values"
    (test-csv-setting-with-default nil)
    (is (= nil
           (setting/user-facing-value :test-csv-setting-with-default)))))


;;; ----------------------------------------------- Encrypted Settings -----------------------------------------------

(defn- actual-value-in-db [setting-key]
  (-> (db/query {:select [:value]
                 :from   [:setting]
                 :where  [:= :key (name setting-key)]})
      first :value))

(deftest encrypted-settings-test
  (testing "If encryption is *enabled*, make sure Settings get saved as encrypted!"
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (toucan-name "Sad Can")
      (is (u/base64-string? (actual-value-in-db :toucan-name)))

      (testing "make sure it can be decrypted as well..."
        (is (= "Sad Can"
               (toucan-name)))))

    (testing "But if encryption is not enabled, of course Settings shouldn't get saved as encrypted."
      (encryption-test/with-secret-key nil
        (toucan-name "Sad Can")
        (is (= "Sad Can"
               (mt/suppress-output
                 (actual-value-in-db :toucan-name))))))))

(deftest previously-encrypted-settings-test
  (testing "Make sure settings that were encrypted don't cause `user-facing-info` to blow up if encyrption key changed"
    (encryption-test/with-secret-key "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="
      (test-json-setting {:abc 123})
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
               (#'setting/user-facing-info (setting/resolve-setting :test-json-setting))))))))


;;; ----------------------------------------------- TIMESTAMP SETTINGS -----------------------------------------------

(defsetting ^:private test-timestamp-setting
  "Test timestamp setting"
  :visibility :internal
  :type :timestamp)

(deftest timestamp-settings-test
  (is (= 'java.time.temporal.Temporal
         (:tag (meta #'test-timestamp-setting))))

  (testing "make sure we can set & fetch the value and that it gets serialized/deserialized correctly"
    (test-timestamp-setting #t "2018-07-11T09:32:00.000Z")
    (is (= #t "2018-07-11T09:32:00.000Z"
           (test-timestamp-setting)))))


;;; ----------------------------------------------- Uncached Settings ------------------------------------------------

(defn clear-settings-last-updated-value-in-db! []
  (db/simple-delete! Setting {:key cache/settings-last-updated-key}))

(defn settings-last-updated-value-in-db []
  (db/select-one-field :value Setting :key cache/settings-last-updated-key))

(defsetting ^:private uncached-setting
  "A test setting that should *not* be cached."
  :visibility :internal
  :cache? false)

(deftest uncached-settings-test
  (encryption-test/with-secret-key nil
    (testing "make sure uncached setting still saves to the DB"
      (uncached-setting "ABCDEF")
      (is (= "ABCDEF"
             (actual-value-in-db "uncached-setting"))))

    (testing "make sure that fetching the Setting always fetches the latest value from the DB"
      (uncached-setting "ABCDEF")
      (db/update-where! Setting {:key "uncached-setting"}
                        :value "123456")
      (is (= "123456"
             (uncached-setting))))

    (testing "make sure that updating the setting doesn't update the last-updated timestamp in the cache $$"
      (clear-settings-last-updated-value-in-db!)
      (uncached-setting "abcdef")
      (is (= nil
             (settings-last-updated-value-in-db))))))


;;; ----------------------------------------------- Sensitive Settings -----------------------------------------------

(defsetting test-sensitive-setting
  (deferred-tru "This is a sample sensitive Setting.")
  :sensitive? true)

(deftest sensitive-settings-test
  (testing "`user-facing-value` should obfuscate sensitive settings"
    (test-sensitive-setting "ABC123")
    (is (=  "**********23"
            (setting/user-facing-value "test-sensitive-setting"))))

  (testing "Attempting to set a sensitive setting to an obfuscated value should be ignored -- it was probably done accidentally"
    (test-sensitive-setting "123456")
    (test-sensitive-setting "**********56")
    (is (= "123456"
           (test-sensitive-setting)))))


;;; ------------------------------------------------- CACHE SYNCING --------------------------------------------------

(deftest cache-sync-test
  (testing "make sure that if for some reason the cache gets out of sync it will reset so we can still set new settings values (#4178)"
    ;; clear out any existing values of `toucan-name`
    (db/simple-delete! setting/Setting {:key "toucan-name"})
    ;; restore the cache
    (cache/restore-cache-if-needed!)
    ;; now set a value for the `toucan-name` setting the wrong way
    (db/insert! setting/Setting {:key "toucan-name", :value "Reggae"})
    ;; ok, now try to set the Setting the correct way
    (toucan-name "Banana Beak")
    ;; ok, make sure the setting was set
    (is (= "Banana Beak"
           (toucan-name)))))
