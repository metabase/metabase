(ns metabase.lib.stage-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel ensure-previous-stages-have-metadata-test
  (let [query (-> lib.tu/venues-query
                  (lib/with-fields [(meta/field-metadata :venues :id) (meta/field-metadata :venues :name)])
                  lib/append-stage
                  lib/append-stage)]
    (is (=? {:stages [{::lib.stage/cached-metadata [{:name "ID",   :lib/source :source/fields}
                                                    {:name "NAME", :lib/source :source/fields}]}
                      {::lib.stage/cached-metadata [{:name "ID",   :lib/source :source/previous-stage}
                                                    {:name "NAME", :lib/source :source/previous-stage}]}
                      {}]}
            (#'lib.stage/ensure-previous-stages-have-metadata query -1)))))

(deftest ^:parallel col-info-field-ids-test
  (testing "make sure columns are coming back the way we'd expect for :field clauses"
    (let [query {:lib/type     :mbql/query
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid "0311c049-4973-4c2a-8153-1e2c887767f9"}
                                 :source-table (meta/id :venues)
                                 :fields       [(lib.tu/field-clause :venues :price)]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (is (mc/validate ::lib.schema/query query))
      (is (=? [(merge (meta/field-metadata :venues :price)
                      {:lib/source :source/fields})]
              (lib/returned-columns query))))))

(deftest ^:parallel deduplicate-expression-names-in-aggregations-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (let [query (lib.tu/venues-query-with-last-stage
                   {:aggregation [[:*
                                   {:lib/uuid (str (random-uuid))}
                                   0.8
                                   [:avg
                                    {:lib/uuid (str (random-uuid))}
                                    (lib.tu/field-clause :venues :price)]]
                                  [:*
                                   {:lib/uuid (str (random-uuid))}
                                   0.8
                                   [:avg
                                    {:lib/uuid (str (random-uuid))}
                                    (lib.tu/field-clause :venues :price)]]]})]
        (is (=? [{:base-type                :type/Float
                  :name                     "expression"
                  :display-name             "0.8 × Average of Price"
                  :lib/source-column-alias  "expression"
                  :lib/desired-column-alias "expression"}
                 {:base-type                :type/Float
                  :name                     "expression"
                  :display-name             "0.8 × Average of Price"
                  :lib/source-column-alias  "expression"
                  :lib/desired-column-alias "expression_2"}]
                (lib/returned-columns query)))))))

(deftest ^:parallel stage-display-name-card-source-query
  (let [query lib.tu/query-with-source-card]
    (is (= "My Card"
           (lib/display-name query)))))

(deftest ^:parallel adding-and-removing-stages
  (let [query                lib.tu/venues-query
        query-with-new-stage (-> query
                                 lib/append-stage
                                 (lib/order-by 1 (meta/field-metadata :venues :name) :asc))]
    (is (= 0 (count (lib/order-bys query-with-new-stage 0))))
    (is (= 1 (count (lib/order-bys query-with-new-stage 1))))
    (is (= query
           (-> query-with-new-stage
               (lib/filter (lib/= 1 (meta/field-metadata :venues :name)))
               (lib/drop-stage))))
    (testing "Dropping with 1 stage should no-op"
      (is (= query (lib/drop-stage query))))))

(deftest ^:parallel drop-stage-if-empty-test
  (let [query (lib/append-stage lib.tu/venues-query)]
    (testing "Dropping new stage works"
      (is (= lib.tu/venues-query (lib/drop-stage-if-empty query))))
    (testing "Dropping only stage is idempotent"
      (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/drop-stage-if-empty query)))))
    (testing "Can drop stage after removing the last"
      (testing "breakout"
        (let [query (lib/breakout query (first (lib/visible-columns query)))]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/breakouts query))))))))
      (testing "aggregation"
        (let [query (lib/aggregate query (lib/count))]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/aggregations query))))))))
      (testing "join"
        (let [query (lib/join query (meta/table-metadata :categories))]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/joins query))))))))
      (testing "field"
        (let [query (lib/with-fields query [(meta/field-metadata :venues :id)])]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/fields query))))))))
      (testing "expression"
        (let [query (lib/expression query "foobar" (lib/+ 1 1))]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/expressions query))))))))
      (testing "filter"
        (let [query (lib/filter query (lib/= 1 1))]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/filters query))))))))
      (testing "order-by"
        (let [query (lib/order-by query (meta/field-metadata :venues :id))]
          (is (= 2 (lib/stage-count (lib/drop-stage-if-empty query))))
          (is (= lib.tu/venues-query (lib/drop-stage-if-empty (lib/remove-clause query (first (lib/order-bys query)))))))))))

(defn- query-with-expressions []
  (let [query (-> lib.tu/venues-query
                  (lib/expression "ID + 1" (lib/+ (meta/field-metadata :venues :id) 1))
                  (lib/expression "ID + 2" (lib/+ (meta/field-metadata :venues :id) 2)))]
    (is (=? {:stages [{:expressions [[:+ {:lib/expression-name "ID + 1"} [:field {} (meta/id :venues :id)] 1]
                                     [:+ {:lib/expression-name "ID + 2"} [:field {} (meta/id :venues :id)] 2]]}]}
            query))
    query))

(deftest ^:parallel default-fields-metadata-include-expressions-test
  (testing "all expressions should come back by default if `:fields` is not specified (#29734)"
    (is (=? [{:id (meta/id :venues :id),          :name "ID",          :lib/source :source/table-defaults}
             {:id (meta/id :venues :name),        :name "NAME",        :lib/source :source/table-defaults}
             {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :lib/source :source/table-defaults}
             {:id (meta/id :venues :latitude),    :name "LATITUDE",    :lib/source :source/table-defaults}
             {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :lib/source :source/table-defaults}
             {:id (meta/id :venues :price),       :name "PRICE",       :lib/source :source/table-defaults}
             {:name "ID + 1", :lib/source :source/expressions}
             {:name "ID + 2", :lib/source :source/expressions}]
            (lib/returned-columns (query-with-expressions))))))

(deftest ^:parallel default-fields-metadata-return-expressions-before-joins-test
  (testing "expressions should come back BEFORE columns from joins"
    (let [query (-> (query-with-expressions)
                    (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all)
                                  (lib/with-join-conditions [(lib/=
                                                              (meta/field-metadata :venues :category-id)
                                                              (-> (meta/field-metadata :categories :id) (lib/with-join-alias "Cat")))]))))]
      (is (=? {:stages [{:joins       [{:alias      "Cat"
                                        :stages     [{:source-table (meta/id :categories)}]
                                        :conditions [[:=
                                                      {}
                                                      [:field {} (meta/id :venues :category-id)]
                                                      [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
                                        :fields     :all}]
                         :expressions [[:+ {:lib/expression-name "ID + 1"} [:field {} (meta/id :venues :id)] 1]
                                       [:+ {:lib/expression-name "ID + 2"} [:field {} (meta/id :venues :id)] 2]]}]}
              query))
      (let [metadata (lib/returned-columns query)]
        (is (=? [{:id (meta/id :venues :id), :name "ID", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :name), :name "NAME", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :latitude), :name "LATITUDE", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :longitude), :name "LONGITUDE", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :price), :name "PRICE", :lib/source :source/table-defaults}
                 {:name "ID + 1", :lib/source :source/expressions}
                 {:name "ID + 2", :lib/source :source/expressions}
                 {:id                       (meta/id :categories :id)
                  :name                     "ID"
                  :lib/source               :source/joins
                  :source-alias             "Cat"
                  :display-name             "ID"
                  :lib/source-column-alias  "ID"
                  :lib/desired-column-alias "Cat__ID"}
                 {:id                       (meta/id :categories :name)
                  :name                     "NAME"
                  :lib/source               :source/joins
                  :source-alias             "Cat"
                  :display-name             "Name"
                  :lib/source-column-alias  "NAME"
                  :lib/desired-column-alias "Cat__NAME"}]
                metadata))
        (testing ":long display names"
          (is (= ["ID"
                  "Name"
                  "Category ID"
                  "Latitude"
                  "Longitude"
                  "Price"
                  "ID + 1"
                  "ID + 2"
                  "Cat → ID"
                  "Cat → Name"]
                 (mapv #(lib/display-name query -1 % :long) metadata))))))))

(deftest ^:parallel query-with-source-card-include-implicit-columns-test
  (testing "visible-columns should include implicitly joinable columns when the query has a source Card (#30046)"
    (doseq [varr [#'lib.tu/query-with-source-card
                  #'lib.tu/query-with-source-card-with-result-metadata]
            :let [query @varr]]
      (testing (pr-str varr)
        (is (=? [{:name                     "USER_ID"
                  :display-name             "User ID"
                  :base-type                :type/Integer
                  :lib/source               :source/card
                  :lib/desired-column-alias "USER_ID"}
                 {:name                     "count"
                  :display-name             "Count"
                  :base-type                :type/Integer
                  :lib/source               :source/card
                  :lib/desired-column-alias "count"}
                 {:name                     "ID"
                  :display-name             "ID"
                  :base-type                :type/BigInteger
                  :lib/source               :source/implicitly-joinable
                  :lib/desired-column-alias "USERS__via__USER_ID__ID"}
                 {:name                     "NAME"
                  :display-name             "Name"
                  :base-type                :type/Text
                  :lib/source               :source/implicitly-joinable
                  :lib/desired-column-alias "USERS__via__USER_ID__NAME"}
                 {:name                     "LAST_LOGIN"
                  :display-name             "Last Login"
                  :base-type                :type/DateTime
                  :lib/source               :source/implicitly-joinable
                  :lib/desired-column-alias "USERS__via__USER_ID__LAST_LOGIN"}]
                (lib/visible-columns query)))))))

(deftest ^:parallel do-not-propagate-temporal-units-to-next-stage-text
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                  (lib/with-fields [(lib/with-temporal-bucket (meta/field-metadata :checkins :date) :year)])
                  lib/append-stage)
        cols (lib/visible-columns query)]
    (is (= [nil]
           (map lib/temporal-bucket cols)))
    (is (=? [[:field
              (fn expected-opts? [opts]
                (and
                 ;; should retain the effective type of `:type/Integer` since `:year` is an extraction operation.
                 (= (:base-type opts) :type/Date)
                 (= (:effective-type opts) :type/Integer)
                 (not (:temporal-unit opts))))
              "DATE"]]
            (map lib/ref cols)))))

(deftest ^:parallel fields-should-not-hide-joined-fields
  (let [query (-> lib.tu/venues-query
                  (lib/with-fields [(meta/field-metadata :venues :id)
                                    (meta/field-metadata :venues :name)])
                  (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                (lib/with-join-alias "Cat")
                                (lib/with-join-fields :all)
                                (lib/with-join-conditions [(lib/= (meta/field-metadata :venues :category-id)
                                                                  (meta/field-metadata :categories :id))])))
                  (lib/append-stage))]
    (is (=? [{:base-type :type/BigInteger,
              :semantic-type :type/PK,
              :name "ID",
              :lib/source :source/previous-stage
              :effective-type :type/BigInteger,
              :lib/desired-column-alias "ID",
              :display-name "ID"}
             {:base-type :type/Text,
              :semantic-type :type/Name,
              :name "NAME",
              :lib/source :source/previous-stage,
              :effective-type :type/Text,
              :lib/desired-column-alias "NAME",
              :display-name "Name"}
             {:base-type :type/BigInteger,
              :semantic-type :type/PK,
              :name "ID",
              :lib/source :source/previous-stage
              :effective-type :type/BigInteger,
              :lib/desired-column-alias "Cat__ID",
              :display-name "ID"}
             {:base-type :type/Text,
              :semantic-type :type/Name,
              :name "NAME",
              :lib/source :source/previous-stage
              :effective-type :type/Text,
              :lib/desired-column-alias "Cat__NAME",
              :display-name "Name"}]
            (lib/visible-columns query)))))

(deftest ^:parallel expression-breakout-visible-column
  (testing "expression breakouts are handled by visible-columns"
    (let [expr-name "ID + 1"
          query (-> (query-with-expressions)
                    (lib/breakout [:expression {:lib/uuid (str (random-uuid))} expr-name]))]
      (is (=? [{:lib/type :metadata/column
                :lib/source :source/expressions}]
              (filter #(= (:name %) expr-name)
                      (lib/visible-columns query)))))))

(defn- metadata-for-breakouts-from-joins-test-query
  "A query against `ORDERS` with joins against `PRODUCTS` and `PEOPLE`, and breakouts on columns from both of those
  joins."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                    (lib/with-join-alias "P1")
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :orders :product-id)
                                                      (-> (meta/field-metadata :products :id)
                                                          (lib/with-join-alias "P1")))])))
      (lib/join (-> (lib/join-clause (meta/table-metadata :people))
                    (lib/with-join-alias "People")
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :orders :user-id)
                                                      (-> (meta/field-metadata :people :id)
                                                          (lib/with-join-alias "People")))])))
      (lib/breakout (-> (meta/field-metadata :products :category)
                        (lib/with-join-alias "P1")))
      (lib/breakout (-> (meta/field-metadata :people :source)
                        (lib/with-join-alias "People")))
      (lib/aggregate (lib/count))))

(deftest ^:parallel metadata-for-breakouts-from-joins-test
  (testing "metadata for breakouts of joined columns should be calculated correctly (#29907)"
    (let [query (metadata-for-breakouts-from-joins-test-query)]
      (is (= [{:name                     "CATEGORY"
               :lib/source-column-alias  "CATEGORY"
               ::lib.join/join-alias     "P1"
               :lib/desired-column-alias "P1__CATEGORY"}
              {:name                     "SOURCE"
               :lib/source-column-alias  "SOURCE"
               ::lib.join/join-alias     "People"
               :lib/desired-column-alias "People__SOURCE"}
              {:name                     "count"
               :lib/source-column-alias  "count"
               :lib/desired-column-alias "count"}]
             (map #(select-keys % [:name :lib/source-column-alias ::lib.join/join-alias :lib/desired-column-alias])
                  (lib/returned-columns query)))))))

(defn- metadata-for-breakouts-from-joins-test-query-2
  "A query against `REVIEWS` joining `PRODUCTS`."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :reviews))
      (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                    (lib/with-join-alias "P2")
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :reviews :product-id)
                                                      (-> (meta/field-metadata :products :id)
                                                          (lib/with-join-alias "P2")))])))
      (lib/breakout (-> (meta/field-metadata :products :category)
                        (lib/with-join-alias "P2")))
      (lib/aggregate (lib/avg (meta/field-metadata :reviews :rating)))
      lib/append-stage))

(deftest ^:parallel metadata-for-breakouts-from-joins-test-2
  (testing "metadata for breakouts of joined columns should be calculated correctly (#29907)"
    (let [query (metadata-for-breakouts-from-joins-test-query-2)]
      (is (= [{:name "CATEGORY", :lib/source-column-alias "P2__CATEGORY", :lib/desired-column-alias "P2__CATEGORY"}
              {:name "avg", :lib/source-column-alias "avg", :lib/desired-column-alias "avg"}]
             (map #(select-keys % [:name :lib/source-column-alias ::lib.join/join-alias :lib/desired-column-alias])
                  (lib/returned-columns query)))))))

(defn- metadata-for-breakouts-from-joins-from-previous-stage-test-query
  "[[metadata-for-breakouts-from-joins-test-query]] but with an additional stage and a join
  against [[metadata-for-breakouts-from-joins-test-query-2]]. This means there are two joins against `PRODUCTS`, one
  from the first stage and one from the nested query in the join in the second stage."
  []
  (-> (metadata-for-breakouts-from-joins-test-query)
      lib/append-stage
      (lib/join (-> (lib/join-clause (metadata-for-breakouts-from-joins-test-query-2))
                    (lib/with-join-alias "Q2")
                    (lib/with-join-conditions [(lib/= (-> (meta/field-metadata :products :category)
                                                          (lib/with-join-alias "P1"))
                                                      (-> (meta/field-metadata :products :category)
                                                          (lib/with-join-alias "Q2")))])))))

(deftest ^:parallel metadata-for-breakouts-from-joins-from-previous-stage-test
  (testing "metadata for breakouts of columns from join in previous stage should be calculated correctly (#29907)"
    (let [query (metadata-for-breakouts-from-joins-from-previous-stage-test-query)]
      (is (= [{:name                     "CATEGORY"
               :lib/source-column-alias  "P1__CATEGORY"
               :lib/desired-column-alias "P1__CATEGORY"}
              {:name                     "SOURCE"
               :lib/source-column-alias  "People__SOURCE"
               :lib/desired-column-alias "People__SOURCE"}
              {:name                     "count"
               :lib/source-column-alias  "count"
               :lib/desired-column-alias "count"}
              {:name                     "CATEGORY"
               :lib/source-column-alias  "P2__CATEGORY"
               ::lib.join/join-alias     "Q2"
               :lib/desired-column-alias "Q2__P2__CATEGORY"}
              {:name                     "avg"
               :lib/source-column-alias  "avg"
               ::lib.join/join-alias     "Q2"
               :lib/desired-column-alias "Q2__avg"}]
             (map #(select-keys % [:name :lib/source-column-alias ::lib.join/join-alias :lib/desired-column-alias])
                  (lib/returned-columns query)))))))
