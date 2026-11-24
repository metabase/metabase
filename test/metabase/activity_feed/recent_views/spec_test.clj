(ns metabase.activity-feed.recent-views.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.activity-feed.models.recent-views :as recent-views]
   [metabase.activity-feed.recent-views.spec :as recent-views.spec]
   [metabase.models.resolution :as models.resolution]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest every-spec-is-valid-test
  (models.resolution/load-all-models!)
  (doseq [model (disj (set (keys (methods recent-views.spec/spec))) :default)]
    (testing model
      (is (nil? (mr/explain recent-views.spec/ModelSpec (recent-views.spec/spec model)))))))

(deftest names-of-recent-views-test
  (is (= #{"card" "dataset" "metric" "dashboard" "table" "collection" "document"}
         (set (keys (models.resolution/spec-entries-by-name recent-views.spec/spec)))))
  (is (= (set (map name recent-views/rv-models))
         (set (keys (models.resolution/spec-entries-by-name recent-views.spec/spec))))))

(deftest types-tell-the-names-of-a-model-apart-test
  (doseq [[model entries] (group-by first (vals (models.resolution/spec-entries-by-name recent-views.spec/spec)))
          :when (< 1 (count entries))]
    (testing model
      (is (= (count entries) (count (distinct (map (comp :type second) entries)))))
      (is (every? (comp :type second) entries))
      (is (= 1 (count (distinct (map (comp :load second) entries))))))))

(deftest recents-query-count-does-not-grow-with-items-test
  (mt/with-temp [:model/Collection {coll-id :id} {}]
    (let [user-id (mt/user->id :crowberto)
          view!   (fn [model id]
                    (t2/insert! :model/RecentViews {:user_id user-id :model model :model_id id :context "view"}))
          count-queries (fn []
                          (t2/with-call-count [call-count]
                            (mt/with-test-user :crowberto
                              (doall (:recents (recent-views/get-recents user-id [:views]))))
                            (call-count)))]
      (t2/delete! :model/RecentViews :user_id user-id)
      (mt/with-temp [:model/Card      {card-1 :id}  {:type :question}
                     :model/Card      {model-1 :id} {:type :model}
                     :model/Dashboard {dash-1 :id}  {}]
        (view! "card" card-1)
        (view! "card" model-1)
        (view! "dashboard" dash-1)
        (view! "collection" coll-id)
        (let [small (count-queries)]
          (mt/with-temp [:model/Card      {card-2 :id}  {:type :question}
                         :model/Card      {metric-1 :id} {:type :metric}
                         :model/Dashboard {dash-2 :id}  {}]
            (view! "card" card-2)
            (view! "card" metric-1)
            (view! "dashboard" dash-2)
            (is (= small (count-queries)))
            (is (= 7 (count (mt/with-test-user :crowberto
                              (:recents (recent-views/get-recents user-id [:views]))))))))))))
