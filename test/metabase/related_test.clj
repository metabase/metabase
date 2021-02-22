(ns metabase.related-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.models :refer [Card Collection Metric Segment]]
            [metabase.related :as r :refer :all]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.one-off-dbs :as one-off-dbs]))

(deftest collect-context-bearing-forms-test
  (is (= #{[:field 1 nil] [:metric 1] [:field 2 nil] [:segment 1]}
         (#'r/collect-context-bearing-forms [[:> [:field 1 nil] 3]
                                             ["and" [:= ["FIELD-ID" 2] 2]
                                              ["segment" 1]]
                                             [:metric 1]]))))


(deftest similiarity-test
  (mt/with-temp* [Card [{card-id-1 :id}
                        {:dataset_query (mt/mbql-query venues
                                          {:aggregation  [[:sum $price]]
                                           :breakout     [$category_id]})}]
                  Card [{card-id-2 :id}
                        {:dataset_query (mt/mbql-query venues
                                          {:aggregation [[:sum $longitude]]
                                           :breakout    [$category_id]})}]
                  Card [{card-id-3 :id}
                        {:dataset_query (mt/mbql-query venues
                                          {:aggregation  [[:sum $longitude]]
                                           :breakout     [$latitude]})}]]
    (let [cards {1 card-id-1
                 2 card-id-2
                 3 card-id-3}]
      (doseq [[[card-x card-y] expected-similarity] {[1 2] 0.5
                                                     [1 3] 0.0
                                                     [1 1] 1.0}]
        (testing (format "Similarity between Card #%d and Card #%d" card-x card-y)
          (is (= expected-similarity
                 (double (#'r/similarity (Card (get cards card-x)) (Card (get cards card-y)))))))))))

(def ^:private ^:dynamic *world*)

(defn- do-with-world [f]
  (mt/with-temp* [Collection [{collection-id :id}]
                  Metric     [{metric-id-a :id} (mt/$ids venues
                                                  {:table_id   $$venues
                                                   :definition {:source-table $$venues
                                                                :aggregation  [[:sum $price]]}})]
                  Metric     [{metric-id-b :id} (mt/$ids venues
                                                  {:table_id   $$venues
                                                   :definition {:source-table $$venues
                                                                :aggregation  [[:count]]}})]
                  Segment    [{segment-id-a :id} (mt/$ids venues
                                                   {:table_id   $$venues
                                                    :definition {:source-table $$venues
                                                                 :filter       [:!= $category_id nil]}})]
                  Segment    [{segment-id-b :id} (mt/$ids venues
                                                   {:table_id   $$venues
                                                    :definition {:source-table $$venues
                                                                 :filter       [:!= $name nil]}})]
                  Card       [{card-id-a :id :as card-a}
                              {:table_id      (mt/id :venues)
                               :dataset_query (mt/mbql-query venues
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category_id]})}]
                  Card       [{card-id-b :id :as card-b}
                              {:table_id      (mt/id :venues)
                               :collection_id collection-id
                               :dataset_query (mt/mbql-query venues
                                                {:aggregation [[:sum $longitude]]
                                                 :breakout    [$category_id]})}]
                  Card       [{card-id-c :id :as card-c}
                              {:table_id      (mt/id :venues)
                               :dataset_query (mt/mbql-query venues
                                                {:aggregation [[:sum $longitude]]
                                                 :breakout    [$name
                                                               $latitude]})}]]
    (binding [*world* {:collection-id collection-id
                       :metric-id-a   metric-id-a
                       :metric-id-b   metric-id-b
                       :segment-id-a  segment-id-a
                       :segment-id-b  segment-id-b
                       :card-id-a     card-id-a
                       :card-id-b     card-id-b
                       :card-id-c     card-id-c}]
      (f *world*))))

(defmacro ^:private with-world [& body]
  `(do-with-world
    (fn [{:keys [~'collection-id
                 ~'metric-id-a ~'metric-id-b
                 ~'segment-id-a ~'segment-id-b
                 ~'card-id-a ~'card-id-b ~'card-id-c]}]
      ~@body)))

(defn- result-mask
  [x]
  (let [m (into {}
                (for [[k v] x]
                  [k (if (sequential? v)
                       (sort (map :id v))
                       (:id v))]))]
    ;; filter out Cards not created as part of `with-world` so these tests can be ran from the REPL.
    (m/update-existing m
                       :similar-questions
                       (partial filter (set ((juxt :card-id-a :card-id-b :card-id-c) *world*))))))

(deftest related-cards-test
  (with-world
    (is (= {:table             (mt/id :venues)
            :metrics           (sort [metric-id-a metric-id-b])
            :segments          (sort [segment-id-a segment-id-b])
            :dashboard-mates   []
            :similar-questions [card-id-b]
            :canonical-metric  metric-id-a
            :collections       [collection-id]
            :dashboards        []}
           (->> (mt/user-http-request :crowberto :get 200 (format "card/%s/related" card-id-a))
                result-mask)))))

(deftest related-metrics-test
  (with-world
    (is (= {:table    (mt/id :venues)
            :metrics  [metric-id-b]
            :segments (sort [segment-id-a segment-id-b])}
           (->> (mt/user-http-request :crowberto :get 200 (format "metric/%s/related" metric-id-a))
                result-mask)))))

(deftest related-segments-test
  (with-world
    (is (= {:table       (mt/id :venues)
            :metrics     (sort [metric-id-a metric-id-b])
            :segments    [segment-id-b]
            :linked-from [(mt/id :checkins)]}
           (->> (mt/user-http-request :crowberto :get 200 (format "segment/%s/related" segment-id-a))
                result-mask)))))

(deftest related-tables-test
  (with-world
    (is (= {:metrics     (sort [metric-id-a metric-id-b])
            :segments    (sort [segment-id-a segment-id-b])
            :linking-to  [(mt/id :categories)]
            :linked-from [(mt/id :checkins)]
            :tables      [(mt/id :users)]}
           (->> (mt/user-http-request :crowberto :get 200 (format "table/%s/related" (mt/id :venues)))
                result-mask)))))


;; We should ignore non-active entities

(defn- exec! [& statements]
  (doseq [statement statements]
    (jdbc/execute! one-off-dbs/*conn* [statement])))

(deftest sync-related-fields-test
  (one-off-dbs/with-blank-db
    (exec! "CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL, weight FLOAT)")
    (one-off-dbs/insert-rows-and-sync! (range 50))
    (let [count-related-fields (fn []
                                 (->> (mt/user-http-request :crowberto :get 200
                                                            (format "field/%s/related" (mt/id :blueberries_consumed :num)))
                                      :fields
                                      count))]
      (testing "before"
        (is (= 1
               (count-related-fields))))
      (exec! "ALTER TABLE blueberries_consumed DROP COLUMN weight")
      (sync/sync-database! (mt/db))
      (testing "after"
        (is (= 0
               (count-related-fields)))))))

(deftest transitive-similarity-test
  (testing "Test transitive similarity"
    ;; (A is similar to B and B is similar to C, but A is not similar to C). Test if
    ;; this property holds and `:similar-questions` for A returns B, for B A and C,
    ;; and for C B. Note that C is less similar to B than A is, as C has an additional
    ;; breakout dimension.
    (with-world
      (is (= [card-id-b]
             (->> (mt/user-http-request :crowberto :get 200 (format "card/%s/related" card-id-a))
                  result-mask
                  :similar-questions)))

      (testing "Ordering matters as C is less similar to B than A."
        (is (= [card-id-a card-id-c]
               (->> (mt/user-http-request :crowberto :get 200 (format "card/%s/related" card-id-b))
                    result-mask
                    :similar-questions)))

        (is (= [card-id-b]
               (->> (mt/user-http-request :crowberto :get 200 (format "card/%s/related" card-id-c))
                    result-mask
                    :similar-questions)))))))
