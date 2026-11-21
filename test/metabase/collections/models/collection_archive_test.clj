(ns metabase.collections.models.collection-archive-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- archive! [model id archived?]
  (t2/update! model :id id {:archived archived?}))

(defn- row [model id]
  (t2/select-one model :id id))

(deftest archive-and-restore-collection-test
  (mt/with-temp [:model/Collection parent      {}
                 :model/Collection child       {:location (collection/children-location parent)}
                 :model/Collection direct-sub  {:location (collection/children-location parent)}
                 :model/Card       card        {:collection_id (u/the-id parent)}
                 :model/Card       child-card  {:collection_id (u/the-id child)}
                 :model/Card       direct-card {:collection_id (u/the-id parent)}
                 :model/Dashboard  dashboard   {:collection_id (u/the-id parent)}
                 :model/Card       dashboard-q {:collection_id (u/the-id parent) :dashboard_id (u/the-id dashboard)}
                 :model/Document   document    {:collection_id (u/the-id parent)}
                 :model/Card       document-q  {:collection_id (u/the-id parent) :document_id (u/the-id document)}
                 :model/Exploration exploration {:collection_id (u/the-id parent)}
                 :model/Timeline   timeline    {:collection_id (u/the-id parent)}
                 :model/TimelineEvent event    {:timeline_id (u/the-id timeline)}
                 :model/Pulse      pulse       {:collection_id (u/the-id parent)}]
    (archive! :model/Card (u/the-id direct-card) true)
    (archive! :model/Collection (u/the-id direct-sub) true)
    (let [direct-op-id (:archive_operation_id (row :model/Collection (u/the-id direct-sub)))]
      (archive! :model/Collection (u/the-id parent) true)
      (let [parent-op-id (:archive_operation_id (row :model/Collection (u/the-id parent)))]
        (testing "the collection takes the archive on its own and starts an operation"
          (is (=? {:archived true :archived_directly true :archive_operation_id string?}
                  (row :model/Collection (u/the-id parent)))))
        (testing "the collections under it that were live follow it in its operation"
          (is (=? {:archived true :archived_directly false :archive_operation_id parent-op-id}
                  (row :model/Collection (u/the-id child)))))
        (testing "a collection archived before keeps its own cause and operation"
          (is (=? {:archived true :archived_directly true :archive_operation_id direct-op-id}
                  (row :model/Collection (u/the-id direct-sub)))))
        (testing "each kind of item follows"
          (doseq [[model item] [[:model/Card card] [:model/Card child-card] [:model/Dashboard dashboard]
                                [:model/Card dashboard-q] [:model/Document document] [:model/Card document-q]
                                [:model/Exploration exploration] [:model/Timeline timeline] [:model/Pulse pulse]]]
            (is (=? {:archived true :archived_directly false} (row model (u/the-id item)))
                (str model " " (u/the-id item)))))
        (testing "an item archived on its own keeps its cause"
          (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct-card)))))
        (testing "the events of a timeline it carries stay as they were"
          (is (false? (:archived (row :model/TimelineEvent (u/the-id event))))))
        (archive! :model/Collection (u/the-id parent) false)
        (testing "restoring brings back what the archive took down"
          (is (=? {:archived false :archived_directly false :archive_operation_id nil}
                  (row :model/Collection (u/the-id parent))))
          (is (=? {:archived false :archived_directly false :archive_operation_id nil}
                  (row :model/Collection (u/the-id child))))
          (doseq [[model item] [[:model/Card card] [:model/Card child-card] [:model/Dashboard dashboard]
                                [:model/Card dashboard-q] [:model/Document document] [:model/Card document-q]
                                [:model/Exploration exploration] [:model/Timeline timeline] [:model/Pulse pulse]]]
            (is (=? {:archived false :archived_directly false} (row model (u/the-id item)))
                (str model " " (u/the-id item)))))
        (testing "restoring leaves what was archived on its own archived"
          (is (=? {:archived true :archived_directly true :archive_operation_id direct-op-id}
                  (row :model/Collection (u/the-id direct-sub))))
          (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct-card)))))))))

(deftest restore-collection-leaves-what-its-archived-parent-holds-test
  (mt/with-temp [:model/Collection collection {}
                 :model/Dashboard  dashboard  {:collection_id (u/the-id collection)}
                 :model/Card       question   {:collection_id (u/the-id collection) :dashboard_id (u/the-id dashboard)}]
    (archive! :model/Dashboard (u/the-id dashboard) true)
    (archive! :model/Collection (u/the-id collection) true)
    (archive! :model/Collection (u/the-id collection) false)
    (is (=? {:archived true :archived_directly true} (row :model/Dashboard (u/the-id dashboard))))
    (is (=? {:archived true :archived_directly false} (row :model/Card (u/the-id question))))))

(deftest archive-and-restore-snippet-collection-test
  (mt/with-temp [:model/Collection parent  {:namespace "snippets"}
                 :model/Collection child   {:namespace "snippets" :location (collection/children-location parent)}
                 :model/NativeQuerySnippet snippet       {:collection_id (u/the-id parent)}
                 :model/NativeQuerySnippet direct        {:collection_id (u/the-id child)}]
    (archive! :model/NativeQuerySnippet (u/the-id direct) true)
    (archive! :model/Collection (u/the-id parent) true)
    (is (=? {:archived true :archived_directly false} (row :model/NativeQuerySnippet (u/the-id snippet))))
    (is (=? {:archived true :archived_directly true} (row :model/NativeQuerySnippet (u/the-id direct))))
    (archive! :model/Collection (u/the-id parent) false)
    (is (=? {:archived false :archived_directly false} (row :model/NativeQuerySnippet (u/the-id snippet))))
    (is (=? {:archived true :archived_directly true} (row :model/NativeQuerySnippet (u/the-id direct))))))

(deftest archive-of-collection-reads-one-parent-per-item-test
  (letfn [(calls [n]
            (mt/with-temp [:model/Collection collection {:namespace "snippets"}]
              (dotimes [_ n]
                (t2/insert! :model/NativeQuerySnippet {:name       (str (random-uuid))
                                                       :content    "1 = 1"
                                                       :creator_id (mt/user->id :crowberto)
                                                       :collection_id (u/the-id collection)}))
              (t2/with-call-count [call-count]
                (archive! :model/Collection (u/the-id collection) true)
                (archive! :model/Collection (u/the-id collection) false)
                (call-count))))]
    (is (= 18 (- (calls 20) (calls 2))))))

(deftest archive-and-restore-follow-model-parents-test
  (testing "a dashboard archives and restores the questions it holds, but not those archived on their own"
    (mt/with-temp [:model/Dashboard dashboard {}
                   :model/Card      question {:dashboard_id (u/the-id dashboard)}
                   :model/Card      direct   {:dashboard_id (u/the-id dashboard)}]
      (archive! :model/Card (u/the-id direct) true)
      (archive! :model/Dashboard (u/the-id dashboard) true)
      (is (=? {:archived true :archived_directly true} (row :model/Dashboard (u/the-id dashboard))))
      (is (=? {:archived true :archived_directly false} (row :model/Card (u/the-id question))))
      (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct))))
      (archive! :model/Dashboard (u/the-id dashboard) false)
      (is (=? {:archived false :archived_directly false} (row :model/Card (u/the-id question))))
      (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct))))))
  (testing "a document archives and restores the cards in it"
    (mt/with-temp [:model/Document document {}
                   :model/Card     card {:document_id (u/the-id document)}]
      (archive! :model/Document (u/the-id document) true)
      (is (=? {:archived true :archived_directly false} (row :model/Card (u/the-id card))))
      (archive! :model/Document (u/the-id document) false)
      (is (=? {:archived false :archived_directly false} (row :model/Card (u/the-id card))))))
  (testing "a timeline archives and restores its events"
    (mt/with-temp [:model/Timeline      timeline {}
                   :model/TimelineEvent event    {:timeline_id (u/the-id timeline)}]
      (archive! :model/Timeline (u/the-id timeline) true)
      (is (true? (:archived (row :model/TimelineEvent (u/the-id event)))))
      (archive! :model/Timeline (u/the-id timeline) false)
      (is (false? (:archived (row :model/TimelineEvent (u/the-id event)))))))
  (testing "an exploration archives and restores its summary document"
    (mt/with-temp [:model/Exploration exploration {}
                   :model/Document    summary     {:exploration_id (u/the-id exploration)}]
      (archive! :model/Exploration (u/the-id exploration) true)
      (is (=? {:archived true :archived_directly false} (row :model/Document (u/the-id summary))))
      (archive! :model/Exploration (u/the-id exploration) false)
      (is (=? {:archived false :archived_directly false} (row :model/Document (u/the-id summary)))))))

(deftest archived-cause-test
  (testing "an archive without a cause is on its own, and a restore clears it"
    (mt/with-temp [:model/Card card {}]
      (archive! :model/Card (u/the-id card) true)
      (is (true? (:archived_directly (row :model/Card (u/the-id card)))))
      (archive! :model/Card (u/the-id card) false)
      (is (false? (:archived_directly (row :model/Card (u/the-id card)))))))
  (testing "a write that gives a cause keeps it"
    (mt/with-temp [:model/Card card {}]
      (t2/update! :model/Card :id (u/the-id card) {:archived true :archived_directly false})
      (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id card)))))))

(deftest rows-do-not-go-into-archived-parents-test
  (mt/with-temp [:model/Collection archived  {:archived true}
                 :model/Collection live      {}
                 :model/Card       card      {:collection_id (u/the-id live)}
                 :model/Dashboard  dashboard {:collection_id (u/the-id live)}
                 :model/Card       in-dash   {:dashboard_id (u/the-id dashboard) :collection_id (u/the-id live)}]
    (testing "a row that is not archived cannot be inserted into an archived collection"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (t2/insert! :model/Dashboard {:name "d" :creator_id (mt/user->id :rasta) :collection_id (u/the-id archived)})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (t2/insert! :model/Timeline {:name "t" :icon "balloons" :creator_id (mt/user->id :rasta)
                                                         :collection_id (u/the-id archived)}))))
    (testing "an archived row can be inserted into an archived collection"
      (is (some? (t2/insert-returning-pk! :model/Dashboard {:name "d" :creator_id (mt/user->id :rasta) :archived true
                                                            :archived_directly false :collection_id (u/the-id archived)}))))
    (testing "a row that is not archived cannot be moved into an archived collection"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (t2/update! :model/Card :id (u/the-id card) {:collection_id (u/the-id archived)})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (t2/update! :model/Collection :id (u/the-id live)
                                        {:location (collection/children-location archived)}))))
    (testing "a row that is archived can be moved into an archived collection"
      (archive! :model/Card (u/the-id card) true)
      (is (= 1 (t2/update! :model/Card :id (u/the-id card) {:collection_id (u/the-id archived)}))))
    (testing "a card that is not archived cannot be put in an archived dashboard"
      (archive! :model/Dashboard (u/the-id dashboard) true)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Dashboard"
                            (t2/insert! :model/Card (-> (t2/select-one :model/Card :id (u/the-id in-dash))
                                                        (dissoc :id :entity_id :created_at :updated_at)
                                                        (assoc :archived false))))))))
