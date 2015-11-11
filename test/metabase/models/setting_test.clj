(ns metabase.models.setting-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.db :refer [sel]]
            [metabase.models.setting :refer [defsetting Setting] :as setting]
            (metabase.test [data :refer :all]
                           [util :refer :all])))

;; ## TEST SETTINGS DEFINITIONS
;; TODO! These don't get loaded by `lein ring server` unless this file is touched
;; so if you run unit tests while `lein ring server` is running (i.e., no Jetty server is started)
;; these tests will fail. FIXME

(defsetting test-setting-1 "Test setting - this only shows up in dev (1)")
(defsetting test-setting-2 "Test setting - this only shows up in dev (2)"
  "[Default Value]")


;; ## HELPER FUNCTIONS

(defn db-fetch-setting
  "Fetch `Setting` value from the DB to verify things work as we expect."
  [setting-name]
  (sel :one :field [Setting :value] :key (name setting-name)))

(defn setting-exists? [setting-name]
  (boolean (sel :one Setting :key (name setting-name))))

(defn set-settings [setting-1-value setting-2-value]
  (test-setting-1 setting-1-value)
  (test-setting-2 setting-2-value))


;; ## GETTERS
;; Test defsetting getter fn. Should return the value from env var MB_TEST_SETTING_1
(expect "ABCDEFG"
  (do (set-settings nil nil)
      (test-setting-1)))

;; Test `get` function. Shouldn't return env var value
(expect nil
  (do (set-settings nil nil)
      (setting/get :test-setting-1)))

;; Test getting a default value
(expect "[Default Value]"
  (do (set-settings nil nil)
      (test-setting-2)))

;; `get` shouldn't return default value
(expect nil
  (do (set-settings nil nil)
      (setting/get :test-setting-2)))


;; ## SETTERS
;; Test defsetting setter fn
(expect-eval-actual-first
    ["FANCY NEW VALUE <3"
     "FANCY NEW VALUE <3"]
  [(do (test-setting-2 "FANCY NEW VALUE <3")
       (test-setting-2))
   (db-fetch-setting :test-setting-2)])

;; Test `set` function
(expect-eval-actual-first
    ["WHAT A NICE VALUE <3"
     "WHAT A NICE VALUE <3"]
  [(do (setting/set :test-setting-2 "WHAT A NICE VALUE <3")
       (test-setting-2))
   (db-fetch-setting :test-setting-2)])

;; Set multiple at one time
(expect-eval-actual-first
  ["I win!"
   "For realz"]
  (do
    (setting/set-all {:test-setting-1 "I win!"
                      :test-setting-2 "For realz"})
    [(db-fetch-setting :test-setting-1)
     (db-fetch-setting :test-setting-2)]))


;; ## DELETE
;; Test defsetting delete w/o default value
(expect-eval-actual-first
    ["COOL"
     true
     "ABCDEFG"
     nil
     false]
  [(do (test-setting-1 "COOL")
       (test-setting-1))
   (setting-exists? :test-setting-1)
   (do (test-setting-1 nil)
       (test-setting-1))
   (setting/get :test-setting-1)
   (setting-exists? :test-setting-1)])

;; Test defsetting delete w/ default value
(expect-eval-actual-first
    ["COOL"
     true
     "[Default Value]"                  ; default value should get returned if none is set
     false]                             ; setting still shouldn't exist in the DB
  [(do (test-setting-2 "COOL")
       (test-setting-2))
   (setting-exists? :test-setting-2)
   (do (test-setting-2 nil)
       (test-setting-2))
   (setting-exists? :test-setting-2)])

;; Test `delete`
(expect-eval-actual-first
    ["VERY NICE!"
     true
     "ABCDEFG"
     nil
     false]
  [(do (test-setting-1 "VERY NICE!")
       (test-setting-1))
   (setting-exists? :test-setting-1)
   (do (test-setting-1 nil)
       (test-setting-1))
   (setting/get :test-setting-1)
   (setting-exists? :test-setting-1)])

;; ## ALL SETTINGS FUNCTIONS

;; all
(expect-eval-actual-first
    {:test-setting-2 "TOUCANS"}
  (do (set-settings nil "TOUCANS")
      (m/filter-keys #(re-find #"^test-setting-\d$" (name %)) ; filter out any non-test settings
                     (setting/all))))

;; all-with-descriptions
(expect-eval-actual-first
    [{:key :test-setting-1, :value nil,  :description "Test setting - this only shows up in dev (1)", :default "Using $MB_TEST_SETTING_1"}
     {:key :test-setting-2, :value "S2", :description "Test setting - this only shows up in dev (2)", :default "[Default Value]"}]
  (do (set-settings nil "S2")
      (filter (fn [{k :key}]
                (re-find #"^test-setting-\d$" (name k)))
              (setting/all-with-descriptions))))
