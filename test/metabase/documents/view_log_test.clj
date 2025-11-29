(ns metabase.documents.view-log-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.documents.view-log :as documents.view-log]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn latest-view
  "Returns the most recent view for a given user and document ID"
  [user-id document-id]
  (t2/select-one :model/ViewLog
                 :user_id user-id
                 :model "document"
                 :model_id document-id
                 {:order-by [[:id :desc]]}))

(deftest document-read-ee-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Collection collection {}
                   :model/User user {}
                   :model/Document document {:collection_id (:id collection)
                                             :name "Test Document"
                                             :document "{\"type\":\"doc\",\"content\":[]}"
                                             :creator_id (:id user)}]
      (testing "A basic document read event is recorded in EE"
        (events/publish-event! :event/document-read {:object-id (:id document) :user-id (:id user)})
        (is (partial=
             {:user_id (:id user)
              :model "document"
              :model_id (:id document)
              :has_access true
              :context nil}
             (latest-view (:id user) (:id document))))))))

(deftest document-read-oss-no-view-logging-test
  (mt/with-temp [:model/Collection collection {}
                 :model/User user {}
                 :model/Document document {:collection_id (:id collection)
                                           :name "Test Document"
                                           :document "{\"type\":\"doc\",\"content\":[]}"
                                           :creator_id (:id user)}]
    (testing "A basic document read event is not recorded without audit-app"
      (events/publish-event! :event/document-read {:object-id (:id document) :user-id (:id user)})
      (is (nil? (latest-view (:id user) (:id document)))
          "view log entries should not be made without audit-app feature"))))

(deftest document-read-view-count-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-temp [:model/Collection collection {}
                     :model/User user {}
                     :model/Document document {:collection_id (:id collection)
                                               :name "Test Document"
                                               :document "{\"type\":\"doc\",\"content\":[]}"
                                               :creator_id (:id user)
                                               :view_count 0}]
        (testing "Document read events are recorded by a document's view_count"
          (is (= 0 (:view_count document))
              "view_count should be 0 before the event is published")
          (events/publish-event! :event/document-read {:object-id (:id document) :user-id (:id user)})
          (is (= 1 (t2/select-one-fn :view_count :model/Document (:id document))))
          (events/publish-event! :event/document-read {:object-id (:id document) :user-id (:id user)})
          (is (= 2 (t2/select-one-fn :view_count :model/Document (:id document)))))))))

(deftest update-document-last-viewed-at-test
  (let [now (-> (t/offset-date-time)
                (.withNano 0))
        one-hour-ago (t/minus now (t/hours 1))
        two-hours-ago (t/minus now (t/hours 2))]
    (testing "update with multiple documents of the same IDs will set timestamp to the latest"
      (mt/with-temp [:model/Collection collection {}
                     :model/User user {}
                     :model/Document document {:collection_id (:id collection)
                                               :name "Test Document"
                                               :document "{\"type\":\"doc\",\"content\":[]}"
                                               :creator_id (:id user)
                                               :last_viewed_at two-hours-ago}]
        (#'documents.view-log/update-document-last-viewed-at!* [{:id (:id document) :timestamp one-hour-ago}
                                                                {:id (:id document) :timestamp two-hours-ago}])
        (is (= one-hour-ago
               (-> (t2/select-one-fn :last_viewed_at :model/Document (:id document))
                   t/offset-date-time
                   (.withNano 0))))))

    (testing "if the existing last_viewed_at is greater than the updating values, do not override it"
      (mt/with-temp [:model/Collection collection {}
                     :model/User user {}
                     :model/Document document {:collection_id (:id collection)
                                               :name "Test Document"
                                               :document "{\"type\":\"doc\",\"content\":[]}"
                                               :creator_id (:id user)
                                               :last_viewed_at now}]
        (#'documents.view-log/update-document-last-viewed-at!* [{:id (:id document) :timestamp one-hour-ago}])
        (is (= now
               (-> (t2/select-one-fn :last_viewed_at :model/Document (:id document))
                   t/offset-date-time
                   (.withNano 0))))))))

(deftest document-event-derivation-test
  (testing "Document events are properly derived from base events"
    (is (isa? :metabase.documents.view-log/document-read :metabase/event))
    (is (isa? :event/document-read :metabase.documents.view-log/document-read))))

(deftest document-read-error-handling-test
  (testing "Document read event handles missing document gracefully"
    ;; This should not throw an exception
    (is (some? (events/publish-event! :event/document-read {:object-id 999999 :user-id (mt/user->id :rasta)})))))

(deftest document-statistics-lock-test
  (testing "Document statistics lock is properly defined"
    (is (= :metabase.documents.view-log/document-statistics-lock
           @#'documents.view-log/document-statistics-lock))))

(deftest document-read-updates-recent-views-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Collection collection {}
                   :model/User user {}
                   :model/Document document {:collection_id (:id collection)
                                             :name "Test Document"
                                             :document "{\"type\":\"doc\",\"content\":[]}"
                                             :creator_id (:id user)}]
      (testing "Document read event updates user's recent views"
        ;; Verify no recent views initially
        (is (empty? (t2/select :model/RecentViews
                               :user_id (:id user)
                               :model "document"
                               :model_id (:id document))))

        ;; Publish document read event
        (events/publish-event! :event/document-read {:object-id (:id document) :user-id (:id user)})

        ;; Verify recent view was created
        (let [recent-view (t2/select-one :model/RecentViews
                                         :user_id (:id user)
                                         :model "document"
                                         :model_id (:id document))]
          (is (some? recent-view) "Recent view should be created")
          (is (= (:id user) (:user_id recent-view)))
          (is (= "document" (:model recent-view)))
          (is (= (:id document) (:model_id recent-view))))))))
