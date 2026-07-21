(ns metabase.usage-metadata.query-source-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.query-source :as query-source]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest collection-source-includes-descendant-collections-test
  (mt/with-temp [:model/Collection {parent-id :id} {:name "Candidate source parent"}
                 :model/Collection {child-id :id}  {:name     "Candidate source child"
                                                    :location (format "/%d/" parent-id)}
                 :model/Collection {other-id :id}  {:name "Candidate source other"}
                 :model/Card {parent-card-id :id}  {:collection_id parent-id :type :question}
                 :model/Card {child-card-id :id}   {:collection_id child-id :type :model}
                 :model/Card {other-card-id :id}   {:collection_id other-id :type :question}
                 :model/Card {archived-card-id :id} {:collection_id child-id
                                                     :type          :question
                                                     :archived      true}]
    (let [ids (query-source/card-ids (query-source/collection parent-id))]
      (is (contains? ids parent-card-id))
      (is (contains? ids child-card-id))
      (is (not (contains? ids other-card-id)))
      (is (not (contains? ids archived-card-id))))))

(deftest recent-views-source-uses-card-views-inside-window-test
  (let [now (t/offset-date-time)]
    (mt/with-temp [:model/Card {recent-card-id :id} {:type :question}
                   :model/Card {old-card-id :id}    {:type :model}
                   :model/Card {not-a-card-view-id :id} {:type :question}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  recent-card-id
                                     :timestamp (t/minus now (t/days 2))}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  old-card-id
                                     :timestamp (t/minus now (t/days 31))}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "dashboard"
                                     :model_id  not-a-card-view-id
                                     :timestamp now}]
      (let [ids (query-source/card-ids (query-source/recent-views 30))]
        (is (contains? ids recent-card-id))
        (is (not (contains? ids old-card-id)))
        (is (not (contains? ids not-a-card-view-id)))))))
