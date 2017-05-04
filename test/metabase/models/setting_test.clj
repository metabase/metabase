(ns metabase.models.setting-test
  (:require [expectations :refer :all]
            [metabase.models.setting :as setting :refer [defsetting Setting]]
            [metabase.test.util :refer :all]
            [toucan.db :as db]))

;; ## TEST SETTINGS DEFINITIONS
;; TODO! These don't get loaded by `lein ring server` unless this file is touched
;; so if you run unit tests while `lein ring server` is running (i.e., no Jetty server is started)
;; these tests will fail. FIXME

(defsetting test-setting-1
  "Test setting - this only shows up in dev (1)")

(defsetting test-setting-2
  "Test setting - this only shows up in dev (2)"
  :default "[Default Value]")

(defsetting test-boolean-setting
  "Test setting - this only shows up in dev (3)"
  :type :boolean)

(defsetting test-json-setting
  "Test setting - this only shows up in dev (4)"
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


;;; ------------------------------------------------------------ all & user-facing-info ------------------------------------------------------------

(resolve-private-vars metabase.models.setting resolve-setting user-facing-info)

;; these tests are to check that settings get returned with the correct information; these functions are what feed into the API

(defn- user-facing-info-with-db-and-env-var-values [setting db-value env-var-value]
  (do-with-temporary-setting-value setting db-value
    (fn []
      (with-redefs [environ.core/env {(keyword (str "mb-" (name setting))) env-var-value}]
        (dissoc (user-facing-info (resolve-setting setting))
                :key :description)))))

;; user-facing-info w/ no db value, no env var value, no default value
(expect
  {:value nil, :default nil}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 nil nil))

;; user-facing-info w/ no db value, no env var value, default value
(expect
  {:value nil, :default "[Default Value]"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 nil nil))

;; user-facing-info w/ no db value, env var value, no default value -- shouldn't leak env var value
(expect
  {:value nil, :default "Using $MB_TEST_SETTING_1"}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 nil "TOUCANS"))

;; user-facing-info w/ no db value, env var value, default value
(expect
  {:value nil, :default "Using $MB_TEST_SETTING_2"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 nil "TOUCANS"))

;; user-facing-info w/ db value, no env var value, no default value
(expect
  {:value "WOW", :default nil}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" nil))

;; user-facing-info w/ db value, no env var value, default value
(expect
  {:value "WOW", :default "[Default Value]"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" nil))

;; user-facing-info w/ db value, env var value, no default value -- the DB value should take precedence over the env var
(expect
  {:value "WOW", :default "Using $MB_TEST_SETTING_1"}
  (user-facing-info-with-db-and-env-var-values :test-setting-1 "WOW" "ENV VAR"))

;; user-facing-info w/ db value, env var value, default value -- env var should take precedence over default value
(expect
  {:value "WOW", :default "Using $MB_TEST_SETTING_2"}
  (user-facing-info-with-db-and-env-var-values :test-setting-2 "WOW" "ENV VAR"))

;; all
(expect
  {:key :test-setting-2, :value "TOUCANS", :description "Test setting - this only shows up in dev (2)", :default "[Default Value]"}
  (do (set-settings! nil "TOUCANS")
      (some (fn [setting]
              (when (re-find #"^test-setting-2$" (name (:key setting)))
                setting))
            (setting/all))))

;; all
(expect
  [{:key :test-setting-1, :value nil,  :description "Test setting - this only shows up in dev (1)", :default "Using $MB_TEST_SETTING_1"}
   {:key :test-setting-2, :value "S2", :description "Test setting - this only shows up in dev (2)", :default "[Default Value]"}]
  (do (set-settings! nil "S2")
      (for [setting (setting/all)
            :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
        setting)))


;;; ------------------------------------------------------------ BOOLEAN SETTINGS ------------------------------------------------------------

(expect
  {:value nil, :default nil}
  (user-facing-info-with-db-and-env-var-values :test-boolean-setting nil nil))

;; boolean settings shouldn't be obfuscated when set by env var
(expect
  {:value true, :default "Using $MB_TEST_BOOLEAN_SETTING"}
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

;;; ------------------------------------------------------------ JSON SETTINGS ------------------------------------------------------------

(expect
  "{\"a\":100,\"b\":200}"
  (test-json-setting {:a 100, :b 200}))

(expect
  {:a 100, :b 200}
  (do (test-json-setting {:a 100, :b 200})
      (test-json-setting)))


;;; make sure that if for some reason the cache gets out of sync it will reset so we can still set new settings values (#4178)

(setting/defsetting ^:private toucan-name
  "Name for the Metabase Toucan mascot.")

(expect
  "Banana Beak"
  (do
    ;; clear out any existing values of `toucan-name`
    (db/simple-delete! setting/Setting {:key "toucan-name"})
    ;; restore the cache
    ((resolve 'metabase.models.setting/restore-cache-if-needed!))
    ;; now set a value for the `toucan-name` setting the wrong way
    (db/insert! setting/Setting {:key "toucan-name", :value "Rasta"})
    ;; ok, now try to set the Setting the correct way
    (toucan-name "Banana Beak")
    ;; ok, make sure the setting was set
    (toucan-name)))
