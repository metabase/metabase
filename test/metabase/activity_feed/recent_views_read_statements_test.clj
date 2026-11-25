(ns metabase.activity-feed.recent-views-read-statements-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.models.document :as document]
   [metabase.documents.test-util :as doc.tu]
   [metabase.permissions.core :as perms]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- statements
  "The number of app DB statements `thunk` runs."
  [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- viewed-documents! [coll-id user n]
  (let [ids (mapv :id (document/create-documents!
                       (mapv (fn [i]
                               {:name          (str "document " i)
                                :creator_id    (mt/user->id :crowberto)
                                :collection_id coll-id
                                :document      (doc.tu/text->prose-mirror-ast (str "hello " i))
                                :content_type  "application/json+vnd.prose-mirror"})
                             (range n))))]
    (t2/insert! :model/RecentViews (mapv (fn [id] {:user_id (mt/user->id user) :model "document" :model_id id :context :view}) ids))))

(deftest recent-views-statements-do-not-grow-with-documents-test
  (search.tu/with-index-disabled
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
      (mt/with-model-cleanup [:model/Document :model/RecentViews]
        (doseq [user [:crowberto :rasta]
                path ["activity/recent_views" "activity/recents?context=views"]]
          (viewed-documents! coll-id user 1)
          (let [request #(mt/user-http-request user :get 200 path)
                _       (request)
                _       (viewed-documents! coll-id user 4)
                small   (statements request)
                _       (viewed-documents! coll-id user 10)
                large   (statements request)]
            (is (= small large) (str "as " user " on " path))))))))
