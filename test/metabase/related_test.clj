(ns metabase.related-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models
    :refer [Card Collection Dashboard DashboardCard LegacyMetric Revision Segment]]
   [metabase.related :as related]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel collect-context-bearing-forms-test
  (is (= #{[:field 1 nil] [:metric 1] [:field 2 nil] [:segment 1]}
         (#'related/collect-context-bearing-forms [[:> [:field 1 nil] 3]
                                                   ["and" [:= ["field" 2 nil] 2]
                                                    ["segment" 1]]
                                                   [:metric 1]]))))


(deftest similiarity-test
  (mt/with-temp [Card {card-id-1 :id} {:dataset_query (mt/mbql-query venues
                                                                     {:aggregation  [[:sum $price]]
                                                                      :breakout     [$category_id]})}
                 Card {card-id-2 :id} {:dataset_query (mt/mbql-query venues
                                                                     {:aggregation [[:sum $longitude]]
                                                                      :breakout    [$category_id]})}
                 Card {card-id-3 :id} {:dataset_query (mt/mbql-query venues
                                                                     {:aggregation  [[:sum $longitude]]
                                                                      :breakout     [$latitude]})}]
    (let [cards {1 card-id-1
                 2 card-id-2
                 3 card-id-3}]
      (doseq [[[card-x card-y] expected-similarity] {[1 2] 0.5
                                                     [1 3] 0.0
                                                     [1 1] 1.0}]
        (testing (format "Similarity between Card #%d and Card #%d" card-x card-y)
          (is (= expected-similarity
                 (double (#'related/similarity (t2/select-one Card :id (get cards card-x)) (t2/select-one Card :id (get cards card-y)))))))))))

(def ^:private ^:dynamic *world* {})

(defn- do-with-world [f]
  (mt/with-temp [Collection {collection-id :id} {}
                 LegacyMetric     {metric-id-a :id} (mt/$ids venues
                                                       {:table_id   $$venues
                                                        :definition {:source-table $$venues
                                                                     :aggregation  [[:sum $price]]}})
                 LegacyMetric     {metric-id-b :id} (mt/$ids venues
                                                       {:table_id   $$venues
                                                        :definition {:source-table $$venues
                                                                     :aggregation  [[:count]]}})
                 Segment    {segment-id-a :id} (mt/$ids venues
                                                        {:table_id   $$venues
                                                         :definition {:source-table $$venues
                                                                      :filter       [:!= $category_id nil]}})
                 Segment    {segment-id-b :id} (mt/$ids venues
                                                        {:table_id   $$venues
                                                         :definition {:source-table $$venues
                                                                      :filter       [:!= $name nil]}})
                 Card       {card-id-a :id} {:table_id      (mt/id :venues)
                                             :dataset_query (mt/mbql-query venues
                                                                           {:aggregation [[:sum $price]]
                                                                            :breakout    [$category_id]})}
                 Card       {card-id-b :id} {:table_id      (mt/id :venues)
                                             :collection_id collection-id
                                             :dataset_query (mt/mbql-query venues
                                                                           {:aggregation [[:sum $longitude]]
                                                                            :breakout    [$category_id]})}
                 Card       {card-id-c :id} {:table_id      (mt/id :venues)
                                             :dataset_query (mt/mbql-query venues
                                                                           {:aggregation [[:sum $longitude]]
                                                                            :breakout    [$name
                                                                                          $latitude]})}]
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
    (-> m
        ;; filter out Cards not created as part of `with-world` so these tests can be ran from the REPL.
        (m/update-existing :similar-questions (partial filter (set ((juxt :card-id-a :card-id-b :card-id-c) *world*))))
        ;; do the same for Collections.
        (m/update-existing :collections (partial filter (partial = (:collection-id *world*))))
        (m/update-existing :tables set))))

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
           (->> (mt/user-http-request :crowberto :get 200 (format "legacy-metric/%s/related" metric-id-a))
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
            :tables      #{(mt/id :products) (mt/id :orders) (mt/id :users) (mt/id :people) (mt/id :reviews)}}
           (->> (mt/user-http-request :crowberto :get 200 (format "table/%s/related" (mt/id :venues)))
                result-mask)))))

;; We should ignore non-active entities

(defn- exec! [& statements]
  (doseq [statement statements]
    (jdbc/execute! one-off-dbs/*conn* [statement])))

(deftest sync-related-fields-test
  (one-off-dbs/with-blank-db
    (exec! "CREATE TABLE blueberries_consumed (str TEXT NOT NULL, weight FLOAT)")
    (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
    (let [count-related-fields (fn []
                                 (->> (mt/user-http-request :crowberto :get 200
                                                            (format "field/%s/related" (mt/id :blueberries_consumed :str)))
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

(deftest recommended-dashboards-test
  (t2.with-temp/with-temp [Card          card-1        {}
                           Card          card-2        {}
                           Card          card-3        {}
                           Dashboard     {dash-id :id} {}
                           Revision      _             {:model    "Dashboard"
                                                        :model_id dash-id
                                                        :user_id  (mt/user->id :rasta)
                                                        :object   {}}
                           DashboardCard _             {:card_id (:id card-1), :dashboard_id dash-id}
                           DashboardCard _             {:card_id (:id card-2), :dashboard_id dash-id}]
    (binding [api/*current-user-id*              (mt/user->id :rasta)
              api/*current-user-permissions-set* (atom #{"/"})]
      (is (=? [{:id dash-id}]
              (#'related/recommended-dashboards [card-1 card-2 card-3]))))))
