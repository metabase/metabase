(ns metabase.api.setting-test
  (:require [expectations :refer [expect]]
            [metabase.models.setting-test :refer [test-sensitive-setting test-setting-1 test-setting-2]]
            [metabase.test.data.users :refer [user->client]]))

;; ## Helper Fns
(defn- fetch-test-settings  []
  (for [setting ((user->client :crowberto) :get 200 "setting")
        :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
    setting))

(defn- fetch-setting [setting-name]
  ((user->client :crowberto) :get 200 (format "setting/%s" (name setting-name))))

;; ## GET /api/setting
;; Check that we can fetch all Settings for Org
(expect
  [{:key            "test-setting-1"
    :value          nil
    :is_env_setting true
    :env_name       "MB_TEST_SETTING_1"
    :description    "Test setting - this only shows up in dev (1)"
    :default        "Using value of env var $MB_TEST_SETTING_1"}
   {:key            "test-setting-2"
    :value          "FANCY"
    :is_env_setting false
    :env_name       "MB_TEST_SETTING_2"
    :description    "Test setting - this only shows up in dev (2)"
    :default        "[Default Value]"}]
  (do
    (test-setting-1 nil)
    (test-setting-2 "FANCY")
    (fetch-test-settings)))

;; Check that non-superusers are denied access
(expect "You don't have permissions to do that."
  ((user->client :rasta) :get 403 "setting"))


;; ## GET /api/setting/:key
;; Test that we can fetch a single setting
(expect
 "OK!"
 (do (test-setting-2 "OK!")
     (fetch-setting :test-setting-2)))


;; ## PUT /api/setting/:key
(expect
 ["NICE!"
  "NICE!"]
 (do ((user->client :crowberto) :put 200 "setting/test-setting-1" {:value "NICE!"})
     [(test-setting-1)
      (fetch-setting :test-setting-1)]))

;; ## Check non-superuser can't set a Setting
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 "setting/test-setting-1" {:value "NICE!"}))


;;; ----------------------------------------------- Sensitive Settings -----------------------------------------------

;; Sensitive settings should always come back obfuscated

;; GET /api/setting/:name should obfuscate sensitive settings
(expect
  "**********EF"
  (do
    (test-sensitive-setting "ABCDEF")
    (fetch-setting :test-sensitive-setting)))

;; GET /api/setting should obfuscate sensitive settings
(expect
  {:key            "test-sensitive-setting"
   :value          "**********LM"
   :is_env_setting false
   :env_name       "MB_TEST_SENSITIVE_SETTING"
   :description    "This is a sample sensitive Setting."
   :default        nil}
  (do
    (test-sensitive-setting "GHIJKLM")
    (some (fn [{setting-name :key, :as setting}]
            (when (= setting-name "test-sensitive-setting")
              setting))
          ((user->client :crowberto) :get 200 "setting"))))

;; Setting the Setting via an endpoint should still work as expected; the normal getter functions should *not*
;; obfuscate sensitive Setting values -- that should be done by the API
(expect
  "123456"
  (do
    ((user->client :crowberto) :put 200 "setting/test-sensitive-setting" {:value "123456"})
    (test-sensitive-setting)))

;; Attempts to set the Setting to an obfuscated value should be ignored
(expect
  "123456"
  (do
    (test-sensitive-setting "123456")
    ((user->client :crowberto) :put 200 "setting/test-sensitive-setting" {:value "**********56"})
    (test-sensitive-setting)))

(expect
  (do
    (test-sensitive-setting "123456")
    ((user->client :crowberto) :put 200 "setting" {:test-sensitive-setting "**********56"})
    (test-sensitive-setting)))
