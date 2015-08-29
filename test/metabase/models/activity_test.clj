(ns metabase.models.activity-test
  (:require [expectations :refer :all]
            [korma.core :refer [table]]
            [medley.core :as m]
            [metabase.db :as db]
            (metabase.models [activity :refer :all]
                             [card :refer [Card]]
                             [interface :refer [defentity]])
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]))


;;; # REVISIONS + PUSH-REVISION

;; Test valid-activity-topic?
(expect [false
         false
         false
         true
         true]
        [(valid-activity-topic? nil)
         (valid-activity-topic? {})
         (valid-activity-topic? [])
         (valid-activity-topic? "user-create")
         (valid-activity-topic? :user-create)])

;; Test topic->model
(expect []
        [(topic->model :abc)])
