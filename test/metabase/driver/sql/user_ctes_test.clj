(ns ^:mb/driver-tests metabase.driver.sql.user-ctes-test
  "End-to-end compile + run tests for user-declared CTEs on the MBQL 5 query."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.notebook-helpers :as nb]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]))

(deftest ^:parallel all-user-ctes-collection-test
  (let [cte (fn [cte-name & {:keys [ctes stages]}]
              {:lib/type :mbql/cte
               :lib/uuid cte-name       ; unique in this test
               :cte-name cte-name
               :query    (cond-> {:lib/type :mbql/query, :stages (or stages [])}
                           ctes (assoc :ctes ctes))})
        all-user-ctes @#'sql.qp/all-user-ctes]
    (testing "flat list of top-level CTEs — order preserved"
      (let [a (cte "a")
            b (cte "b")]
        (is (= ["a" "b"]
               (mapv :cte-name (all-user-ctes [a b] []))))))

    (testing "CTEs nested inside another CTE's body are discovered and come before their parent"
      (let [inner (cte "inner")
            outer (cte "outer" :ctes [inner])]
        (is (= ["inner" "outer"]
               (mapv :cte-name (all-user-ctes [outer] []))))))

    (testing "transitive nesting: deepest-first"
      (let [z (cte "z")
            y (cte "y" :ctes [z])
            x (cte "x" :ctes [y])]
        (is (= ["z" "y" "x"]
               (mapv :cte-name (all-user-ctes [x] []))))))

    (testing "CTEs attached to joins in the top stages are discovered"
      (let [in-join (cte "in_join")
            stages  [{:joins [{:lib/type :mbql/join, :ctes [in-join]}]}]]
        (is (= ["in_join"]
               (mapv :cte-name (all-user-ctes [] stages))))))

    (testing "CTEs attached to joins inside a CTE body are discovered"
      (let [deep        (cte "deep")
            body-stages [{:joins [{:lib/type :mbql/join, :ctes [deep]}]}]
            parent      (cte "parent" :stages body-stages)]
        (is (= ["deep" "parent"]
               (mapv :cte-name (all-user-ctes [parent] []))))))

    (testing "duplicate uuid reached via multiple paths appears once"
      (let [shared (cte "shared")
            branch (cte "branch" :ctes [shared]) ; shared via body of branch (deepest)
            stages [{:joins [{:lib/type :mbql/join, :ctes [shared]}]}]]
        (is (= ["shared" "branch"]
               (mapv :cte-name (all-user-ctes [branch] stages))))))))

(deftest ^:parallel wrap-as-cte-compile-and-run-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
    (let [mp     (mt/metadata-provider)
          venues (lib.metadata/table mp (mt/id :venues))
          base   (lib/query mp venues)
          query  (lib/wrap-as-cte base "venues_cte")]
      (testing "a single wrap-as-cte compiles to a WITH clause and runs correctly"
        (mt/with-native-query-testing-context query
          (let [native (-> query qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?venues_cte[\"`]?\s+AS" native)))
          (is (= (count (mt/rows (qp/process-query base)))
                 (count (mt/rows (qp/process-query query))))))))))

(deftest ^:parallel aggregation-in-cte-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
    (let [mp        (mt/metadata-provider)
          checkins  (lib.metadata/table mp (mt/id :checkins))
          base      (lib/query mp checkins)
          venue-id  (nb/find-col-with-spec base (lib/visible-columns base)
                                           "Checkins" "Venue ID")
          counts    (-> base
                        (lib/breakout venue-id)
                        (lib/aggregate (lib/count))
                        (lib/wrap-as-cte "venue_counts"))
          count-col (nb/find-col-with-spec counts (lib/visible-columns counts)
                                           "venue_counts" "Count")
          popular   (lib/filter counts (lib/>= count-col 10))]
      (testing "a CTE body with breakout + aggregate, then filter on the aggregated column"
        (mt/with-native-query-testing-context popular
          (let [native (-> popular qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?venue_counts[\"`]?\s+AS" native))
            (is (re-find #"(?i)GROUP\s+BY" native))
            (is (re-find #"(?i)>=\s*10" native)))
          (let [rows (mt/rows (qp/process-query popular))]
            (is (every? #(>= (second %) 10) rows))))))))

(deftest ^:parallel join-cte-from-main-test
  (testing "the scope_actors pattern: main query FROMs venues, joins a CTE"
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
      (let [mp        (mt/metadata-provider)
            venues    (lib.metadata/table mp (mt/id :venues))
            checkins  (lib.metadata/table mp (mt/id :checkins))
            ;; CTE body: distinct venue IDs that have at least one checkin
            cte-body  (let [base (lib/query mp checkins)
                            vid  (nb/find-col-with-spec base (lib/visible-columns base)
                                                        "Checkins" "Venue ID")]
                        (-> base (lib/breakout vid)))
            cte-query (lib/wrap-as-cte cte-body "checked_in_venues")
            main      (lib/query mp venues)
            venue-id  (nb/find-col-with-spec main (lib/visible-columns main) "Venues" "ID")
            cte-vid   (nb/find-col-with-spec cte-query (lib/visible-columns cte-query)
                                             "checked_in_venues" "Venue ID")
            joined    (lib/join main (-> (lib/join-clause cte-query [(lib/= venue-id cte-vid)])
                                         (lib/with-join-alias "c")))]
        (mt/with-native-query-testing-context joined
          (let [native (-> joined qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?checked_in_venues[\"`]?\s+AS" native))
            (is (re-find #"(?i)JOIN\s+[\"`]?checked_in_venues[\"`]?|JOIN\s*\(" native)))
          ;; test-data venues has 100 rows; every venue appears in checkins
          (is (= 100 (count (mt/rows (qp/process-query joined))))))))))

(deftest ^:parallel events-base-shape-test
  (testing "analysis shape: base CTE filters events, main query breakouts + aggregates"
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
      (let [mp         (mt/metadata-provider)
            checkins   (lib.metadata/table mp (mt/id :checkins))
            ;; CTE body: events for a single user — "events_base" pattern
            cte-query  (let [base    (lib/query mp checkins)
                             user-id (nb/find-col-with-spec base (lib/visible-columns base)
                                                            "Checkins" "User ID")]
                         (-> base
                             (lib/filter (lib/= user-id 1))
                             (lib/wrap-as-cte "events_base")))
            venue-id   (nb/find-col-with-spec cte-query (lib/visible-columns cte-query)
                                              "events_base" "Venue ID")
            aggregated (-> cte-query
                           (lib/breakout venue-id)
                           (lib/aggregate (lib/count)))]
        (mt/with-native-query-testing-context aggregated
          (let [native (-> aggregated qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?events_base[\"`]?\s+AS" native))
            (is (re-find #"(?i)GROUP\s+BY" native)))
          (let [rows (mt/rows (qp/process-query aggregated))]
            ;; test-data: user 1 has 31 checkins across 29 distinct venues
            (is (= 29 (count rows)))
            (is (= 31 (transduce (map second) + rows)))))))))

(deftest ^:parallel source-card-in-cte-body-test
  (testing "a CTE body that reads from a saved Card (source-card inside the CTE's query)"
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
      (let [card-id   1
            base-mp   (mt/metadata-provider)
            venues    (lib.metadata/table base-mp (mt/id :venues))
            price     (nb/find-col-with-spec (lib/query base-mp venues)
                                             (lib/visible-columns (lib/query base-mp venues))
                                             "Venues" "Price")
            card-q    (-> (lib/query base-mp venues)
                          (lib/filter (lib/= price 4)))
            mp        (lib/composed-metadata-provider
                       (lib.tu/mock-metadata-provider
                        {:cards [{:id            card-id
                                  :name          "price=4"
                                  :database-id   (mt/id)
                                  :dataset-query card-q}]})
                       base-mp)
            from-card (lib/query mp (lib.metadata/card mp card-id))
            cte-query (lib/wrap-as-cte from-card "card_cte")]
        (mt/with-native-query-testing-context cte-query
          (let [native (-> cte-query qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?card_cte[\"`]?\s+AS" native)))
          ;; test-data has 6 venues with price = 4
          (is (= 6 (count (mt/rows (qp/process-query cte-query))))))))))

(deftest ^:parallel remapped-column-in-cte-body-test
  (testing "a CTE body against a table with a remapped column still decorates results downstream"
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
      (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                           (lib.tu/remap-metadata-provider
                                            (mt/id :venues :category_id)
                                            (qp.test-util/field-values-from-def
                                             defs/test-data "categories" "name")))
        (let [mp     (qp.store/metadata-provider)
              venues (lib.metadata/table mp (mt/id :venues))
              base   (lib/query mp venues)
              cte-q  (lib/wrap-as-cte base "venues_remapped")
              cat-id (nb/find-col-with-spec cte-q (lib/breakoutable-columns cte-q)
                                            "venues_remapped" "Category ID")
              counts (-> cte-q
                         (lib/breakout cat-id)
                         (lib/aggregate (lib/count)))]
          (mt/with-native-query-testing-context counts
            (let [result (qp/process-query counts)]
              (is (re-find #"(?i)WITH\s+[\"`]?venues_remapped[\"`]?\s+AS"
                           (-> result :data :native_form :query)))
              ;; remap decorates the result with a third column carrying the display values
              (is (= 3 (count (:cols (:data result)))))
              (is (= "Category ID [internal remap]" (:name (nth (:cols (:data result)) 2))))
              ;; test-data's category_id = 2 is "American" and matches 8 venues
              (is (some #{[2 8 "American"]} (mt/rows result))))))))))

(deftest ^:parallel scope-actors-pattern-test
  (testing "two-CTE analytics shape: events_base + scope_actors derived from it, both referenced from main"
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
      (let [mp         (mt/metadata-provider)
            checkins   (lib.metadata/table mp (mt/id :checkins))
            ;; Build up through two wrap-as-cte calls, then switch source back to events_base and join scope_actors.
            with-sa    (-> (lib/query mp checkins)
                           (lib/wrap-as-cte "events_base"))
            user-id    (nb/find-col-with-spec with-sa (lib/breakoutable-columns with-sa)
                                              "events_base" "User ID")
            with-sa    (-> with-sa
                           (lib/breakout user-id)
                           (lib/aggregate (lib/count))
                           ;; new stage so the filter becomes HAVING on the grouped stage
                           lib/append-stage)
            count-col  (nb/find-col-with-spec with-sa (lib/filterable-columns with-sa)
                                              "Summaries" "Count")
            with-sa    (-> with-sa
                           (lib/filter (lib/>= count-col 70))
                           (lib/wrap-as-cte "scope_actors")
                           ;; Main stage: reads events_base, joined to scope_actors by user_id.
                           (lib/with-source-cte "events_base"))
            sa-meta    (lib/cte-metadata with-sa "scope_actors")
            sa-user-id (nb/find-col-with-spec with-sa (lib/returned-columns with-sa sa-meta)
                                              "scope_actors" "User ID")
            eb-user-id (nb/find-col-with-spec with-sa (lib/filterable-columns with-sa)
                                              "events_base" "User ID")
            main       (lib/join with-sa (-> (lib/join-clause sa-meta [(lib/= eb-user-id sa-user-id)])
                                              (lib/with-join-strategy :inner-join)))]
        (mt/with-native-query-testing-context main
          (let [native (-> main qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?events_base[\"`]?\s+AS" native))
            (is (re-find #"(?i)[\"`]?scope_actors[\"`]?\s+AS" native)))
          ;; INNER JOIN with scope_actors restricts to checkins from users with >= 70 events.
          ;; In test-data, 9 of 15 users clear 70 checkins, contributing 677 of the 1000 total rows.
          (is (= 677 (count (mt/rows (qp/process-query main))))))))))

(deftest ^:parallel chained-wrap-as-cte-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes], :+parent :sql})
    (let [mp             (mt/metadata-provider)
          venues         (lib.metadata/table mp (mt/id :venues))
          base           (lib/query mp venues)
          price          (nb/find-col-with-spec base (lib/visible-columns base) "Venues" "Price")
          price=4        (-> base (lib/filter (lib/= price 4)))
          cat            (nb/find-col-with-spec price=4 (lib/visible-columns price=4) "Venues" "Category ID")
          cat=4          (-> price=4 (lib/filter (lib/= cat 4)))
          expensive      (-> price=4 (lib/wrap-as-cte "expensive"))
          price-then-cat (-> expensive
                             (lib/filter (lib/= (nb/find-col-with-spec
                                                 expensive (lib/visible-columns expensive)
                                                 "expensive" "Category ID")
                                                4))
                             (lib/wrap-as-cte "expensive_cat_4"))]
      (testing "two chained CTEs compile and the result matches the non-CTE equivalent"
        (mt/with-native-query-testing-context price-then-cat
          (let [native (-> price-then-cat qp/process-query :data :native_form :query)]
            (is (re-find #"(?i)WITH\s+[\"`]?expensive[\"`]?" native))
            (is (re-find #"(?i)[\"`]?expensive_cat_4[\"`]?\s+AS" native)))
          (is (= (count (mt/rows (qp/process-query cat=4)))
                 (count (mt/rows (qp/process-query price-then-cat))))))))))
