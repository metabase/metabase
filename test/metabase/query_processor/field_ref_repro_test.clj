(ns metabase.query-processor.field-ref-repro-test
  "Reproduction tests for field ref(erence) issues. These are negative tests, if some fail,
  we might have actually fixed a bug."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(deftest ^:parallel native-query-model-remapped-column-join-test
  (testing "Should be able to join on remapped model column (#58314)"
    (let [mp (qp.test-util/metadata-provider-with-cards-with-transformed-metadata-for-queries
              [{:native   {:query "SELECT 1 AS _ID"}
                :database (mt/id)
                :type     :native}]
              {1 (fn [mp result-metadata]
                   (update result-metadata 0 merge (-> (lib.metadata/field mp (mt/id :orders :id))
                                                       (select-keys [:description :display-name
                                                                     :id :semantic-type])
                                                       (set/rename-keys {:display-name :display_name
                                                                         :semantic-type :semantic_type}))))})

          card-meta (lib.metadata/card mp 1)
          base (lib/query mp card-meta)
          lhs (first (lib/join-condition-lhs-columns base card-meta nil nil))
          rhs (first (lib/join-condition-rhs-columns base card-meta nil nil))
          query (lib/join base (-> (lib/join-clause card-meta [(lib/= lhs (lib/with-join-alias rhs "j"))])
                                   (lib/with-join-fields :all)
                                   (lib/with-join-alias "j")))]
      (mt/with-native-query-testing-context query
        (testing "should return a single row with two columns"
          (is (= {:rows [[1 1]], :columns ["_ID" "_ID_2"]}
                 (mt/rows+column-names
                  (qp/process-query query)))))))))

(deftest ^:parallel long-column-name-in-card-test
  (testing "Should be able to handle long column names in saved questions (#35252)"
    (let [mp            (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                         [{:native   {:query "SELECT ID AS \"ID\", CATEGORY as \"This is a very very long column title that makes my saved question break when I want to use it elsewhere\" FROM PRODUCTS ORDER BY ID ASC"}
                           :database (mt/id)
                           :type     :native}])
          card-meta     (lib.metadata/card mp 1)
          base          (lib/query mp card-meta)
          long-name-col (second (lib/filterable-columns base))
          query         (-> base
                            (lib/filter (lib/contains long-name-col "a"))
                            (lib/limit 3))]
      (mt/with-native-query-testing-context query
        ;; should return 53 rows with two columns
        (is (= {:rows    [[5 "Gadget"]
                          [11 "Gadget"]
                          [16 "Gadget"]]
                :columns ["ID"
                          "This is a very very long column title that makes my saved question break when I want to use it elsewhere"]}
               (mt/rows+column-names
                (qp/process-query query))))))))

(deftest ^:parallel breakout-on-nested-join-test
  (testing "Should handle breakout on nested join column (#59918)"
    (let [mp        (lib.tu/mock-metadata-provider
                     (mt/metadata-provider)
                     {:cards [{:id            1
                               :dataset-query (mt/mbql-query orders
                                                {:joins [{:source-table $$products
                                                          :alias        "p"
                                                          :condition    [:= $product_id &p.products.id]
                                                          :fields       :all}]})}
                              {:id            2
                               :dataset-query (mt/mbql-query people
                                                {:joins [{:source-table "card__1"
                                                          :alias        "j"
                                                          :condition
                                                          [:= $id [:field "USER_ID" {:base-type  :type/Integer
                                                                                     :join-alias "j"}]]
                                                          :fields       :all}]})}]})
          card-meta (lib.metadata/card mp 2)
          cat-col   (m/find-first (comp #{"CATEGORY"} :name)
                                  (lib/returned-columns (lib/query mp card-meta)))
          query     (-> (lib/query mp card-meta)
                        (lib/aggregate (lib/count))
                        (lib/breakout cat-col))
          results   (qp/process-query query)]
      (testing "should return row(s) with category and count"
        (is (= ["j__p__CATEGORY"
                "count"]
               (map :lib/desired-column-alias (mt/cols results))))
        (is (= [[nil         754]
                ["Doohickey" 3976]
                ["Gadget"    4939]
                ["Gizmo"     4784]
                ["Widget"    5061]]
               (mt/rows results)))))))

(deftest ^:parallel stale-unsed-field-referenced-test
  (testing "Should handle missing unused field (#60498)"
    (let [mp        (as-> (mt/metadata-provider) $mp
                      (lib.tu/mock-metadata-provider
                       $mp
                       {:cards [(let [query (mt/mbql-query orders)]
                                  {:id              1
                                   :dataset-query   query
                                   :name            "M1"
                                   :type            :model
                                   :result-metadata (qp.preprocess/query->expected-cols (lib/query $mp query))})]})
                      (lib.tu/mock-metadata-provider
                       $mp
                       {:cards [(let [query (mt/mbql-query nil {:source-table "card__1"})]
                                  {:id              2
                                   :dataset-query   query
                                   :name            "M2"
                                   :type            :model
                                   :result-metadata (qp.preprocess/query->expected-cols (lib/query $mp query))})]})
                      (lib.tu/mock-metadata-provider
                       $mp
                       {:cards [(let [query (mt/mbql-query nil {:source-table "card__2"})]
                                  {:id              3
                                   :dataset-query   query
                                   :name            "M3"
                                   :type            :model
                                   :result-metadata (qp.preprocess/query->expected-cols (lib/query $mp query))})]})
                      (lib.tu/mock-metadata-provider
                       $mp
                       {:cards [(let [query (mt/mbql-query nil
                                              {:source-table "card__3"
                                               :aggregation  [[:count]]
                                               :breakout     [*QUANTITY/Integer]})]
                                  {:id              4
                                   :dataset-query   query
                                   :name            "M4"
                                   :type            :model
                                   :result-metadata (remove
                                                     #(= (:name %) "TAX")
                                                     (qp.preprocess/query->expected-cols (lib/query $mp query)))})]}))
          card-meta (lib.metadata/card mp 4)
          query     (lib/query mp card-meta)]
      (mt/with-native-query-testing-context query
        (testing "should get columns QUANTITY and count and 77 rows"
          (let [results (qp/process-query query)]
            (is (= ["QUANTITY"
                    "count"]
                   (map :lib/desired-column-alias (mt/cols results))))
            (is (= 77
                   (count (mt/rows results))))))))))

(deftest ^:parallel self-join-with-external-remapping-test
  (testing "Should handle self joins with external remapping (#60444)"
    ;; see https://metaboat.slack.com/archives/C0645JP1W81/p1753208898063419 for further discussion
    (let [mp (lib.tu/remap-metadata-provider
              (mt/metadata-provider)
              (mt/id :orders :user_id) (mt/id :people :email))]
      (doseq [join-base [{:source-table (mt/id :orders)}
                         {:source-query {:source-table (mt/id :orders)
                                         :filter       [:!= [:field (mt/id :orders :id) nil] -1]}}]]
        (testing (format "join base = %s" (pr-str join-base))
          (let [query   (lib/query
                         mp
                         (mt/mbql-query orders
                           {:joins    [(merge
                                        join-base
                                        {:alias     "j"
                                         :condition [:= $id &j.orders.product_id]
                                         :fields    :all})]
                            :order-by [[:asc $id]
                                       ;; should actually end up sorting by people.email
                                       ;; instead, [[metabase.query-processor.middleware.add-remaps]] should replace this
                                       ;; clause.
                                       [:asc $user_id]
                                       [:asc $product_id]
                                       [:asc [:field %id {:join-alias "j"}]]
                                       [:asc [:field %user_id {:join-alias "j"}]]]
                            :limit    2}))
                results (qp/process-query query)]
            ;; should return 20 columns and 37320 rows
            (mt/with-native-query-testing-context query
              (is (= ["ID"
                      "USER_ID"
                      "PRODUCT_ID"
                      "SUBTOTAL"
                      "TAX"
                      "TOTAL"
                      "DISCOUNT"
                      "CREATED_AT"
                      "QUANTITY"
                      "j__ID"
                      "j__USER_ID"
                      "j__PRODUCT_ID"
                      "j__SUBTOTAL"
                      "j__TAX"
                      "j__TOTAL"
                      "j__DISCOUNT"
                      "j__CREATED_AT"
                      "j__QUANTITY"
                      ;; The order of these columns seems to be 'flexible' (I would consider either to be correct), and
                      ;; I've seen both in two different branches of mine attempting to fix this bug. The order doesn't
                      ;; matter at all to the FE, so if this changes in the future it's ok. -- Cam
                      "PEOPLE__via__USER_ID__EMAIL"
                      "j__PEOPLE__via__USER_ID__EMAIL"]
                     (map :lib/desired-column-alias (mt/cols results))))
              (is (= [[1                ; <= orders.id
                       1                ; <= orders.user-id
                       14               ; <= orders.product-id
                       37.65
                       2.07
                       39.72
                       nil
                       "2019-02-11T21:40:27.892Z"
                       2
                       448              ; <= (joined) orders.id
                       61               ; <= (joined) orders.user-id
                       1                ; <= (joined) orders.product-id == orders.id
                       29.46
                       1.4
                       30.86
                       nil
                       "2016-12-25T22:19:38.656Z"
                       2
                       "borer-hudson@yahoo.com"  ; orders.user-id --[remap]--> people.email (email of People row with ID = 1)
                       "labadie.lina@gmail.com"] ; (joined) orders.user-id --[remap]--> people.email (email of People row with ID = 1902)
                      [1
                       1
                       14
                       37.65
                       2.07
                       39.72
                       nil
                       "2019-02-11T21:40:27.892Z"
                       2
                       493
                       65
                       1
                       29.46
                       1.18
                       30.64
                       nil
                       "2017-02-04T10:16:00.936Z"
                       1
                       "borer-hudson@yahoo.com"
                       "arne-o-hara@gmail.com"]]
                     (mt/rows results))))))))))

(deftest ^:parallel multi-stage-with-external-remapping-test
  (testing "Should handle multiple stages with external remapping (#60587)"
    (let [mp    (lib.tu/remap-metadata-provider (mt/metadata-provider)
                                                (mt/id :orders :user_id)
                                                (mt/id :people :email))
          query (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
                  (lib/breakout $ (lib.metadata/field mp (mt/id :orders :user_id)))
                  (lib/append-stage $)
                  (lib/expression $ "user" (first (lib/returned-columns $)))
                  (lib/aggregate $ (lib/distinct (m/find-first (comp #{"user"} :name)
                                                               (lib/visible-columns $)))))]
      (mt/with-native-query-testing-context query
        (let [results (qp/process-query query)]
          (is (=? [{:lib/desired-column-alias "count"}]
                  (mt/cols results)))
          (is (= [[1746]]
                 (mt/rows results))))))))

;;; This is tricky case: the implicit join happens in stage 0 (Card 1) because of the remapped column, but the parameter
;;; asks to be applied to stage 2. Logic in `add-implicit-joins` now propagates that use of the implicitly joined column
;;; through stage 1 to stage 0, making the column available for the filter in the last stage.
;;;
;;; See also
;;; [[metabase.lib.field.resolution-test/resolve-unreturned-column-from-reified-implicit-join-in-previous-stage-test]]
;;; and [[metabase.query-processor.middleware.add-implicit-joins-test/implicit-join-from-much-earlier-stage-test]].
(deftest ^:parallel model-with-implicit-join-and-external-remapping-test
  (testing "Should handle models with implicit join on externally remapped field (#57596)"
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                       [(mt/mbql-query orders)
                                        (mt/mbql-query nil {:source-table "card__1"})])
                                      (mt/id :orders :user_id)
                                      (mt/id :people :email))
      (let [query (-> (mt/mbql-query nil
                        {:source-table "card__2"})
                      (assoc :parameters [{:value ["CA"]
                                           :type :string/=
                                           :id "72622120"
                                           :target
                                           [:dimension
                                            [:field
                                             (mt/id :people :state)
                                             {:base-type :type/Text
                                              :source-field (mt/id :orders :user_id)
                                              :source-field-name "USER_ID"}]
                                            {:stage-number -1}]}]))]
        (mt/with-native-query-testing-context query
          (is (= 613
                 (-> query qp/process-query mt/rows count))))))))
