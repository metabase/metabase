(ns metabase.revisions.snapshot-schema-test
  "A revert decodes the snapshot that a Revision stores with the `:schema` of the spec of its model: an older format
  reverts, and a snapshot that cannot be decoded into a valid one is refused with a 400."
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.init]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment metabase.revisions.init/keep-me)

(defn- insert-revision!
  "Insert a Revision of the `model-name` row with `model-id` that stores `object`, and return its id."
  [model-name model-id object]
  (t2/insert-returning-pk! :model/Revision {:model       model-name
                                            :model_id    model-id
                                            :user_id     (mt/user->id :crowberto)
                                            :object      object
                                            :is_creation false}))

(defn- revert!
  "Revert the row of `model` with `id` to the Revision `revision-id`."
  [model id revision-id]
  (mt/with-current-user (mt/user->id :crowberto)
    (revision/revert! {:entity      model
                       :id          id
                       :user-id     (mt/user->id :crowberto)
                       :revision-id revision-id})))

(defn- refused-status!
  "The status of the refusal of the revert of the row of `model` with `id` to the Revision `revision-id`, nil when it is
  not refused."
  [model id revision-id]
  (try
    (revert! model id revision-id)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(deftest revert-card-to-older-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Card {card-id :id} {:name "Current" :type :question}]
      (let [legacy-query {:database (mt/id)
                          :type     "query"
                          :query    {:source-table (mt/id :venues)}}
            revision-id  (insert-revision! "Card" card-id {:name          "Older"
                                                           :dataset       true
                                                           :dataset_query legacy-query})]
        (revert! :model/Card card-id revision-id)
        (testing "the dataset flag is the type, and the legacy query is the current one"
          (is (=? {:name          "Older"
                   :type          :model
                   :dataset_query {:lib/type :mbql/query
                                   :database (mt/id)
                                   :stages   [{:source-table (mt/id :venues)}]}}
                  (t2/select-one :model/Card :id card-id))))))))

(deftest revert-card-to-garbage-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Card {card-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Card" card-id {:name {:not "a name"}})]
        (is (= 400 (refused-status! :model/Card card-id revision-id)))
        (is (= "Current" (t2/select-one-fn :name :model/Card :id card-id)))))))

(deftest revert-dashboard-to-older-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Dashboard     {dashboard-id :id} {:name "Current"}
                   :model/Card          {card-id :id}      {}
                   :model/DashboardTab  _                  {:dashboard_id dashboard-id}
                   :model/DashboardCard _                  {:dashboard_id dashboard-id :card_id card-id}]
      (let [revision-id (insert-revision! "Dashboard" dashboard-id {:name               "Older"
                                                                    :description        nil
                                                                    :archived           false
                                                                    :auto_apply_filters true
                                                                    :cache_ttl          nil
                                                                    :collection_id      nil
                                                                    :width              "fixed"})]
        (revert! :model/Dashboard dashboard-id revision-id)
        (testing "a snapshot recorded before tabs, cards and parameters were recorded has none of them"
          (is (= "Older" (t2/select-one-fn :name :model/Dashboard :id dashboard-id)))
          (is (= 0 (t2/count :model/DashboardTab :dashboard_id dashboard-id)))
          (is (= 0 (t2/count :model/DashboardCard :dashboard_id dashboard-id)))
          (is (= [] (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id))))))))

(deftest revert-dashboard-to-garbage-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Dashboard" dashboard-id {:name "Older" :cards "not a list of cards"})]
        (is (= 400 (refused-status! :model/Dashboard dashboard-id revision-id)))
        (is (= "Current" (t2/select-one-fn :name :model/Dashboard :id dashboard-id)))))))

(deftest revert-document-to-older-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Collection {collection-id :id} {}
                   :model/Document   {document-id :id}   {:name "Current"}]
      (let [revision-id (insert-revision! "Document" document-id {:name          "Older"
                                                                  :document      {:type "doc" :content []}
                                                                  :collection_id collection-id
                                                                  :view_count    99})]
        (revert! :model/Document document-id revision-id)
        (testing "the columns that a snapshot no longer records are not written"
          (is (=? {:name "Older" :collection_id nil :view_count 0}
                  (t2/select-one :model/Document :id document-id))))))))

(deftest revert-document-to-garbage-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Document {document-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Document" document-id {:name 42})]
        (is (= 400 (refused-status! :model/Document document-id revision-id)))
        (is (= "Current" (t2/select-one-fn :name :model/Document :id document-id)))))))

(deftest revert-exploration-to-older-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Exploration {exploration-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Exploration" exploration-id {:name              "Older"
                                                                        :archived_directly true
                                                                        :creator_id        (mt/user->id :rasta)})]
        (revert! :model/Exploration exploration-id revision-id)
        (testing "the columns that a snapshot no longer records are not written"
          (is (=? {:name "Older" :archived_directly false}
                  (t2/select-one :model/Exploration :id exploration-id))))))))

(deftest revert-exploration-to-garbage-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Exploration {exploration-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Exploration" exploration-id {:name ["not" "a" "name"]})]
        (is (= 400 (refused-status! :model/Exploration exploration-id revision-id)))
        (is (= "Current" (t2/select-one-fn :name :model/Exploration :id exploration-id)))))))

(deftest revert-segment-to-older-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Current"}]
      (let [legacy-definition {:database (mt/id)
                               :type     "query"
                               :query    {:source-table (mt/id :venues)
                                          :filter       [">" [:field (mt/id :venues :price) nil] 2]}}
            revision-id       (insert-revision! "Segment" segment-id {:name       "Older"
                                                                      :definition legacy-definition
                                                                      :entity_id  "an-entity-id-of-the-old-days"
                                                                      :creator_id (mt/user->id :rasta)})]
        (revert! :model/Segment segment-id revision-id)
        (testing "a legacy definition is the current one, and the columns that a snapshot no longer records are not written"
          (is (=? {:name       "Older"
                   :definition {:lib/type :mbql/query
                                :stages   [{:source-table (mt/id :venues)
                                            :filters      [[:> {} [:field {} (mt/id :venues :price)] 2]]}]}
                   :entity_id  #(not= "an-entity-id-of-the-old-days" %)}
                  (t2/select-one :model/Segment :id segment-id))))))))

(deftest revert-segment-to-garbage-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Segment" segment-id {:name {:not "a name"}})]
        (is (= 400 (refused-status! :model/Segment segment-id revision-id)))
        (is (= "Current" (t2/select-one-fn :name :model/Segment :id segment-id)))))))

(deftest revert-measure-to-older-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Measure {measure-id :id :as measure} {:name "Current"}]
      (let [revision-id (insert-revision! "Measure" measure-id (assoc (revision/snapshot :model/Measure measure)
                                                                      :name       "Older"
                                                                      :creator_id (mt/user->id :rasta)
                                                                      :dimensions []))]
        (revert! :model/Measure measure-id revision-id)
        (is (= "Older" (t2/select-one-fn :name :model/Measure :id measure-id)))))))

(deftest revert-measure-to-garbage-snapshot-test
  (mt/with-model-cleanup [:model/Revision]
    (mt/with-temp [:model/Measure {measure-id :id} {:name "Current"}]
      (let [revision-id (insert-revision! "Measure" measure-id {:name {:not "a name"}})]
        (is (= 400 (refused-status! :model/Measure measure-id revision-id)))
        (is (= "Current" (t2/select-one-fn :name :model/Measure :id measure-id)))))))

(deftest revert-transform-to-older-snapshot-test
  (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-model-cleanup [:model/Revision]
        (mt/with-temp [:model/Transform {transform-id :id} {:name "Current"}]
          (let [revision-id (insert-revision! "Transform" transform-id {:name                  "Older"
                                                                        :last_checkpoint_value "7"
                                                                        :creator_id            (mt/user->id :rasta)})]
            (revert! :model/Transform transform-id revision-id)
            (testing "the columns that a snapshot no longer records are not written"
              (is (=? {:name "Older" :last_checkpoint_value nil}
                      (t2/select-one :model/Transform :id transform-id))))))))))

(deftest revert-transform-to-garbage-snapshot-test
  (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-model-cleanup [:model/Revision]
        (mt/with-temp [:model/Transform {transform-id :id} {:name "Current"}]
          (let [revision-id (insert-revision! "Transform" transform-id {:name 42})]
            (is (= 400 (refused-status! :model/Transform transform-id revision-id)))
            (is (= "Current" (t2/select-one-fn :name :model/Transform :id transform-id)))))))))

(deftest read-card-snapshot-with-id-test
  (testing "A Card snapshot of an older format that still holds the `:id` of the Card is read as a snapshot, not as a Card"
    (mt/with-model-cleanup [:model/Revision]
      (mt/with-temp [:model/Card {card-id :id} {:name "Current" :type :question}]
        (let [legacy-query {:database (mt/id)
                            :type     "query"
                            :query    {:source-table (mt/id :venues)}}
              revision-id  (insert-revision! "Card" card-id {:id            card-id
                                                             :name          "Older"
                                                             :dataset_query legacy-query})]
          (testing "the Revision reads"
            (is (=? {:object {:name          "Older"
                              :dataset_query {:lib/type :mbql/query
                                              :stages   [{:source-table (mt/id :venues)}]}}}
                    (t2/select-one :model/Revision :id revision-id))))
          (testing "the history of the Card loads"
            (is (=? [{:id revision-id}]
                    (mt/user-http-request :crowberto :get 200 "revision" :entity "card" :id card-id))))
          (testing "an update of the Card records a Revision"
            (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:name "Newer"})
            (is (=? {:object {:name "Newer"}}
                    (t2/select-one :model/Revision :model "Card" :model_id card-id
                                   {:order-by [[:id :desc]]})))))))))
