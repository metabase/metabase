(ns metabase.models.setting-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            (metabase [db :refer [sel exists?]]
                      [test-data :refer :all])
            [metabase.models.setting :refer [defsetting Setting] :as setting]
            [metabase.test.util :refer :all]))

;; ## TEST SETTINGS DEFINITIONS

(defsetting test-setting-1 "Test setting - this only shows up in dev (1)")
(defsetting test-setting-2 "Test setting - this only shows up in dev (2)")
(defsetting test-setting-3 "Test setting - this only shows up in dev (3)")


;; ## HELPER FUNCTIONS

(defn fetch-setting
  "Fetch `Setting` value from the DB to verify things work as we expect."
  [setting-name]
  (sel :one :field [Setting :value] :key (name setting-name) :organization_id @org-id))

(defn setting-exists? [setting-name]
  (exists? Setting :key (name setting-name) :organization_id @org-id))


;; ## GETTERS
;; Test defsetting getter fn
(expect nil
  (test-setting-1 @org-id))

;; Test `get` function
(expect nil
  (setting/get @org-id :test-setting-1))


;; ## SETTERS
;; Test defsetting setter fn
(expect-eval-actual-first
    [nil
     "FANCY NEW VALUE <3"
     "FANCY NEW VALUE <3"]
  [(test-setting-2 @org-id)
   (do (test-setting-2 @org-id "FANCY NEW VALUE <3")
       (test-setting-2 @org-id))
   (fetch-setting :test-setting-2)])

;; Test `set` function
(expect-eval-actual-first
    [nil
     "WHAT A NICE VALUE <3"
     "WHAT A NICE VALUE <3"]
  [(test-setting-3 @org-id)
   (do (setting/set @org-id :test-setting-3 "WHAT A NICE VALUE <3")
       (test-setting-3 @org-id))
   (fetch-setting :test-setting-3)])


;; ## DELETE
;; Test defsetting delete
(expect-eval-actual-first
    ["COOL"
     true
     nil
     false]
  [(do (test-setting-2 @org-id "COOL")
       (test-setting-2 @org-id))
   (setting-exists? :test-setting-2)
   (do (test-setting-2 @org-id nil)
       (test-setting-2 @org-id))
   (setting-exists? :test-setting-2)])

;; Test `delete`
(expect-eval-actual-first
    ["VERY NICE!"
     true
     nil
     false]
  [(do (test-setting-2 @org-id "VERY NICE!")
       (test-setting-2 @org-id))
   (setting-exists? :test-setting-2)
   (do (test-setting-2 @org-id nil)
       (test-setting-2 @org-id))
   (setting-exists? :test-setting-2)])

;; ## ALL SETTINGS FUNCTIONS

;; all
(expect-eval-actual-first
    {:test-setting-1 "GREAT!"
     :test-setting-2 "TOUCANS"}
  (do (test-setting-1 @org-id nil)
      (test-setting-2 @org-id "GREAT!")
      (test-setting-3 @org-id "TOUCANS")
      (m/filter-keys #(re-find #"^test-setting-\d$" (name %)) ; filter out any non-test settings
                     (setting/all @org-id))))

;; all-with-descriptions
(expect-eval-actual-first
    [{:key :test-setting-1, :value nil,  :description "Test setting - this only shows up in dev (1)"}
     {:key :test-setting-2, :value "S2", :description "Test setting - this only shows up in dev (2)"}
     {:key :test-setting-3, :value "S3", :description "Test setting - this only shows up in dev (3)"}]
  (do (test-setting-1 @org-id nil)
      (test-setting-2 @org-id "S2")
      (test-setting-3 @org-id "S3")
      (filter (fn [{k :key}]
                (re-find #"^test-setting-\d$" (name k)))
              (setting/all-with-descriptions @org-id))))
