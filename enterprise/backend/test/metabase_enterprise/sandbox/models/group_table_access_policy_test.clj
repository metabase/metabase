(ns metabase-enterprise.sandbox.models.group-table-access-policy-test
  (:require [expectations :refer [expect]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.models.permissions-group :as group]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; make sure attribute-remappings come back from the DB normalized the way we'd expect
(expect
  {"venue_id" {:type   :category
               :target [:variable [:field-id (data/id :venues :id)]]
               :value  5}}
  (tt/with-temp GroupTableAccessPolicy [gtap {:table_id             (data/id :venues)
                                              :group_id             (u/get-id (group/all-users))
                                              :attribute_remappings {"venue_id" {:type   "category"
                                                                                 :target ["variable" ["field-id" (data/id :venues :id)]]
                                                                                 :value  5}}}]
    (db/select-one-field :attribute_remappings GroupTableAccessPolicy :id (u/get-id gtap))))

;; apparently sometimes they are saved with just the target, but not type or value? Make sure these get normalized
;; correctly.
(expect
  {"user" [:variable [:field-id (data/id :venues :id)]]}
  (tt/with-temp GroupTableAccessPolicy [gtap {:table_id             (data/id :venues)
                                              :group_id             (u/get-id (group/all-users))
                                              :attribute_remappings {"user" ["variable" ["field-id" (data/id :venues :id)]]}}]
    (db/select-one-field :attribute_remappings GroupTableAccessPolicy :id (u/get-id gtap))))
