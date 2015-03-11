(ns metabase.api.setting-test
  (:require [expectations :refer :all]
            (metabase.models [setting :as setting]
                             [setting-test :refer [set-settings
                                                   setting-exists?
                                                   test-setting-1
                                                   test-setting-2]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer :all]))

;; ## Helper Fns
(defn fetch-all-settings  []
  (filter (fn [{k :key}]
            (re-find #"^test-setting-\d$" (name k)))
          ((user->client :rasta) :get 200 "setting" :org @org-id)))

(defn fetch-setting [setting-name]
  ((user->client :rasta) :get 200 (format "setting/%s" (name setting-name)) :org @org-id))

;; ## GET /api/setting
;; Check that we can fetch all Settings for Org
(expect-eval-actual-first
    [{:key "test-setting-1", :value nil,     :description "Test setting - this only shows up in dev (1)"}
     {:key "test-setting-2", :value "FANCY", :description "Test setting - this only shows up in dev (2)"}]
    (do (set-settings nil "FANCY" nil)
        (fetch-all-settings)))

;; Check that a non-admin can't read settings
(expect "You don't have permissions to do that."
  ((user->client :lucky) :get 403 "setting" :org @org-id))


;; ## GET /api/setting/:key
;; Test that we can fetch a single setting
(expect-eval-actual-first
    "OK!"
    (do (test-setting-2 @org-id "OK!")
        (fetch-setting :test-setting-2)))


;; ## PUT /api/setting/:key
(expect-eval-actual-first
    ["NICE!"
     "NICE!"]
  (do ((user->client :rasta) :put 200 "setting/test-setting-1" :org @org-id {:value "NICE!"})
      [(test-setting-1 @org-id)
       (fetch-setting :test-setting-1)]))

;; ## Check non-admin can't set a Setting
(expect "You don't have permissions to do that."
  ((user->client :lucky) :put 403 "setting/test-setting-1" :org @org-id {:value "NICE!"}))

;; ## DELETE /api/setting/:key
(expect-eval-actual-first
    [nil
     nil
     false]
  (do ((user->client :rasta) :delete 204 "setting/test-setting-1" :org @org-id)
      [(test-setting-1 @org-id)
       (fetch-setting :test-setting-1)
       (setting-exists? :test-setting-1)]))
