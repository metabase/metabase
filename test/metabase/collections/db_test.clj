(ns metabase.collections.db-test
  "Tests of the clauses that other modules build their reference checks from."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.db :as collections.db]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- passing
  "The ids of the Timelines among `ids` that satisfy `clause`, built over the Timeline table."
  [clause ids]
  (set (t2/select-pks-set :model/Timeline {:where [:and [:in :timeline.id ids] clause]})))

(deftest reference-check-clauses-test
  (mt/with-temp [:model/Collection {default :id}  {}
                 :model/Collection {snippets :id} {:namespace "snippets"}
                 :model/Collection {archived :id} {:archived true}
                 :model/Collection {trash :id}    {:type "trash"}
                 :model/Timeline   root-tl        {}
                 :model/Timeline   default-tl     {:collection_id default}
                 :model/Timeline   snippets-tl    {:collection_id snippets}
                 :model/Timeline   archived-tl    {:collection_id archived}
                 :model/Timeline   trash-tl       {:collection_id trash}]
    (let [ids (mapv u/the-id [root-tl default-tl snippets-tl archived-tl trash-tl])
          the #(set (map u/the-id %))]
      (testing "namespace"
        (is (= (the [root-tl default-tl archived-tl trash-tl])
               (passing (collections.db/namespace-ok-clause :timeline :collection_id #{nil}) ids)))
        (is (= (the [root-tl snippets-tl])
               (passing (collections.db/namespace-ok-clause :timeline :collection_id #{:snippets}) ids))))
      (testing "archived"
        (is (= (the [root-tl default-tl snippets-tl trash-tl])
               (passing (collections.db/not-archived-ok-clause :timeline :collection_id) ids))))
      (testing "trash"
        (is (= (the [root-tl default-tl snippets-tl archived-tl])
               (passing (collections.db/not-trash-ok-clause :timeline :collection_id) ids))))
      (testing "type"
        (is (= (the [root-tl default-tl snippets-tl archived-tl])
               (passing (collections.db/type-ok-clause :timeline :collection_id ["library"]) ids)))))))
