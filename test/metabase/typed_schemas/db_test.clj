(ns metabase.typed-schemas.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.db :as typed-schemas.db]
   [metabase.util.malli.fn :as mu.fn]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest cards-ordered-by-name-accepts-collection-id-sets-test
  (is mu.fn/*enforce*)
  (mt/with-temp [:model/Collection collection {}
                 :model/Card       card       {:name          "Scoped metric"
                                               :type          :metric
                                               :collection_id (:id collection)}]
    (mt/with-test-user :crowberto
      (testing "a non-empty collection scope returns cards in that collection"
        (is (= [(:id card)]
               (mapv :id (typed-schemas.db/cards-ordered-by-name :metric nil #{(:id collection)})))))
      (testing "an empty collection scope matches no cards rather than behaving as unscoped"
        (is (empty? (typed-schemas.db/cards-ordered-by-name :metric nil #{})))))))
