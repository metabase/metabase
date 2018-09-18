(ns metabase.models.setting-test
  (:require [clojure.core.memoize :as memoize]
            [expectations :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.models.setting :as setting :refer [defsetting Setting]]
            [metabase.test.util :refer :all]
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

;; ## HELPER FUNCTIONS

(defn db-fetch-setting
  "Fetch `Setting` value from the DB to verify things work as we expect."
  [setting-name]
  (db/select-one-field :value Setting, :key (name setting-name)))

(defn setting-exists-in-db? [setting-name]
  (boolean (Setting :key (name setting-name))))

(defn set-settings! [setting-1-value setting-2-value]
  (test-setting-1 setting-1-value)
  (test-setting-2 setting-2-value))


(expect
  String
  (:tag (meta #'test-setting-1)))

;; ## GETTERS
;; Test defsetting getter fn. Should return the value from env var MB_TEST_SETTING_1
(expect "ABCDEFG"
  (do (set-settings! nil nil)
      (test-setting-1)))

;; Test getting a default value
(expect "[Default Value]"
  (do (set-settings! nil nil)
      (test-setting-2)))


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
  {:value nil, :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using $MB_TEST_SETTING_1"}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 nil "TOUCANS"))

;; #'setting/user-facing-info w/ no db value, env var value, default value
(expect
  {:value nil,  :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using $MB_TEST_SETTING_2"}
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
  {:value "WOW", :is_env_setting true, :env_name "MB_TEST_SETTING_1", :default "Using $MB_TEST_SETTING_1"}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" "ENV VAR"))

;; #'setting/user-facing-info w/ db value, env var value, default value -- env var should take precedence over default
;; #value
(expect
  {:value "WOW", :is_env_setting true, :env_name "MB_TEST_SETTING_2", :default "Using $MB_TEST_SETTING_2"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" "ENV VAR"))

;; all
(expect
  {:key            :test-setting-2
   :value          "TOUCANS"
   :description    "Test setting - this only shows up in dev (2)"
   :is_env_setting false
   :env_name       "MB_TEST_SETTING_2"
   :default        "[Default Value]"}
  (do (set-settings! nil "TOUCANS")
      (some (fn [setting]
              (when (re-find #"^test-setting-2$" (name (:key setting)))
                setting))
            (setting/all))))

;; all
(expect
  [{:key            :test-setting-1
    :value          nil
    :is_env_setting true
    :env_name       "MB_TEST_SETTING_1"
    :description    "Test setting - this only shows up in dev (1)"
    :default        "Using $MB_TEST_SETTING_1"}
   {:key            :test-setting-2
    :value          "S2"
    :is_env_setting false,
    :env_name       "MB_TEST_SETTING_2"
    :description    "Test setting - this only shows up in dev (2)"
    :default        "[Default Value]"}]
  (do (set-settings! nil "S2")
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

;; boolean settings shouldn't be obfuscated when set by env var
(expect
  {:value true, :is_env_setting true, :env_name "MB_TEST_BOOLEAN_SETTING", :default "Using $MB_TEST_BOOLEAN_SETTING"}
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

(setting/defsetting ^:private toucan-name
  "Name for the Metabase Toucan mascot."
  :internal? true)

(expect
  "Banana Beak"
  (do
    ;; clear out any existing values of `toucan-name`
    (db/simple-delete! setting/Setting {:key "toucan-name"})
    ;; restore the cache
    ((resolve 'metabase.models.setting/restore-cache-if-needed!))
    ;; now set a value for the `toucan-name` setting the wrong way
    (db/insert! setting/Setting {:key "toucan-name", :value "Reggae"})
    ;; ok, now try to set the Setting the correct way
    (toucan-name "Banana Beak")
    ;; ok, make sure the setting was set
    (toucan-name)))

(expect
  String
  (:tag (meta #'toucan-name)))


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


;;; --------------------------------------------- Cache Synchronization ----------------------------------------------

(def ^:private settings-last-updated-key @(resolve 'metabase.models.setting/settings-last-updated-key))

(defn- clear-settings-last-updated-value-in-db! []
  (db/simple-delete! Setting {:key settings-last-updated-key}))

(defn- settings-last-updated-value-in-db []
  (db/select-one-field :value Setting :key settings-last-updated-key))

(defn- clear-cache! []
  (reset! @(resolve 'metabase.models.setting/cache) nil))

(defn- settings-last-updated-value-in-cache []
  (get @@(resolve 'metabase.models.setting/cache) settings-last-updated-key))

(defn- update-settings-last-updated-value-in-db!
  "Simulate a different instance updating the value of `settings-last-updated` in the DB by updating its value without
  updating our locally cached value.."
  []
  (db/update-where! Setting {:key settings-last-updated-key}
    :value (hsql/raw (case (mdb/db-type)
                       ;; make it one second in the future so we don't end up getting an exact match when we try to test
                       ;; to see if things update below
                       :h2       "cast(dateadd('second', 1, current_timestamp) AS text)"
                       :mysql    "cast((current_timestamp + interval 1 second) AS char)"
                       :postgres "cast((current_timestamp + interval '1 second') AS text)"))))

(defn- simulate-another-instance-updating-setting! [setting-name new-value]
  (db/update-where! Setting {:key (name setting-name)} :value new-value)
  (update-settings-last-updated-value-in-db!))

(defn- flush-memoized-results-for-should-restore-cache!
  "Remove any memoized results for `should-restore-cache?`, so we can test `restore-cache-if-needed!` works the way we'd
  expect."
  []
  (memoize/memo-clear! @(resolve 'metabase.models.setting/should-restore-cache?)))

;; When I update a Setting, does it set/update `settings-last-updated`?
(expect
  (do
    (clear-settings-last-updated-value-in-db!)
    (toucan-name "Bird Can")
    (string? (settings-last-updated-value-in-db))))

;; ...and is the value updated in the cache as well?
(expect
  (do
    (clear-cache!)
    (toucan-name "Bird Can")
    (string? (settings-last-updated-value-in-cache))))

;; ...and if I update it again, will the value be updated?
(expect
  (do
    (clear-settings-last-updated-value-in-db!)
    (toucan-name "Bird Can")
    (let [first-value (settings-last-updated-value-in-db)]
      ;; MySQL only has the resolution of one second on the timestamps here so we should wait that long to make sure
      ;; the second-value actually ends up being greater than the first
      (Thread/sleep 1200)
      (toucan-name "Bird Can")
      (let [second-value (settings-last-updated-value-in-db)]
        ;; first & second values should be different, and first value should be "less than" the second value
        (and (not= first-value second-value)
             (neg? (compare first-value second-value)))))))

;; If there is no cache, it should be considered out of date!`
(expect
  (do
    (clear-cache!)
    (#'setting/cache-out-of-date?)))

;; But if I set a setting, it should cause the cache to be populated, and be up-to-date
(expect
  false
  (do
    (clear-cache!)
    (toucan-name "Reggae Toucan")
    (#'setting/cache-out-of-date?)))

;; If another instance updates a Setting, `cache-out-of-date?` should return `true` based on DB comparisons...
;; be true!
(expect
  (do
    (clear-cache!)
    (toucan-name "Reggae Toucan")
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    (#'setting/cache-out-of-date?)))

;; of course, `restore-cache-if-needed!` should use TTL memoization, and the cache should not get updated right away
;; even if another instance updates a value...
(expect
  "Sam"
  (do
    (flush-memoized-results-for-should-restore-cache!)
    (clear-cache!)
    (toucan-name "Sam")                 ; should restore cache, and put in {"toucan-name" "Sam"}
    ;; since we cleared the memoized value of `should-restore-cache?` call it again to make sure it gets set to
    ;; `false` as it would IRL if we were calling it again from the same instance
    (#'setting/should-restore-cache?)
    ;; now have another instance change the value
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    ;; our cache should not be updated yet because it's on a TTL
    (toucan-name)))

;; ...and when it comes time to check our cache for updating (when calling `restore-cache-if-needed!`, it should get
;; the updated value. (we're not actually going to wait a minute for the memoized values of `should-restore-cache?` to
;; be invalidated, so we will manually flush the memoization cache to simulate it happening)
(expect
  "Bird Can"
  (do
    (clear-cache!)
    (toucan-name "Reggae Toucan")
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    (flush-memoized-results-for-should-restore-cache!)
    ;; calling `toucan-name` will call `restore-cache-if-needed!`, which will in turn call `should-restore-cache?`.
    ;; Since memoized value is no longer present, this should call `cache-out-of-date?`, which checks the DB; it will
    ;; detect a cache out-of-date situation and flush the cache as appropriate, giving us the updated value when we
    ;; call! :wow:
    (toucan-name)))


;;; ----------------------------------------------- Uncached Settings ------------------------------------------------

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
