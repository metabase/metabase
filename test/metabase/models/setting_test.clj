(ns metabase.models.setting-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            (metabase [db :refer [sel]]
                      [test-data :refer :all])
            [metabase.models.setting :refer [defsetting Setting] :as setting]
            [metabase.test.util :refer :all]))

;; ## TEST SETTINGS DEFINITIONS
;; TODO! These don't get loaded by `lein ring server` unless this file is touched
;; so if you run unit tests while `lein ring server` is running (i.e., no Jetty server is started)
;; these tests will fail. FIXME

(defsetting test-setting-1 "Test setting - this only shows up in dev (1)")
(defsetting test-setting-2 "Test setting - this only shows up in dev (2)")


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
;; Test defsetting getter fn
(expect nil
  (do (set-settings nil nil)
    (test-setting-1)))

;; Test `get` function
(expect nil
  (do (set-settings nil nil)
    (setting/get :test-setting-1)))


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


;; ## DELETE
;; Test defsetting delete
(expect-eval-actual-first
    ["COOL"
     true
     nil
     false]
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
     nil
     false]
  [(do (test-setting-2 "VERY NICE!")
       (test-setting-2))
   (setting-exists? :test-setting-2)
   (do (test-setting-2 nil)
       (test-setting-2))
   (setting-exists? :test-setting-2)])

;; ## ALL SETTINGS FUNCTIONS

;; all
(expect-eval-actual-first
    {:test-setting-2 "TOUCANS"}
  (do (set-settings nil "TOUCANS")
      (m/filter-keys #(re-find #"^test-setting-\d$" (name %)) ; filter out any non-test settings
                     (setting/all))))

;; all-with-descriptions
(expect-eval-actual-first
    [{:key :test-setting-1, :value nil,  :description "Test setting - this only shows up in dev (1)"}
     {:key :test-setting-2, :value "S2", :description "Test setting - this only shows up in dev (2)"}]
  (do (set-settings nil "S2")
      (filter (fn [{k :key}]
                (re-find #"^test-setting-\d$" (name k)))
              (setting/all-with-descriptions))))
