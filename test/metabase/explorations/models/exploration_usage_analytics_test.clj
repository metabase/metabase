(ns metabase.explorations.models.exploration-usage-analytics-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest exploration-in-content-view-test
  (testing "Explorations appear in the usage analytics v_content view"
    (mt/with-temp [:model/Exploration {expl-id :id} {:name        "Why is revenue down"
                                                     :description "Q3 dip"
                                                     :creator_id  (mt/user->id :rasta)}]
      (is (=? {:entity_id           expl-id
               :entity_qualified_id (str "exploration_" expl-id)
               :entity_type         "exploration"
               :name                "Why is revenue down"
               :description         "Q3 dip"
               :creator_id          (mt/user->id :rasta)}
              (t2/query-one {:select [:*]
                             :from   [:v_content]
                             :where  [:and
                                      [:= :entity_type "exploration"]
                                      [:= :entity_id expl-id]]}))))))
