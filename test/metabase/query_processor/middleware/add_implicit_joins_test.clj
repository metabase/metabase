(ns metabase.query-processor.middleware.add-implicit-joins-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-joins
    :as qp.add-implicit-joins]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [schema.core :as s]))

(deftest resolve-implicit-joins-test
  (mt/dataset sample-dataset
    (let [query (mt/nest-query
                 (mt/mbql-query orders
                   {:source-table $$orders
                    :fields       [$id
                                   &Products.products.title
                                   $product_id->products.title]
                    :joins        [{:fields       :all
                                    :source-table $$products
                                    :condition    [:= $product_id &Products.products.id]
                                    :alias        "Products"}]
                    :order-by     [[:asc $id]]
                    :limit        2})
                 1)]
      (is (= (:query
              (mt/mbql-query orders
                {:source-query {:source-table $$orders
                                :fields       [$id
                                               &Products.products.title
                                               [:field %products.title {:source-field %product_id, :join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                :joins        [{:fields       :all
                                                :source-table $$products
                                                :condition    [:= $product_id &Products.products.id]
                                                :alias        "Products"}
                                               {:fields       :none
                                                :source-table $$products
                                                :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]
                                                :alias        "PRODUCTS__via__PRODUCT_ID"
                                                :fk-field-id  %product_id
                                                :strategy     :left-join}]
                                :order-by     [[:asc $id]]
                                :limit        2}}))
             (mt/with-everything-store
               (#'qp.add-implicit-joins/resolve-implicit-joins (:query query))))))))

(defn- add-implicit-joins [query]
  (driver/with-driver (tx/driver)
    (qp.store/with-store
      (qp.store/fetch-and-store-database! (mt/id))
      (qp.add-implicit-joins/add-implicit-joins query))))

(deftest basic-test
  (testing "make sure `:joins` get added automatically for `:fk->` clauses"
    (is (= (mt/mbql-query venues
             {:source-table $$venues
              :fields       [$name [:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                             :source-field %category_id}]]
              :joins        [{:source-table $$categories
                              :alias        "CATEGORIES__via__CATEGORY_ID"
                              :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                              :strategy     :left-join
                              :fields       :none
                              :fk-field-id  %category_id}]})
           (add-implicit-joins
            (mt/mbql-query venues
              {:source-table $$venues
               :fields       [$name $category_id->categories.name]}))))))

(deftest nested-queries-test
  (testing "For FK clauses inside nested source queries, we should add the `:joins` info to the nested query instead of at the top level (#8972)"
    (is (= (mt/mbql-query venues
             {:source-query
              {:source-table $$venues
               :fields       [$name [:field %categories.name {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                              :source-field %category_id}]]
               :joins        [{:source-table $$categories
                               :alias        "CATEGORIES__via__CATEGORY_ID"
                               :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                               :strategy     :left-join
                               :fields       :none
                               :fk-field-id  %category_id}]}})
           (add-implicit-joins
            (mt/mbql-query venues
              {:source-query
               {:source-table $$venues
                :fields       [$name $category_id->categories.name]}}))))))

(deftest already-has-join?-test
  (is (#'qp.add-implicit-joins/already-has-join?
       {:joins [{:alias "x"}]}
       {:alias "x"}))
  (is (not (#'qp.add-implicit-joins/already-has-join?
            {:joins [{:alias "x"}]}
            {:alias "y"})))
  (is (#'qp.add-implicit-joins/already-has-join?
       {:source-query {:joins [{:alias "x"}]}}
       {:alias "x"}))
  (is (not (#'qp.add-implicit-joins/already-has-join?
            nil
            {:alias "x"})))
  (is (not (#'qp.add-implicit-joins/already-has-join?
            {:joins [{:source-query {:joins [{:alias "x"}]}}]}
            {:alias "x"}))))

(deftest reuse-existing-joins-test
  (testing "Should reuse existing joins rather than creating new ones"
    (is (= (mt/mbql-query venues
             {:source-query
              {:source-table $$venues
               :fields       [$name [:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                              :source-field %category_id}]]
               :joins        [{:source-table $$categories
                               :alias        "CATEGORIES__via__CATEGORY_ID"
                               :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                               :strategy     :left-join
                               :fields       [[:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                                        :source-field %category_id}]]
                               :fk-field-id  %category_id}]}})
           (add-implicit-joins
            (mt/mbql-query venues
              {:source-query
               {:source-table $$venues
                :fields       [$name $category_id->categories.name]
                :joins        [{:source-table $$categories
                                :alias        "CATEGORIES__via__CATEGORY_ID"
                                :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                :strategy     :left-join
                                :fields       [[:field %categories.name {:join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                                         :source-field %category_id}]]
                                :fk-field-id  %category_id}]}}))))

    (testing "Should work at arbitrary levels of nesting"
      (mt/dataset sample-dataset
        (doseq [level (range 4)]
          (testing (format "(%d levels of nesting)" level)
            (let [query (-> (mt/mbql-query orders
                              {:source-table $$orders
                               :fields       [$id
                                              &Products.products.title
                                              $product_id->products.title]
                               :joins        [{:fields       :all
                                               :source-table $$products
                                               :condition    [:= $product_id [:field %products.id {:join-alias "Products"}]]
                                               :alias        "Products"}]
                               :order-by     [[:asc $id]]
                               :limit        2})
                            (mt/nest-query level))]
              (testing (format "\nquery =\n%s" (u/pprint-to-str query))
                (testing "sanity check: we should actually be able to run this query"
                  (is (schema= {:status   (s/eq :completed)
                                s/Keyword s/Any}
                               (qp/process-query query)))
                  (when (pos? level)
                    (testing "if it has source metadata"
                      (let [query-with-metadata (assoc-in query
                                                          (concat [:query]
                                                                  (repeat (dec level) :source-query)
                                                                  [:source-metadata])
                                                          (mt/$ids orders
                                                            [{:name         "ID"
                                                              :display_name "ID"
                                                              :base_type    :type/Integer
                                                              :id           %id
                                                              :field_ref    $id}
                                                             {:name         "TITLE"
                                                              :display_name "Title"
                                                              :base_type    :type/Text
                                                              :id           %products.title
                                                              :field_ref    &Products.products.title}
                                                             {:name         "TITLE"
                                                              :display_name "Title"
                                                              :base_type    :type/Text
                                                              :id           %products.title
                                                              :field_ref    $product_id->products.title}]))]
                        (is (schema= {:status   (s/eq :completed)
                                      s/Keyword s/Any}
                                     (qp/process-query query-with-metadata)))))))
                (is (= (-> (mt/mbql-query orders
                             {:source-table $$orders
                              :fields       [$id
                                             &Products.products.title
                                             [:field %products.title {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                                      :source-field %product_id}]]
                              :joins        [{:source-table $$products
                                              :alias        "Products"
                                              :fields       :all
                                              :condition    [:= $product_id &Products.products.id]}
                                             {:source-table $$products
                                              :alias        "PRODUCTS__via__PRODUCT_ID"
                                              :strategy     :left-join
                                              :fields       :none
                                              :fk-field-id  %product_id
                                              :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}]
                              :order-by     [[:asc $id]]
                              :limit        2})
                           (mt/nest-query level))
                       (-> (add-implicit-joins query)
                           (m/dissoc-in [:query :source-metadata]))))))))))))

(deftest reuse-existing-joins-test-2
  (testing "We DEFINITELY need to reuse joins if adding them again would break the query."
    (mt/dataset sample-dataset
      (is (= (mt/mbql-query orders
               {:filter       [:> *count/Integer 5]
                :fields       [$created_at
                               [:field %products.created_at {:source-field %product_id
                                                             :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                               *count/Integer]
                :source-query {:source-table $$orders
                               :aggregation  [[:count]]
                               :breakout     [!month.created_at
                                              [:field %products.created_at {:source-field  %product_id
                                                                            :temporal-unit :month
                                                                            :join-alias    "PRODUCTS__via__PRODUCT_ID"}]]
                               :joins        [{:fields       :none
                                               :alias        "PRODUCTS__via__PRODUCT_ID"
                                               :strategy     :left-join
                                               :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]
                                               :source-table $$products
                                               :fk-field-id  %product_id}]}
                :limit        5})
             (add-implicit-joins
              (mt/mbql-query orders
                {:filter       [:> *count/Integer 5]
                 :fields       [$created_at $product_id->products.created_at *count/Integer]
                 :source-query {:source-table $$orders
                                :aggregation  [[:count]]
                                :breakout     [!month.created_at !month.product_id->products.created_at]}
                 :limit        5})))))))

(deftest add-fields-for-reused-joins-test
  (mt/dataset sample-dataset
    (testing "If we reuse a join, make sure we add Fields to `:fields` to the source query so we can reference them in the parent level"
      (is (= (mt/mbql-query orders
               {:source-query {:source-table $$orders
                               :fields       [$id
                                              $user_id
                                              $product_id
                                              $subtotal
                                              $tax
                                              $total
                                              $discount
                                              !default.created_at
                                              $quantity
                                              [:field %products.category {:source-field %product_id
                                                                          :join-alias   "PRODUCTS__via__PRODUCT_ID"}]]
                               :filter       [:and
                                              [:= $user_id 1]
                                              [:=
                                               [:field %products.category {:source-field %product_id
                                                                           :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                                               "Doohickey"]]
                               :joins        [{:source-table $$products
                                               :alias        "PRODUCTS__via__PRODUCT_ID"
                                               :fields       :none
                                               :strategy     :left-join
                                               :fk-field-id  %product_id
                                               :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}]}
                :filter       [:=
                               [:field %products.category {:source-field %product_id
                                                           :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                               "Doohickey"]
                :order-by     [[:asc [:field %products.category {:source-field %product_id
                                                                 :join-alias   "PRODUCTS__via__PRODUCT_ID"}]]]
                :limit        5})
             (add-implicit-joins
              (mt/mbql-query orders
                {:source-query {:source-table $$orders
                                :filter       [:and
                                               [:= $user_id 1]
                                               [:= $product_id->products.category "Doohickey"]]}
                 :filter       [:= $product_id->products.category "Doohickey"]
                 :order-by     [[:asc $product_id->products.category]]
                 :limit        5})))))

    (testing "don't add fields for a native source query."
      (is (= (mt/mbql-query orders
               {:source-query {:native "SELECT * FROM my_table"}
                :filter       [:= [:field %products.category {:source-field %product_id
                                                              :join-alias   "PRODUCTS__via__PRODUCT_ID"}]
                               "Doohickey"]
                :order-by     [[:asc [:field %products.category {:source-field %product_id
                                                                 :join-alias   "PRODUCTS__via__PRODUCT_ID"}]]]
                :joins        [{:source-table $$products
                                :alias        "PRODUCTS__via__PRODUCT_ID"
                                :fields       :none
                                :strategy     :left-join
                                :fk-field-id  %product_id
                                :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}]
                :limit        5})
             (add-implicit-joins
              (mt/mbql-query orders
                {:source-query {:native "SELECT * FROM my_table"}
                 :filter       [:= $product_id->products.category "Doohickey"]
                 :order-by     [[:asc $product_id->products.category]]
                 :limit        5})))))))

(deftest reuse-joins-sanity-check-test
  (mt/dataset sample-dataset
    (testing "Reusing existing joins shouldn't break access to columns we're referencing at the top level"
      (let [query (mt/mbql-query orders
                    {:source-query {:source-table $$orders
                                    :filter       [:and
                                                   [:= $user_id 1]
                                                   [:= $product_id->products.category "Doohickey"]]}
                     :filter       [:= $product_id->products.category "Doohickey"]
                     :order-by     [[:asc $product_id->products.category]]
                     :limit        5})]
        (testing "Sanity check: should be able to run the query"
          (is (schema= {:status (s/eq :completed), s/Keyword s/Any}
                       (qp/process-query query))))))))

(deftest nested-nested-queries-test
  (testing "we should handle nested-nested queries correctly as well"
    (is (= (mt/mbql-query venues
             {:source-query
              {:source-query
               {:source-table $$venues
                :fields       [$name [:field %categories.name {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                               :source-field %category_id}]]
                :joins        [{:source-table $$categories
                                :alias        "CATEGORIES__via__CATEGORY_ID"
                                :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                :strategy     :left-join
                                :fields       :none
                                :fk-field-id  %category_id}]}}})
           (add-implicit-joins
            (mt/mbql-query venues
              {:source-query
               {:source-query
                {:source-table $$venues
                 :fields       [$name $category_id->categories.name]}}}))))))

(deftest wtf-test
  (testing (str "ok, so apparently if you specify a source table at a deeper level of nesting we should still "
                "add JOINs as appropriate for that Table if you specify an `fk->` clause in an a higher level. "
                "Does this make any sense at all?")
    ;; TODO - I'm not sure I understand why we add the JOIN to the outer level in this case. Does it make sense?
    (is (= (mt/mbql-query checkins
             {:source-query {:source-table $$checkins
                             :fields       [$id
                                            !default.date
                                            $user_id
                                            $venue_id]
                             :filter       [:> $date "2014-01-01"]}
              :aggregation  [[:count]]
              :breakout     [[:field %venues.price {:source-field %venue_id, :join-alias "VENUES__via__VENUE_ID"}]]
              :order-by     [[:asc [:field %venues.price {:source-field %venue_id, :join-alias "VENUES__via__VENUE_ID"}]]]
              :joins        [{:source-table $$venues
                              :alias        "VENUES__via__VENUE_ID"
                              :condition    [:= $venue_id &VENUES__via__VENUE_ID.venues.id]
                              :strategy     :left-join
                              :fields       :none
                              :fk-field-id  %venue_id}]})
           (add-implicit-joins
            (mt/mbql-query checkins
              {:source-query {:source-table $$checkins
                              :filter       [:> $date "2014-01-01"]}
               :aggregation  [[:count]]
               :breakout     [$venue_id->venues.price]
               :order-by     [[:asc $venue_id->venues.price]]}))))))

(deftest topologically-sort-joins-test
  (let [parent        {:alias     "Parent"
                       :condition [:=
                                   [:field 2 nil]
                                   [:field 1 {:join-alias "Parent"}]]}
        child-1       {:alias     "Child 1"
                       :condition [:=
                                   [:field 1 {:join-alias "Parent"}]
                                   [:field 1 {:join-alias "Child 1"}]]}
        child-2       {:alias     "Child 2"
                       :condition [:=
                                   [:field 1 {:join-alias "Parent"}]
                                   [:field 1 {:join-alias "Child 2"}]]}
        child-1-child {:alias     "Child 1 Child"
                       :condition [:=
                                   [:field 1 {:join-alias "Child 1"}]
                                   [:field 1 {:join-alias "Child 1 Child"}]]}]
    (testing "Join dependencies"
      (is (= #{}
             (#'qp.add-implicit-joins/join-dependencies parent)))
      (is (= #{"Parent"}
             (#'qp.add-implicit-joins/join-dependencies child-1)
             (#'qp.add-implicit-joins/join-dependencies child-2)))
      (is (= #{"Child 1"}
             (#'qp.add-implicit-joins/join-dependencies child-1-child))))
    (testing "Sort by dependency order"
      (let [alias->join (m/index-by :alias [parent child-1 child-2 child-1-child])]
        (doseq [[original expected] {["Parent" "Child 1" "Child 2"]                 ["Parent" "Child 1" "Child 2"]
                                     ["Child 1" "Parent" "Child 2"]                 ["Parent" "Child 1" "Child 2"]
                                     ["Child 1" "Child 2" "Parent"]                 ["Parent" "Child 1" "Child 2"]
                                     ;; should preserve order if there are no dependencies.
                                     ["Child 1" "Child 2"]                          ["Child 1" "Child 2"]
                                     ["Child 2" "Child 1"]                          ["Child 2" "Child 1"]
                                     ["Parent" "Child 2" "Child 1"]                 ["Parent" "Child 2" "Child 1"]
                                     ["Child 2" "Parent" "Child 1"]                 ["Parent" "Child 2" "Child 1"]
                                     ["Child 2" "Child 1" "Parent"]                 ["Parent" "Child 2" "Child 1"]
                                     ;; should handle dependencies of dependencies
                                     ["Parent" "Child 1" "Child 2" "Child 1 Child"] ["Parent" "Child 1" "Child 2" "Child 1 Child"]
                                     ["Parent" "Child 1" "Child 1 Child" "Child 2"] ["Parent" "Child 1" "Child 1 Child" "Child 2"]
                                     ["Parent" "Child 1 Child" "Child 1" "Child 2"] ["Parent" "Child 1" "Child 1 Child" "Child 2"]
                                     ["Child 1 Child" "Parent" "Child 1" "Child 2"] ["Parent" "Child 1" "Child 1 Child" "Child 2"]}]
          (testing (format "Sort %s" original)
            (is (= expected
                   (mapv :alias (#'qp.add-implicit-joins/topologically-sort-joins (mapv alias->join original)))))))))))

(deftest mix-implicit-and-explicit-joins-test
  (testing "Test that adding implicit joins still works correctly if the query also contains explicit joins"
    (is (= (mt/mbql-query checkins
             {:source-table $$checkins
              :aggregation  [[:sum [:field %users.id {:join-alias   "USERS__via__USER_ID"
                                                      :source-field %user_id}]]]
              :breakout     [$id]
              :joins        [{:alias        "u"
                              :source-table $$users
                              :condition    [:= *user_id &u.users.id]}
                             {:source-table $$users
                              :alias        "USERS__via__USER_ID"
                              :strategy     :left-join
                              :condition    [:= $user_id &USERS__via__USER_ID.users.id]
                              :fk-field-id  %checkins.user_id
                              :fields       :none}]
              :limit        10})
           (add-implicit-joins
            (mt/mbql-query checkins
              {:source-table $$checkins
               :aggregation  [[:sum $user_id->users.id]]
               :breakout     [$id]
               :joins        [{:alias        "u"
                               :source-table $$users
                               :condition    [:= *user_id &u.users.id]}]
               :limit        10}))))

    (testing "in nested source queries"
      (is (= (mt/mbql-query checkins
               {:source-query {:source-table $$checkins
                               :aggregation  [[:sum [:field %users.id {:join-alias   "USERS__via__USER_ID"
                                                                       :source-field %user_id}]]]
                               :breakout     [$id]
                               :joins        [{:source-table $$users
                                               :alias        "USERS__via__USER_ID"
                                               :strategy     :left-join
                                               :condition    [:= $user_id &USERS__via__USER_ID.users.id]
                                               :fk-field-id  %checkins.user_id
                                               :fields       :none}]}
                :joins        [{:alias        "u"
                                :source-table $$users
                                :condition    [:= *user_id &u.users.id]}]
                :limit        10})
             (add-implicit-joins
              (mt/mbql-query checkins
                {:source-query {:source-table $$checkins
                                :aggregation  [[:sum $user_id->users.id]]
                                :breakout     [$id]}
                 :joins        [{:alias        "u"
                                 :source-table $$users
                                 :condition    [:= *user_id &u.users.id]}]
                 :limit        10})))))))

(deftest dont-add-duplicate-fields-test
  (testing "Don't add duplicate `:fields` to parent query if they are only different because of namespaced options"
    (mt/dataset sample-dataset
      (is (query= (mt/mbql-query orders
                    {:source-query {:source-table $$orders
                                    :joins        [{:source-table $$products
                                                    :alias        "PRODUCTS__via__PRODUCT_ID"
                                                    :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]
                                                    :fields       :none
                                                    :strategy     :left-join
                                                    :fk-field-id  %product_id}]
                                    :fields       [[:field
                                                    %product_id
                                                    {::namespaced true}]
                                                   [:field
                                                    %products.title
                                                    {:source-field %product_id
                                                     :join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                     ::namespaced  true}]]}
                     :fields       [[:field %product_id {::namespaced true}]
                                    [:field
                                     %products.title
                                     {:source-field %product_id
                                      :join-alias   "PRODUCTS__via__PRODUCT_ID"
                                      ::namespaced  true}]]})
                  (-> (mt/mbql-query orders
                        {:source-query    {:source-table $$orders
                                           :fields       [[:field
                                                           %product_id
                                                           {::namespaced true}]
                                                          [:field
                                                           %products.title
                                                           {:source-field %product_id, ::namespaced true}]]}
                         :source-metadata [{:base_type         :type/Text
                                            :coercion_strategy nil
                                            :display_name      "Product → Title"
                                            :effective_type    :type/Text
                                            :field_ref         $product_id->products.title
                                            :fingerprint       nil
                                            :id                93899
                                            :name              "TITLE"
                                            :parent_id         nil
                                            :semantic_type     nil
                                            :settings          nil
                                            :source_alias      "PRODUCTS__via__PRODUCT_ID"
                                            :table_id          $$products}]
                         :fields          [[:field %product_id {::namespaced true}]
                                           [:field
                                            %products.title
                                            {:source-field %product_id, ::namespaced true}]]})
                      add-implicit-joins
                      (m/dissoc-in [:query :source-metadata])))))))

(deftest resolve-implicit-joins-in-join-conditions-test
  (testing "Should be able to resolve implicit joins inside a join `:condition`"
    (mt/dataset sample-dataset
      (is (query= (mt/mbql-query orders
                    {:source-query {:source-table $$orders
                                    :fields       [$product_id]}
                     :joins        [{:source-table $$products
                                     :alias        "PRODUCTS__via__PRODUCT_ID"
                                     :condition    [:=
                                                    $product_id
                                                    [:field
                                                     %products.id
                                                     {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                     :fields       :none
                                     :strategy     :left-join
                                     :fk-field-id  %product_id}
                                    {:source-table $$products
                                     :alias        "Products"
                                     :condition    [:=
                                                    [:field
                                                     %products.category
                                                     {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                      :source-field %product_id}]
                                                    &Products.products.category]
                                     :fields       :none}]})
                  (add-implicit-joins
                   (mt/mbql-query orders
                     {:source-query {:source-table $$orders
                                     :fields       [$product_id]}
                      :joins        [{:source-table $$products
                                      :alias        "Products"
                                      :condition    [:=
                                                     $product_id->products.category
                                                     &Products.products.category]
                                      :fields       :none}]})))))))

(deftest use-source-query-implicit-joins-for-join-conditions-test
  (testing "Implicit join inside a join `:condition` should use implicit join from source query if available (#20519)"
    (mt/dataset sample-dataset
      (is (query= (mt/mbql-query orders
                    {:source-query {:source-table $$orders
                                    :joins        [{:source-table $$products
                                                    :alias        "PRODUCTS__via__PRODUCT_ID"
                                                    :condition    [:=
                                                                   $product_id
                                                                   [:field
                                                                    %products.id
                                                                    {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                    :fields       :none
                                                    :strategy     :left-join
                                                    :fk-field-id  %product_id}]
                                    :breakout     [[:field
                                                    %products.category
                                                    {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                     :source-field %product_id}]]
                                    :aggregation  [[:count]]}
                     :joins        [{:source-table $$products
                                     :alias        "Products"
                                     :condition    [:=
                                                    [:field
                                                     %products.category
                                                     {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                                      :source-field %product_id}]
                                                    &Products.products.category]
                                     :fields       :none}]
                     :fields       [[:field
                                     %products.category
                                     {:join-alias   "PRODUCTS__via__PRODUCT_ID"
                                      :source-field %product_id}]]})
                  (add-implicit-joins
                   (mt/mbql-query orders
                     {:source-query {:source-table $$orders
                                     :breakout     [$product_id->products.category]
                                     :aggregation  [[:count]]}
                      :joins        [{:source-table $$products
                                      :alias        "Products"
                                      :condition    [:=
                                                     $product_id->products.category
                                                     &Products.products.category]
                                      :fields       :none}]
                      :fields       [$product_id->products.category]})))))))

(deftest metadata-join-alias-test
  (mt/dataset sample-dataset
    ;; With remapping, metadata may contain field with `:source-field` which is not used in corresponding query.
    ;;   See [[metabase.models.params.custom-values-test/with-mbql-card-test]].
    (testing "`:join-alias` is correctly updated in metadata fields containing `:source-field`"
      ;; Used metadata are simplified (invalid) for testing purposes. To the best of my knowledge only `:field_ref`
      ;;   could contain field with `:source-field` option that should be updated.
      (testing "With `:source-field` field in the `:source-metadata` and not in the`:source-query`, query should be left intact"
        (let [query (mt/mbql-query products
                      {:source-query {:source-table $$orders
                                      :fields [$id]}
                       :source-metadata [{:field_ref $orders.product_id->category}]})]
          (is (query= query (add-implicit-joins query)))))
      (testing "#26631 Case 1: Join query with implicit join into query with nested query with implicit join as source"
        (is (= (mt/mbql-query products
                 {:source-query {:source-table $$orders
                                 :aggregation [[:count]]
                                 :breakout [&PRODUCTS__via__PRODUCT_ID.$orders.product_id->category]
                                 :joins [{:alias "PRODUCTS__via__PRODUCT_ID"
                                          :fields :none
                                          :condition [:= $orders.product_id &PRODUCTS__via__PRODUCT_ID.$id]
                                          :strategy :left-join
                                          :source-table $$products
                                          :fk-field-id %orders.product_id}]}
                  :source-metadata [{:field_ref &PRODUCTS__via__PRODUCT_ID.$orders.product_id->category}]
                  :joins [{:alias "Q2"
                           :condition [:=
                                       &PRODUCTS__via__PRODUCT_ID.$orders.product_id->category
                                       &Q2.$reviews.product_id->category]
                           :strategy :left-join
                           :source-query {:source-table $$reviews
                                          :aggregation [[:count]]
                                          :breakout [&PRODUCTS__via__PRODUCT_ID.$reviews.product_id->category]
                                          :joins [{:alias "PRODUCTS__via__PRODUCT_ID"
                                                   :fields :none
                                                   :condition [:= $reviews.product_id &PRODUCTS__via__PRODUCT_ID.$id]
                                                   :strategy :left-join
                                                   :source-table $$products
                                                   :fk-field-id %reviews.product_id}]}
                           :source-metadata [{:field_ref &PRODUCTS__via__PRODUCT_ID.$reviews.product_id->category}]}]})
               (add-implicit-joins
                (mt/mbql-query products
                  {:source-query {:source-table $$orders
                                  :aggregation [[:count]]
                                  :breakout [$orders.product_id->category]}
                   :source-metadata [{:field_ref $orders.product_id->category}]
                   :joins [{:alias "Q2"
                            :condition [:= $orders.product_id->category &Q2.$reviews.product_id->category]
                            :strategy :left-join
                            :source-query {:source-table $$reviews
                                           :aggregation [[:count]]
                                           :breakout [$reviews.product_id->category]}
                            :source-metadata [{:field_ref $reviews.product_id->category}]}]})))))
      (testing "#26631 Case 3: Join query with implicit join into a query with a table as source"
        (is (query= (mt/mbql-query products
                      {:source-table $$products
                       :joins [{:join-alias "Q2"
                                :fields :all
                                :condition [:= $category &Q2.$orders.product_id->category]
                                :strategy :left-join
                                :source-query {:source-table $$orders
                                               :aggregation [[:count]]
                                               :breakout [&PRODUCTS__via__PRODUCT_ID.$orders.product_id->category]
                                               :joins [{:alias "PRODUCTS__via__PRODUCT_ID"
                                                        :fields :none
                                                        :strategy :left-join
                                                        :condition [:= $orders.product_id &PRODUCTS__via__PRODUCT_ID.$id]
                                                        :source-table $$products
                                                        :fk-field-id %orders.product_id}]}
                                :source-metadata [{:field_ref &PRODUCTS__via__PRODUCT_ID.$orders.product_id->category}]}]})
                    (add-implicit-joins
                     (mt/mbql-query products
                       {:source-table $$products
                        :joins [{:join-alias "Q2"
                                 :fields :all
                                 :condition [:= $category &Q2.$orders.product_id->category]
                                 :strategy :left-join
                                 :source-query {:source-table $$orders
                                                :aggregation [[:count]]
                                                :breakout [$orders.product_id->category]}
                                 :source-metadata [{:field_ref $orders.product_id->category}]}]}))))))))
