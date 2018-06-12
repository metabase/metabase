(ns metabase.api.getting-started-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;; make sure that we can fetch the GSG stuff with a 'show in getting started' Dashboard
;; ...but you shouldn't know about it if you don't have read perms for it
(expect
  {:things_to_know           nil
   :contact                  {:name nil, :email nil}
   :most_important_dashboard false
   :important_metrics        []
   :important_tables         []
   :important_segments       []
   :metric_important_fields  {}}
  (tt/with-temp Dashboard [_ {:show_in_getting_started true}]
    (-> ((test-users/user->client :rasta) :get 200 "getting_started")
        (update :most_important_dashboard integer?))))

;; ...but if you do have read perms, then you should get to see it!
(expect
  {:things_to_know           nil
   :contact                  {:name nil, :email nil}
   :most_important_dashboard true
   :important_metrics        []
   :important_tables         []
   :important_segments       []
   :metric_important_fields  {}}
  (tt/with-temp* [Collection [collection]
                  Dashboard  [_ {:collection_id           (u/get-id collection)
                                 :show_in_getting_started true}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (-> ((test-users/user->client :rasta) :get 200 "getting_started")
        (update :most_important_dashboard integer?))))
