(ns metabase.query-processor.util.tag-referenced-cards-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :refer [Card]]
   [metabase.query-processor.util.tag-referenced-cards :as qp.u.tag-referenced-cards]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest tags-referenced-cards-lookup-test
  (testing "returns Card instances from raw query"
    (t2.with-temp/with-temp [Card c1 {}
                             Card c2 {}]
      (is (= [c1 c2]
             (qp.u.tag-referenced-cards/tags-referenced-cards
              {:native
               {:template-tags
                {"tag-name-not-important1" {:type    :card
                                            :card-id (:id c1)}
                 "tag-name-not-important2" {:type    :card
                                            :card-id (:id c2)}}}}))))))
