(ns metabase.models.setting-test
  (:require [expectations :refer [expect]]
            [metabase.models.setting :as setting :refer [defsetting Setting]]
            [metabase.models.setting.cache :as cache]
            [metabase.test.util :refer :all]
            [metabase.util :as u]
            [metabase.util
             [encryption :as encryption]
             [encryption-test :as encryption-test]
             [i18n :refer [tru]]]
            [puppetlabs.i18n.core :as i18n]
            [toucan.db :as db]))

;; ## TEST SETTINGS DEFINITIONS
;; TODO! These don't get loaded by `lein ring server` unless this file is touched
;; so if you run unit tests while `lein ring server` is running (i.e., no Jetty server is started)
;; these tests will fail. FIXME

(defsetting test-setting-1
  "Test setting - this only shows up in dev (1)"
  :internal? true)

(defsetting test-setting-2
  "Test setting - this only shows up in dev (2)"
  :internal? true
  :default "[Default Value]")

(defsetting ^:private test-boolean-setting
  "Test setting - this only shows up in dev (3)"
  :internal? true
  :type :boolean)

(defsetting ^:private test-json-setting
  "Test setting - this only shows up in dev (4)"
  :internal? true
  :type :json)

(defsetting ^:private test-csv-setting
  "Test setting - this only shows up in dev (5)"
  :internal? true
  :type :csv)

(defsetting ^:private test-csv-setting-with-default
  "Test setting - this only shows up in dev (6)"
  :internal? true
  :type :csv
  :default "A,B,C")

;; ## HELPER FUNCTIONS

(defn db-fetch-setting
  "Fetch `Setting` value from the DB to verify things work as we expect."
  [setting-name]
  (db/select-one-field :value Setting, :key (name setting-name)))

(defn setting-exists-in-db? [setting-name]
  (boolean (Setting :key (name setting-name))))

(expect
  String
  (:tag (meta #'test-setting-1)))

;; ## GETTERS
;; Test defsetting getter fn. Should return the value from env var MB_TEST_SETTING_1
(expect
  "ABCDEFG"
  (do
    (test-setting-1 nil)
    (test-setting-1)))

;; Test getting a default value -- if you clear the value of a Setting it should revert to returning the default value
(expect
  "[Default Value]"
  (do
    (test-setting-2 nil)
    (test-setting-2)))

;; `user-facing-value` should return `nil` for a Setting that is using the default value
(expect
  nil
  (do
    (test-setting-2 nil)
    (setting/user-facing-value :test-setting-2)))


;; ## SETTERS
;; Test defsetting setter fn
(expect
  ["FANCY NEW VALUE <3"
   "FANCY NEW VALUE <3"]
  [(do (test-setting-2 "FANCY NEW VALUE <3")
       (test-setting-2))
   (db-fetch-setting :test-setting-2)])

;; Test `set!` function
(expect
    ["WHAT A NICE VALUE <3"
     "WHAT A NICE VALUE <3"]
  [(do (setting/set! :test-setting-2 "WHAT A NICE VALUE <3")
       (test-setting-2))
   (db-fetch-setting :test-setting-2)])

;; Set multiple at one time
(expect
  ["I win!"
   "For realz"]
  (do
    (setting/set-many! {:test-setting-1 "I win!"
                        :test-setting-2 "For realz"})
    [(db-fetch-setting :test-setting-1)
     (db-fetch-setting :test-setting-2)]))


;; ## DELETE
;; Test defsetting delete w/o default value, but with env var value
(expect
  ["COOL"
   true
   "ABCDEFG" ; env var value
   "ABCDEFG"
   false]
  [(do (test-setting-1 "COOL")
       (test-setting-1))
   (setting-exists-in-db? :test-setting-1)
   (do (test-setting-1 nil)
       (test-setting-1))
   (setting/get :test-setting-1)
   (setting-exists-in-db? :test-setting-1)])

;; Test defsetting delete w/ default value
(expect
  ["COOL"
   true
   "[Default Value]" ; default value should get returned if none is set
   false]            ; setting still shouldn't exist in the DB
  [(do (test-setting-2 "COOL")
       (test-setting-2))
   (setting-exists-in-db? :test-setting-2)
   (do (test-setting-2 nil)
       (test-setting-2))
   (setting-exists-in-db? :test-setting-2)])


;;; --------------------------------------------- all & user-facing-info ---------------------------------------------

;; these tests are to check that settings get returned with the correct information; these functions are what feed
;; into the API

(defn- user-facing-info-with-db-and-env-var-values [setting db-value env-var-value]
  (do-with-temporary-setting-value setting db-value
    (fn []
      (with-redefs [environ.core/env {(keyword (str "mb-" (name setting))) env-var-value}]
        (dissoc (#'setting/user-facing-info (#'setting/resolve-setting setting))
                :key :description)))))

;; #'setting/user-facing-info w/ no db value, no env var value, no default value
(expect
  {:value nil, :is_env_setting false, :env_name "MB_TEST_SETTING_1", :default nil}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 nil nil))

;; #'setting/user-facing-info w/ no db value, no env var value, default value
(expect
  {:value nil, :is_env_setting false, :env_name "MB_TEST_SETTING_2", :default "[Default Value]"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 nil nil))

;; #'setting/user-facing-info w/ no db value, env var value, no default value -- shouldn't leak env var value
(expect
  {:value nil, :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using value of env var $MB_TEST_SETTING_1"}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 nil "TOUCANS"))

;; #'setting/user-facing-info w/ no db value, env var value, default value
(expect
  {:value nil,  :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using value of env var $MB_TEST_SETTING_2"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 nil "TOUCANS"))

;; #'setting/user-facing-info w/ db value, no env var value, no default value
(expect
  {:value "WOW", :is_env_setting false, :env_name "MB_TEST_SETTING_1", :default nil}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" nil))

;; #'setting/user-facing-info w/ db value, no env var value, default value
(expect
  {:value "WOW", :is_env_setting false, :env_name "MB_TEST_SETTING_2", :default "[Default Value]"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" nil))

;; #'setting/user-facing-info w/ db value, env var value, no default value -- the DB value should take precedence over
;; #the env var
(expect
  {:value "WOW", :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using value of env var $MB_TEST_SETTING_1"}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" "ENV VAR"))

;; #'setting/user-facing-info w/ db value, env var value, default value -- env var should take precedence over default
;; #value
(expect
  {:value "WOW", :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using value of env var $MB_TEST_SETTING_2"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" "ENV VAR"))

;; all
(expect
  {:key            :test-setting-2
   :value          "TOUCANS"
   :description    "Test setting - this only shows up in dev (2)"
   :is_env_setting false
   :env_name       "MB_TEST_SETTING_2"
   :default        "[Default Value]"}
  (do (test-setting-1 nil)
      (test-setting-2 "TOUCANS")
      (some (fn [setting]
              (when (re-find #"^test-setting-2$" (name (:key setting)))
                setting))
            (setting/all))))

;; all with custom getter
(expect
  {:key            :test-setting-2
   :value          7
   :description    "Test setting - this only shows up in dev (2)"
   :is_env_setting false
   :env_name       "MB_TEST_SETTING_2"
   :default        "[Default Value]"}
  (do (test-setting-1 nil)
      (test-setting-2 "TOUCANS")
      (some (fn [setting]
              (when (re-find #"^test-setting-2$" (name (:key setting)))
                setting))
            (setting/all :getter (comp count setting/get-string)))))

;; all
(expect
  [{:key            :test-setting-1
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
  (do (test-setting-1 nil)
      (test-setting-2 "S2")
      (for [setting (setting/all)
            :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
        setting)))

(defsetting ^:private test-i18n-setting
  (tru "Test setting - with i18n"))

;; Validate setting description with i18n string
(expect
  ["TEST SETTING - WITH I18N"]
  (let [zz (i18n/string-as-locale "zz")]
    (i18n/with-user-locale zz
      (doall
       (for [{:keys [key description]} (setting/all)
             :when (= :test-i18n-setting key)]
         description)))))


;;; ------------------------------------------------ BOOLEAN SETTINGS ------------------------------------------------

(expect
  Boolean
  (:tag (meta #'test-boolean-setting)))

(expect
  {:value nil, :is_env_setting false, :env_name "MB_TEST_BOOLEAN_SETTING", :default nil}
  (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil nil))

;; values set by env vars should never be shown to the User
(expect
  {:value          nil
   :is_env_setting true
   :env_name       "MB_TEST_BOOLEAN_SETTING"
   :default        "Using value of env var $MB_TEST_BOOLEAN_SETTING"}
  (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "true"))

;; env var values should be case-insensitive
(expect
  (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "TRUE"))

;; should throw exception if value isn't true / false
(expect
  Exception
  (test-boolean-setting "X"))

(expect
  Exception
  (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil "X"))

;; should be able to set value with a string...
(expect
  "false"
  (test-boolean-setting "FALSE"))

(expect
  false
  (do (test-boolean-setting "FALSE")
      (test-boolean-setting)))

;; ... or a boolean
(expect
  "false"
  (test-boolean-setting false))

(expect
  false
  (do (test-boolean-setting false)
      (test-boolean-setting)))

;;; ------------------------------------------------- JSON SETTINGS --------------------------------------------------

(expect
  "{\"a\":100,\"b\":200}"
  (test-json-setting {:a 100, :b 200}))

(expect
  {:a 100, :b 200}
  (do (test-json-setting {:a 100, :b 200})
      (test-json-setting)))


;; make sure that if for some reason the cache gets out of sync it will reset so we can still set new settings values
;; (#4178)

(setting/defsetting toucan-name
  "Name for the Metabase Toucan mascot."
  :internal? true)

(expect
  "Banana Beak"
  (do
    ;; clear out any existing values of `toucan-name`
    (db/simple-delete! setting/Setting {:key "toucan-name"})
    ;; restore the cache
    (cache/restore-cache-if-needed!)
    ;; now set a value for the `toucan-name` setting the wrong way
    (db/insert! setting/Setting {:key "toucan-name", :value "Reggae"})
    ;; ok, now try to set the Setting the correct way
    (toucan-name "Banana Beak")
    ;; ok, make sure the setting was set
    (toucan-name)))

(expect
  String
  (:tag (meta #'toucan-name)))


;;; -------------------------------------------------- CSV Settings --------------------------------------------------

(defn- fetch-csv-setting-value [v]
  (with-redefs [setting/get-string (constantly v)]
    (test-csv-setting)))

;; should be able to fetch a simple CSV setting
(expect
  ["A" "B" "C"]
  (fetch-csv-setting-value "A,B,C"))

;; should also work if there are quoted values that include commas in them
(expect
  ["A" "B" "C1,C2" "ddd"]
  (fetch-csv-setting-value "A,B,\"C1,C2\",ddd"))

(defn- set-and-fetch-csv-setting-value! [v]
  (test-csv-setting v)
  {:db-value     (db/select-one-field :value setting/Setting :key "test-csv-setting")
   :parsed-value (test-csv-setting)})

;; should be able to correctly set a simple CSV setting
(expect
  {:db-value "A,B,C", :parsed-value ["A" "B" "C"]}
  (set-and-fetch-csv-setting-value! ["A" "B" "C"]))

;; should be a able to set a CSV setting with a value that includes commas
(expect
  {:db-value "A,B,C,\"D1,D2\"", :parsed-value ["A" "B" "C" "D1,D2"]}
  (set-and-fetch-csv-setting-value! ["A" "B" "C" "D1,D2"]))

;; should be able to set a CSV setting with a value that includes spaces
(expect
  {:db-value "A,B,C, D ", :parsed-value ["A" "B" "C" " D "]}
  (set-and-fetch-csv-setting-value! ["A" "B" "C" " D "]))

;; should be a able to set a CSV setting when the string is already CSV-encoded
(expect
  {:db-value "A,B,C", :parsed-value ["A" "B" "C"]}
  (set-and-fetch-csv-setting-value! "A,B,C"))

;; should be able to set nil CSV setting
(expect
  {:db-value nil, :parsed-value nil}
  (set-and-fetch-csv-setting-value! nil))

;; default values for CSV settings should work
(expect
  ["A" "B" "C"]
  (do
    (test-csv-setting-with-default nil)
    (test-csv-setting-with-default)))

;; `user-facing-value` should be `nil` for CSV Settings with default values
(expect
  nil
  (do
    (test-csv-setting-with-default nil)
    (setting/user-facing-value :test-csv-setting-with-default)))


;;; ----------------------------------------------- Encrypted Settings -----------------------------------------------

(defn- actual-value-in-db [setting-key]
  (-> (db/query {:select [:value]
                 :from   [:setting]
                 :where  [:= :key (name setting-key)]})
      first :value u/jdbc-clob->str))

;; If encryption is *enabled*, make sure Settings get saved as encrypted!
(expect
  (encryption-test/with-secret-key "ABCDEFGH12345678"
    (toucan-name "Sad Can")
    (u/base64-string? (actual-value-in-db :toucan-name))))

;; make sure it can be decrypted as well...
(expect
  "Sad Can"
  (encryption-test/with-secret-key "12345678ABCDEFGH"
    (toucan-name "Sad Can")
    (encryption/decrypt (actual-value-in-db :toucan-name))))

;; But if encryption is not enabled, of course Settings shouldn't get saved as encrypted.
(expect
  "Sad Can"
  (encryption-test/with-secret-key nil
    (toucan-name "Sad Can")
    (actual-value-in-db :toucan-name)))


;;; ----------------------------------------------- TIMESTAMP SETTINGS -----------------------------------------------

(defsetting ^:private test-timestamp-setting
  "Test timestamp setting"
  :internal? true
  :type :timestamp)

(expect
  java.sql.Timestamp
  (:tag (meta #'test-timestamp-setting)))

;; make sure we can set & fetch the value and that it gets serialized/deserialized correctly
(expect
  #inst "2018-07-11T09:32:00.000Z"
  (do (test-timestamp-setting #inst "2018-07-11T09:32:00.000Z")
      (test-timestamp-setting)))


;;; ----------------------------------------------- Uncached Settings ------------------------------------------------

(defn clear-settings-last-updated-value-in-db! []
  (db/simple-delete! Setting {:key cache/settings-last-updated-key}))

(defn settings-last-updated-value-in-db []
  (db/select-one-field :value Setting :key cache/settings-last-updated-key))

(defsetting ^:private uncached-setting
  "A test setting that should *not* be cached."
  :internal? true
  :cache? false)

;; make sure uncached setting still saves to the DB
(expect
  "ABCDEF"
  (encryption-test/with-secret-key nil
    (uncached-setting "ABCDEF")
    (actual-value-in-db "uncached-setting")))

;; make sure that fetching the Setting always fetches the latest value from the DB
(expect
  "123456"
  (encryption-test/with-secret-key nil
    (uncached-setting "ABCDEF")
    (db/update-where! Setting {:key "uncached-setting"}
      :value "123456")
    (uncached-setting)))

;; make sure that updating the setting doesn't update the last-updated timestamp in the cache $$
(expect
  nil
  (encryption-test/with-secret-key nil
    (clear-settings-last-updated-value-in-db!)
    (uncached-setting "abcdef")
    (settings-last-updated-value-in-db)))


;;; ----------------------------------------------- Sensitive Settings -----------------------------------------------

(defsetting test-sensitive-setting
  (tru "This is a sample sensitive Setting.")
  :sensitive? true)

;; `user-facing-value` should obfuscate sensitive settings
(expect
  "**********23"
  (do
    (test-sensitive-setting "ABC123")
    (setting/user-facing-value "test-sensitive-setting")))

;; Attempting to set a sensitive setting to an obfuscated value should be ignored -- it was probably done accidentally
(expect
  "123456"
  (do
    (test-sensitive-setting "123456")
    (test-sensitive-setting "**********56")
    (test-sensitive-setting)))
