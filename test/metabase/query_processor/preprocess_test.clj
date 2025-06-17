(ns metabase.query-processor.preprocess-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(deftest preprocess-caching-test
  (testing "`preprocess` should work the same even if query has cached results (#18579)"
    ;; make a copy of the `test-data` DB so there will be no cache entries from previous test runs possibly affecting
    ;; this test.
    (mt/with-temp-copy-of-db
      (let [query            (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                                    :cache-strategy {:type             :ttl
                                                     :multiplier       60
                                                     :avg-execution-ms 100
                                                     :min-duration-ms  0})
            run-query        (fn []
                               (let [results (qp/process-query query)]
                                 {:cached?  (boolean (:cached (:cache/details results)))
                                  :num-rows (count (mt/rows results))}))
            expected-results (qp.preprocess/preprocess query)]
        (testing "Check preprocess before caching to make sure results make sense"
          (is (=? {:database (mt/id)}
                  expected-results)))
        (testing "Run the query a few of times so we know it's cached"
          (testing "first run"
            (is (= {:cached?  false
                    :num-rows 5}
                   (run-query))))
          (testing "should be cached now"
            (is (= {:cached?  true
                    :num-rows 5}
                   (run-query))))
          (testing "preprocess should return same results even when query was cached."
            (is (= expected-results
                   (qp.preprocess/preprocess query)))))))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod tx/create-db! ::custom-escape-spaces-to-underscores
  [& _]
  ;; no-op since we should be able to reuse the data from H2 tests
  nil)

(defmethod tx/destroy-db! ::custom-escape-spaces-to-underscores
  [& _]
  ;; no-op since we don't want to stomp on data used by H2 tests
  nil)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest ^:parallel query->expected-cols-test
  (testing "field_refs in expected columns have the original join aliases (#30648)"
    (mt/dataset test-data
      (binding [driver/*driver* ::custom-escape-spaces-to-underscores]
        (let [query
              (mt/mbql-query
                products
                {:joins
                 [{:source-query
                   {:source-table $$orders
                    :joins
                    [{:source-table $$people
                      :alias "People"
                      :condition [:= $orders.user_id &People.people.id]
                      :fields [&People.people.address]
                      :strategy :left-join}]
                    :fields [$orders.id &People.people.address]}
                   :alias "Question 54"
                   :condition [:= $id [:field %orders.id {:join-alias "Question 54"}]]
                   :fields [[:field %orders.id {:join-alias "Question 54"}]
                            [:field %people.address {:join-alias "Question 54"}]]
                   :strategy :left-join}]
                 :fields
                 [!default.created_at
                  [:field %orders.id {:join-alias "Question 54"}]
                  [:field %people.address {:join-alias "Question 54"}]]})]
          (is (=? [{:name "CREATED_AT"
                    :field_ref [:field (mt/id :products :created_at) {:temporal-unit :default}]
                    :display_name "Created At"}
                   {:name "ID"
                    :field_ref [:field (mt/id :orders :id) {:join-alias "Question 54"}]
                    :display_name "Question 54 → ID"}
                   {:name "ADDRESS"
                    :field_ref [:field (mt/id :people :address) {:join-alias "Question 54"}]
                    :display_name "Question 54 → Address"}]
                  (qp.preprocess/query->expected-cols query))))))))

(deftest ^:parallel deduplicate-column-names-test
  (testing "`query->expected-cols` should return deduplicated column names"
    (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
           (map :name (qp.preprocess/query->expected-cols
                       (mt/mbql-query checkins
                         {:source-table $$checkins
                          :joins
                          [{:fields       :all
                            :alias        "u"
                            :source-table $$users
                            :condition    [:= $user_id &u.users.id]}]})))))))

;;; adapted from [[metabase.query-processor-test.model-test/model-self-join-test]]
(deftest ^:parallel model-duplicate-joins-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp meta/metadata-provider
          mp (lib.tu/mock-metadata-provider
              mp
              {:cards [{:id 1
                        :dataset-query
                        (-> (lib/query mp (lib.metadata/table mp (meta/id :products)))
                            (lib/join (-> (lib/join-clause (lib.metadata/table mp (meta/id :reviews))
                                                           [(lib/=
                                                             (lib.metadata/field mp (meta/id :products :id))
                                                             (lib.metadata/field mp (meta/id :reviews :product-id)))])
                                          (lib/with-join-fields :all)))
                            lib.convert/->legacy-MBQL)
                        :database-id (meta/id)
                        :name "Products+Reviews"
                        :type :model}]})
          mp (lib.tu/mock-metadata-provider
              mp
              {:cards [{:id 2
                        :dataset-query
                        (binding [lib.metadata.calculation/*display-name-style* :long]
                          (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                            (lib/aggregate $q (lib/sum (->> $q
                                                            lib/available-aggregation-operators
                                                            (m/find-first (comp #{:sum} :short))
                                                            :columns
                                                            (m/find-first (comp #{"Price"} :display-name)))))
                            (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                               (lib/breakoutable-columns $q))
                                                 (lib/with-temporal-bucket :month)))
                            (lib.convert/->legacy-MBQL $q)))
                        :database-id (meta/id)
                        :name "Products+Reviews Summary"
                        :type :model}]})
          question (binding [lib.metadata.calculation/*display-name-style* :long]
                     (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                       (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                          (lib/breakoutable-columns $q))
                                            (lib/with-temporal-bucket :month)))
                       (lib/aggregate $q (lib/avg (->> $q
                                                       lib/available-aggregation-operators
                                                       (m/find-first (comp #{:avg} :short))
                                                       :columns
                                                       (m/find-first (comp #{"Rating"} :display-name)))))
                       (lib/append-stage $q)
                       (letfn [(find-col [query display-name]
                                 (or (m/find-first #(= (:display-name %) display-name)
                                                   (lib/breakoutable-columns query))
                                     (throw (ex-info "Failed to find column with display name"
                                                     {:display-name display-name
                                                      :found       (map :display-name (lib/breakoutable-columns query))}))))]
                         (lib/join $q (-> (lib/join-clause (lib.metadata/card mp 2)
                                                           [(lib/=
                                                             (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                               :month)
                                                             (lib/with-temporal-bucket (find-col
                                                                                        (lib/query mp (lib.metadata/card mp 2))
                                                                                        "Reviews → Created At: Month")
                                                               :month))])
                                          (lib/with-join-fields :all))))))
          preprocessed (-> question qp.preprocess/preprocess)]
      (testing ":query -> :source-query -> :source-query -> :joins"
        (is (=? [{:alias "Reviews"
                  :fields [[:field (meta/id :reviews :id) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :product-id) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :reviewer) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :rating) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :body) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :created-at) {:join-alias "Reviews"}]]
                  :condition [:=
                              [:field (meta/id :products :id) {}]
                              [:field (meta/id :reviews :product-id) {:join-alias "Reviews"}]]}]
                (-> preprocessed :query :source-query :source-query :joins))))
      (testing ":query -> :source-query -> :source-query"
        (is (=? {:fields [[:field (meta/id :products :id) nil]
                          [:field (meta/id :products :ean) nil]
                          [:field (meta/id :products :title) nil]
                          [:field (meta/id :products :category) nil]
                          [:field (meta/id :products :vendor) nil]
                          [:field (meta/id :products :price) nil]
                          [:field (meta/id :products :rating) nil]
                          [:field (meta/id :products :created-at) nil]
                          [:field (meta/id :reviews :id) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :product-id) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :reviewer) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :rating) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :body) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :created-at) {:join-alias "Reviews"}]]}
                (-> preprocessed :query :source-query :source-query (assoc :joins '<joins>)))))
      (testing ":query -> :source-query"
        ;; source query of this source query uses `Reviews`, so we should be using it here as well.
        (is (=? {:source-query/model? true
                 :breakout            [[:field "Reviews__CREATED_AT" {}]]
                 :order-by            [[:asc [:field "Reviews__CREATED_AT" {}]]]
                 :aggregation         [[:aggregation-options [:avg [:field "RATING" {}]] {:name "avg"}]]}
                (-> preprocessed :query :source-query (assoc :source-query '<source-query>)))))
      (testing ":query -> :joins -> first -> :source-query -> :source-query -> :joins"
        (is (=? [{:alias "Reviews"
                  :fields [[:field (meta/id :reviews :id) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :product-id) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :reviewer) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :rating) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :body) {:join-alias "Reviews"}]
                           [:field (meta/id :reviews :created-at) {:join-alias "Reviews"}]]
                  :condition [:=
                              [:field (meta/id :products :id) {}]
                              [:field (meta/id :reviews :product-id) {:join-alias "Reviews"}]]}]
                (-> preprocessed :query :joins first :source-query :source-query :joins))))
      (testing ":query -> :joins -> first -> :source-query -> :source-query"
        (is (=? {:fields [[:field (meta/id :products :id) nil]
                          [:field (meta/id :products :ean) nil]
                          [:field (meta/id :products :title) nil]
                          [:field (meta/id :products :category) nil]
                          [:field (meta/id :products :vendor) nil]
                          [:field (meta/id :products :price) nil]
                          [:field (meta/id :products :rating) nil]
                          [:field (meta/id :products :created-at) nil]
                          [:field (meta/id :reviews :id) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :product-id) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :reviewer) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :rating) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :body) {:join-alias "Reviews"}]
                          [:field (meta/id :reviews :created-at) {:join-alias "Reviews"}]]}
                (-> preprocessed :query :joins first :source-query :source-query (assoc :joins '<joins>)))))
      (testing ":query -> :joins -> first -> :source-query"
        (is (=? {:source-query/model? true
                 :breakout            [[:field "Reviews__CREATED_AT" {}]]
                 :order-by            [[:asc [:field "Reviews__CREATED_AT" {}]]]
                 :aggregation         [[:aggregation-options [:sum [:field "PRICE" {}]] {:name "sum"}]]}
                (-> preprocessed :query :joins first :source-query (assoc :source-query '<source-query>)))))
      (testing ":query -> :joins"
        (is (=? [{:fields [[:field "CREATED_AT" {:join-alias "Products+Reviews Summary - Reviews → Created At: Month"}]
                           [:field "sum" {:join-alias "Products+Reviews Summary - Reviews → Created At: Month"}]]
                  :alias "Products+Reviews Summary - Reviews → Created At: Month"
                  :condition [:=
                              [:field "CREATED_AT" {}]
                              [:field "CREATED_AT" {:join-alias "Products+Reviews Summary - Reviews → Created At: Month"}]]
                  :source-query/model? true}]
                (-> preprocessed :query :joins))))
      (testing ":query"
        (is (=? {:fields [[:field "Reviews__CREATED_AT" {}]
                          [:field "avg" {}]
                          [:field "CREATED_AT" {:join-alias "Products+Reviews Summary - Reviews → Created At: Month"}]
                          [:field "sum" {:join-alias "Products+Reviews Summary - Reviews → Created At: Month"}]]}
                (-> preprocessed :query (assoc :source-query '<source-query> :joins '<joins>)))))
      (testing "outer query"
        (is (=? {:info {:card-id 1}}
                (assoc preprocessed :query '<query>)))))))
