(ns metabase.lib.query-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.merged-mock :as merged-mock]
   [metabase.lib.util :as lib.util]
   [metabase.types :as types]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> lib.tu/venues-query
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
        ;; wrong arity: there's a bug in our Kondo config, see
        ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1679022185079739?thread_ts=1679022025.317059&cid=C04DN5VRQM6
        query (-> #_{:clj-kondo/ignore [:invalid-arity]}
                  (lib/filter query (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/order-by (meta/field-metadata :venues :id))
                  (lib/limit 100))]
    (is (= (str "Venues,"
                " Sum of Price,"
                " Grouped by Category ID,"
                " Filtered by Name is Toucannery,"
                " Sorted by ID ascending,"
                " 100 rows")
           (lib/display-name query)
           (lib/describe-query query)
           (lib/suggested-name query)))))

(deftest ^:parallel notebook-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql}]}
          (lib/query meta/metadata-provider {:database (meta/id)
                                             :type     :query
                                             :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}}))))

(deftest ^:parallel with-different-table-test
  (let [query (-> (lib/query lib.tu/metadata-provider-with-mock-cards (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/limit 100)
                  (lib/append-stage))
        card-id (:id (lib.tu/mock-cards :orders))]
    (is (= [{:lib/type :mbql.stage/mbql :source-table (meta/id :orders)}]
           (:stages (lib/with-different-table query (meta/id :orders)))))
    (is (= [{:lib/type :mbql.stage/mbql :source-card card-id}]
           (:stages (lib/with-different-table query (str "card__" card-id)))))))

(deftest ^:parallel type-fill-in-converted-test
  (is (=? {:stages [{:fields [[:field {:base-type :type/BigInteger
                                       :effective-type :type/BigInteger}
                               (meta/id :venues :id)]]
                     :filters [[:= {} [:expression {:base-type :type/Integer :effective-type :type/Integer} "math"] 2]]}]}
          (lib/query
           meta/metadata-provider
            (lib.convert/->pMBQL {:type :query
                                  :database (meta/id)
                                  :query {:source-table (meta/id :venues)
                                          :expressions {"math" [:+ 1 1]}
                                          :fields [[:field (meta/id :venues :id) nil]]
                                          :filters [[:= [:expression "math"] 2]]}}))))
  (testing "filling in works for nested join queries"
    (let [clause (as-> (lib/expression lib.tu/venues-query "CC" (lib/+ 1 1)) $q
                   (lib/join-clause $q [(lib/= (meta/field-metadata :venues :id)
                                               (lib/expression-ref $q "CC"))]))
          query (lib/join lib.tu/venues-query clause)
          ;; Make a legacy query but don't put types in :field and :expression
          converted-query (lib.convert/->pMBQL
                            (walk/postwalk
                              (fn [node]
                                (if (map? node)
                                  (dissoc node :base-type :effective-type)
                                  node))
                              (lib.convert/->legacy-MBQL query)))]
      (is (=? {:stages [{:joins [{:conditions [[:= {}
                                                [:field {:base-type :type/BigInteger} (meta/id :venues :id)]
                                                [:expression
                                                 {}
                                                 ;; TODO Fill these in?
                                                 #_{:base-type :type/Integer}
                                                 "CC"]]]}]}]}

              (lib/query meta/metadata-provider converted-query))))))

(deftest ^:parallel converted-query-leaves-stage-metadata-refs-alone
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                  (lib/expression "BirthMonth" (lib/+ 1 1))
                  (as-> $q (lib/breakout $q (m/find-first #(= (:name %) "BirthMonth") (lib/breakoutable-columns $q))))
                  (lib/aggregate (lib/count))
                  (lib/append-stage)
                  (lib/aggregate (lib/count)))]
    (is (=? {:stages [{:lib/stage-metadata {:columns [{:field-ref [:expression "BirthMonth" {:base-type :type/Integer}]} {}]}} {}]}
          (lib/query meta/metadata-provider (assoc-in (lib.convert/->pMBQL (lib.convert/->legacy-MBQL query))
                                                        [:stages 0 :lib/stage-metadata]
                                                        {:columns [{:base-type :type/Float,
                                                                    :display-name "BirthMonth",
                                                                    :field-ref [:expression
                                                                                "BirthMonth"
                                                                                {:base-type :type/Integer}],
                                                                    :name "BirthMonth",
                                                                    :lib/type :metadata/column}
                                                                   {:base-type :type/Integer,
                                                                    :display-name "Count",
                                                                    :field-ref [:aggregation 0],
                                                                    :name "count",
                                                                    :semantic-type :type/Quantity,
                                                                    :lib/type :metadata/column}],
                                                         :lib/type :metadata/results}))))))

(deftest ^:parallel stage-count-test
  (is (= 1 (lib/stage-count lib.tu/venues-query)))
  (is (= 2 (lib/stage-count (lib/append-stage lib.tu/venues-query))))
  (is (= 3 (lib/stage-count (lib/append-stage (lib/append-stage lib.tu/venues-query))))))

(deftest ^:parallel native?-test
  (testing "MBQL queries are not native"
    (is (not (lib.query/native? (lib/query meta/metadata-provider (meta/table-metadata :orders))))))
  (testing "SQL queries are native"
    (is (lib.query/native? (lib/native-query meta/metadata-provider "SELECT * FROM Orders;")))))

(deftest ^:parallel display-info-test
  (testing "display-info"
    (testing "on MBQL queries"
      (let [editable    (lib/query meta/metadata-provider (meta/table-metadata :orders))]
        (are [editable? query] (= {:is-native   false
                                   :is-editable editable?}
                                  (mu/disable-enforcement
                                    (lib/display-info query -1 query)))
          true  editable
          false (assoc editable :database 999999999)                       ; database unknown - no permissions
          false (assoc-in editable [:stages 0 :source-table] 999999999)    ; source-table not visible
          false (lib.util/update-query-stage
                  editable 0
                  #(-> %
                       ; source-card not visible
                       (assoc :source-card 999999999)
                       (dissoc :source-table))))))
    (testing "on native queries (#37765)"
      (let [editable              (lib/native-query meta/metadata-provider "SELECT * FROM Venues;")
            ;; Logic for the native-query mock borrowed from metabase.lib.native/has-write-permission-test
            mock-db-native-perms #(lib/native-query (lib.tu/mock-metadata-provider
                                                     meta/metadata-provider
                                                     {:database (merge (lib.metadata/database meta/metadata-provider) {:native-permissions %})})
                                                    "select * from x;")]
        (are [editable? query] (= {:is-native   true
                                   :is-editable editable?}
                                  (mu/disable-enforcement
                                   (lib/display-info query -1 query)))
          true  editable
          false (assoc editable :database 999999999)    ; database unknown - no permissions
          false (mock-db-native-perms :none)            ; native-permissions explicitly set to :none
          false (mock-db-native-perms nil))))))         ; native-permissions not found on the database

(deftest ^:parallel can-save-mbql-test
  (is (lib.query/can-save lib.tu/venues-query)))

(deftest ^:parallel coerced-fields-effective-type-test
  (let [effective-type (types/effective-type-for-coercion :Coercion/UNIXSeconds->DateTime)
        mp (merged-mock/merged-mock-metadata-provider
            meta/metadata-provider
            {:fields [{:id                (meta/id :people :id)
                       :coercion-strategy :Coercion/UNIXSeconds->DateTime
                       :effective-type    effective-type}]})
        query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :people)
                          :filter       [:and
                                         [:between
                                          [:field (meta/id :people :id) {:base-type :type/BigInteger}]
                                          "1969-10-12"
                                          "1971-10-12"]]}}]
    (testing "Effective type is added to coerced fields during legacy query transformation (part of issue #42931)"
      (is (=? {:stages [{:filters [[:between
                                    {:lib/uuid string?}
                                    [:field
                                     {:lib/uuid       string?
                                      :base-type      :type/BigInteger
                                      :effective-type effective-type}
                                     (meta/id :people :id)]
                                    "1969-10-12"
                                    "1971-10-12"]]}]}
              (lib/query mp query))))))
