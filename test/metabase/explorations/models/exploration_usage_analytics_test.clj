(ns metabase.explorations.models.exploration-usage-analytics-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.test-util :as documents.test-util]
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

(deftest exploration-document-excluded-from-content-view-test
  (testing "A document attached to an exploration is not counted as content; a standalone document is"
    (mt/with-temp [:model/Exploration {expl-id :id} {:name       "Why is revenue down"
                                                     :creator_id (mt/user->id :rasta)}
                   :model/Document {summary-id :id} {:name           "Exploration Summary"
                                                     :document       (documents.test-util/text->prose-mirror-ast "attached")
                                                     :creator_id     (mt/user->id :rasta)
                                                     :exploration_id expl-id}
                   :model/Document {doc-id :id} {:name       "Standalone Doc"
                                                 :document   (documents.test-util/text->prose-mirror-ast "standalone")
                                                 :creator_id (mt/user->id :rasta)}]
      (let [content-ids (fn [ids]
                          (->> (t2/query {:select [:entity_id]
                                          :from   [:v_content]
                                          :where  [:and
                                                   [:= :entity_type "document"]
                                                   [:in :entity_id ids]]})
                               (map :entity_id)
                               set))]
        (is (= #{doc-id} (content-ids [summary-id doc-id])))))))
