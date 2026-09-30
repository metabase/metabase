(ns metabase.api.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.db :as api.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- positions [card-ids]
  (mapv #(t2/select-one-fn :collection_position :model/Card :id %) card-ids))

(deftest shift-card-positions-test
  (testing "GHY-4481: shifting positions moves only the Cards in range, in the given Collection, in the given direction"
    (mt/with-temp [:model/Collection {coll-id :id}  {}
                   :model/Collection {other-id :id} {}
                   :model/Card       {c1 :id}       {:collection_id coll-id, :collection_position 1}
                   :model/Card       {c2 :id}       {:collection_id coll-id, :collection_position 2}
                   :model/Card       {c3 :id}       {:collection_id coll-id, :collection_position 3}
                   :model/Card       {c4 :id}       {:collection_id coll-id, :collection_position 4}
                   :model/Card       {other :id}    {:collection_id other-id, :collection_position 2}]
      (let [cards [c1 c2 c3 c4 other]]
        (testing "after a position"
          (api.db/shift-card-positions-after! coll-id 2 :+)
          (is (= [1 2 4 5 2] (positions cards)))
          (api.db/shift-card-positions-after! coll-id 2 :-)
          (is (= [1 2 3 4 2] (positions cards))))
        (testing "from a position"
          (api.db/shift-card-positions-from! coll-id 2 :+)
          (is (= [1 3 4 5 2] (positions cards)))
          (api.db/shift-card-positions-from! coll-id 3 :-)
          (is (= [1 2 3 4 2] (positions cards))))
        (testing "between two positions, inclusive"
          (api.db/shift-card-positions-between! coll-id 2 3 :+)
          (is (= [1 3 4 4 2] (positions cards)))
          (api.db/shift-card-positions-between! coll-id 3 4 :-)
          (is (= [1 2 3 3 2] (positions cards))))))))

(deftest shift-card-positions-in-root-collection-test
  (testing "GHY-4481: a nil Collection id shifts the Cards in the root Collection only"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {root :id}    {:collection_id nil, :collection_position 30001}
                   :model/Card       {other :id}   {:collection_id coll-id, :collection_position 30001}]
      (api.db/shift-card-positions-from! nil 30001 :+)
      (is (= [30002 30001] (positions [root other]))))))

(def ^:private sql-looking-name "x' OR '1'='1")

(deftest entity-by-id-compares-condition-values-as-data-test
  (testing "GHY-4481: a string condition value is compared as data, and the other condition shapes still work"
    (mt/with-temp [:model/Card {card-id :id} {:name sql-looking-name, :type :model, :archived false
                                              :public_uuid (str (random-uuid))}
                   :model/Card {plain-id :id} {:name "plain"}]
      (is (nil? (api.db/entity-by-id :model/Card plain-id :name sql-looking-name)))
      (is (= card-id (:id (api.db/entity-by-id :model/Card card-id :name sql-looking-name))))
      (is (= card-id (:id (api.db/entity-by-id :model/Card card-id :archived false :public_uuid [:not= nil]))))
      (is (nil? (api.db/entity-by-id :model/Card card-id :archived true)))
      (testing "a keyword or string value on a column with a keyword transform"
        (is (= card-id (:id (api.db/entity-by-id :model/Card card-id :type :model))))
        (is (= card-id (:id (api.db/entity-by-id :model/Card card-id :type "model"))))))))

(deftest entity-by-id-string-id-test
  (testing "GHY-4481: a string id finds a row of a model whose id column is a string, and a SQL-looking one matches nothing"
    (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :rasta) :title "convo"}]
      (is (string? convo-id))
      (is (= convo-id (:id (api.db/entity-by-id :model/MetabotConversation convo-id))))
      (is (= convo-id (:id (api.db/entity-by-id :model/MetabotConversation convo-id :title "convo"))))
      (is (nil? (api.db/entity-by-id :model/MetabotConversation sql-looking-name))))))

(deftest entity-exists?-compares-condition-values-as-data-test
  (testing "GHY-4481: a string condition value is compared as data, and the other condition shapes still work"
    (mt/with-temp [:model/Card {card-id :id} {:name sql-looking-name, :archived false
                                              :public_uuid (str (random-uuid))}
                   :model/Card {plain-id :id} {:name "plain"}]
      (is (false? (api.db/entity-exists? :model/Card :id plain-id :name sql-looking-name)))
      (is (true? (api.db/entity-exists? :model/Card :id card-id :name sql-looking-name)))
      (is (true? (api.db/entity-exists? :model/Card :id card-id :public_uuid [:not= nil] :archived false)))
      (is (false? (api.db/entity-exists? :model/Card :id plain-id :public_uuid [:not= nil]))))))
