(ns metabase.query-processor.middleware.resolve-joins-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
   [metabase.query-processor.preprocess :as qp.preprocess]))

(defn- resolve-joins
  ([query]
   (resolve-joins meta/metadata-provider query))

  ([mp query]
   (if (:lib/type query)
     (resolve-joins/resolve-joins query)
     (-> (lib/query mp query)
         resolve-joins/resolve-joins
         lib/->legacy-MBQL))))

(deftest ^:parallel joins->fields-test
  (is (=? [[:field {:join-alias "B", :qp/ignore-coercion true} 1]
           [:field {:join-alias "B", :qp/ignore-coercion true} 2]
           [:field {:join-alias "C", :qp/ignore-coercion true} 3]
           [:field {:join-alias "C", :qp/ignore-coercion true} 4]]
          (#'resolve-joins/joins->fields [{:alias  "A"
                                           :fields :all}
                                          {:alias  "B"
                                           :fields [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :join-alias "B"} 1]
                                                    ;; missing join alias
                                                    [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 2]]}
                                          {:alias  "C"
                                           :fields [[:field {:lib/uuid "00000000-0000-0000-0000-000000000002", :join-alias "C"} 3]
                                                    ;; wrong join alias
                                                    [:field {:lib/uuid "00000000-0000-0000-0000-000000000003", :join-alias "X"} 4]]}]))))

(deftest ^:parallel no-op-test
  (testing "Does the middleware function if the query has no joins?"
    (is (= (lib.tu.macros/mbql-query venues)
           (resolve-joins
            (lib.tu.macros/mbql-query venues))))))

(deftest ^:parallel fields-none-test
  (testing "Can we resolve some joins w/ fields = none?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:joins
               [{:source-table $$categories
                 :alias        "c"
                 :strategy     :left-join
                 :condition    [:= $category-id &c.categories.id]}]})
            (resolve-joins
             (lib.tu.macros/mbql-query venues
               {:joins [{:source-table $$categories
                         :alias        "c"
                         :condition    [:= $category-id &c.categories.id]
                         :fields       :none}]}))))))

(deftest ^:parallel fields-all-test
  (testing "Can we resolve some joins w/ fields = all ???"
    (is (=? (lib.tu.macros/mbql-query venues
              {:joins
               [{:source-table $$categories
                 :alias        "c"
                 :strategy     :left-join
                 :condition    [:= $category-id &c.categories.id]
                 :fields       [&c.categories.id
                                &c.categories.name]}]
               :fields [$venues.id
                        $venues.name
                        [:field %categories.id {:join-alias         "c"
                                                :qp/ignore-coercion true}]
                        [:field %categories.name {:join-alias         "c"
                                                  :qp/ignore-coercion true}]]})
            (resolve-joins
             (lib.tu.macros/mbql-query venues
               {:fields [$venues.id $venues.name]
                :joins  [{:source-table $$categories
                          :alias        "c"
                          :condition    [:= $category-id &c.categories.id]
                          :fields       :all}]}))))))

(deftest ^:parallel fields-sequence-test
  (testing "can we resolve joins w/ fields = <sequence>"
    (is (= (lib.tu.macros/mbql-query venues
             {:joins
              [{:source-table $$categories
                :alias        "c"
                :strategy     :left-join
                :condition    [:= $category-id &c.categories.id]
                :fields       [&c.categories.name]}]
              :fields [$venues.id
                       $venues.name
                       [:field %categories.name {:join-alias         "c"
                                                 :qp/ignore-coercion true}]]})
           (resolve-joins
            (lib.tu.macros/mbql-query venues
              {:fields [$venues.id $venues.name]
               :joins  [{:source-table $$categories
                         :alias        "c"
                         :condition    [:= $category-id &c.categories.id]
                         :fields       [&c.categories.name]}]}))))))

(deftest ^:parallel join-table-without-alias-test
  (testing "Does joining a table an explicit alias add a default alias?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:joins        [{:source-table $$categories
                               :alias        "__join"
                               :strategy     :left-join
                               :condition    [:= $category-id 1]}
                              {:source-table $$categories
                               :alias        "__join_2"
                               :strategy     :left-join
                               :condition    [:= $category-id 2]}]
               :source-table (meta/id :venues)})
            (resolve-joins
             (lib.tu.macros/mbql-query venues
               {:joins [{:source-table $$categories
                         :condition    [:= $category-id 1]}
                        {:source-table $$categories
                         :condition    [:= $category-id 2]}]}))))))

(deftest ^:parallel resolve-explicit-joins-when-implicit-joins-are-present-test
  (testing "test that resolving explicit joins still works if implict joins are present"
    (is (=? (lib.tu.macros/mbql-query checkins
              {:source-table $$checkins
               :aggregation  [[:sum &USERS__via__USER_ID.users.id]]
               :breakout     [$id]
               :joins        [{:source-table $$users
                               :alias        "USERS__via__USER_ID"
                               :strategy     :left-join
                               :condition    [:= $user-id &USERS__via__USER_ID.users.id]
                               :fk-field-id  (meta/id :checkins :user-id)}
                              {:alias        "u"
                               :source-table $$users
                               :strategy     :left-join
                               :condition    [:=
                                              [:field "ID" {:base-type :type/BigInteger}]
                                              &u.users.id]}]
               :limit        10})
            (resolve-joins
             (lib.tu.macros/mbql-query checkins
               {:source-table $$checkins
                :aggregation  [[:sum &USERS__via__USER_ID.users.id]]
                :breakout     [$id]
                :joins        [{:source-table $$users
                                :alias        "USERS__via__USER_ID"
                                :strategy     :left-join
                                :condition    [:= $user-id &USERS__via__USER_ID.users.id]
                                :fk-field-id  (meta/id :checkins :user-id)
                                :fields       :none}
                               {:alias        "u"
                                :source-table $$users
                                :condition    [:=
                                               [:field "ID" {:base-type :type/BigInteger}]
                                               [:field %users.id {:join-alias "u"}]]}]
                :limit        10}))))))

(deftest ^:parallel join-with-source-query-test
  (testing "Does a join using a source query get its Tables resolved?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:joins    [{:alias        "cat"
                           :source-table $$categories
                           :strategy     :left-join
                           :condition    [:=
                                          $category-id
                                          [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]}]
               :order-by [[:asc $name]]
               :limit    3})
            (resolve-joins
             (lib.tu.macros/mbql-query venues
               {:joins    [{:alias        "cat"
                            :source-query {:source-table $$categories}
                            :condition    [:=
                                           $category-id
                                           [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]}]
                :order-by [[:asc $name]]
                :limit    3}))))))

(deftest ^:parallel resolve-source-query-with-fields-all-test
  (testing "Can we resolve joins using a `:source-query` and `:fields` `:all`?"
    (let [source-metadata (for [col (qp.preprocess/query->expected-cols
                                     (lib/query meta/metadata-provider (lib.tu.macros/mbql-query categories {:limit 1})))]
                            (dissoc col :source :field_ref))
          resolved        (resolve-joins
                           (lib.tu.macros/mbql-query venues
                             {:joins    [{:alias           "cat"
                                          :source-query    {:source-table $$categories}
                                          :source-metadata source-metadata
                                          :fields          :all
                                          :condition       [:=
                                                            $category-id
                                                            [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]}]
                              :order-by [[:asc $name]]
                              :limit    3}))]
      (is (=? (lib.tu.macros/mbql-query venues
                {:fields   [[:field (meta/id :categories :id)   {:join-alias "cat", :qp/ignore-coercion true}]
                            [:field (meta/id :categories :name) {:join-alias "cat", :qp/ignore-coercion true}]]
                 :joins    [{:alias           "cat"
                             :source-table    $$categories
                             :source-metadata source-metadata
                             :strategy        :left-join
                             :condition       [:= $category-id [:field "ID" {:base-type :type/BigInteger, :join-alias "cat"}]]
                             :fields          [&cat.categories.id
                                               &cat.categories.name]}]
                 :order-by [[:asc $name]]
                 :limit    3})
              resolved)))))

(deftest ^:parallel dont-append-fields-if-parent-has-breakout-or-aggregation-test
  (testing "if the parent level has a breakout or aggregation, we shouldn't append Join fields to the parent level"
    (is (=? (lib.tu.macros/mbql-query users
              {:joins       [{:source-table $$checkins
                              :alias        "c"
                              :strategy     :left-join
                              :condition    [:= $id [:field "USER_ID" {:base-type :type/Integer, :join-alias "c"}]]
                              :fields       [&c.checkins.id
                                             &c.checkins.date
                                             &c.checkins.user-id
                                             &c.checkins.venue-id]}]
               :aggregation [[:sum [:field "id" {:base-type :type/Float, :join-alias "c"}]]]
               :breakout    [[:field %last-login {:temporal-unit :month}]]})
            (resolve-joins
             (lib.tu.macros/mbql-query users
               {:joins       [{:fields       :all
                               :alias        "c"
                               :source-table $$checkins
                               :condition    [:= $id [:field "USER_ID" {:base-type :type/Integer, :join-alias "c"}]]}]
                :aggregation [[:sum [:field "id" {:base-type :type/Float, :join-alias "c"}]]]
                :breakout    [[:field %last-login {:temporal-unit :month}]]}))))))

(deftest ^:parallel aggregation-field-ref-test
  (testing "Should correctly handle [:aggregation n] field refs"
    (is (some? (resolve-joins
                (lib.tu.macros/mbql-query users
                  {:fields [$id
                            $name
                            [:field %last-login {:temporal-unit :default}]]
                   :joins  [{:fields       :all
                             :alias        "__alias__"
                             :condition    [:= $id [:field %checkins.user-id {:join-alias "__alias__"}]]
                             :source-query {:source-table $$checkins
                                            :aggregation  [[:sum $checkins.id]]
                                            :breakout     [$checkins.user-id]}
                             :source-metadata
                             [{:name          "USER_ID"
                               :display_name  "User ID"
                               :base_type     :type/Integer
                               :semantic_type :type/FK
                               :id            %checkins.user-id
                               :field_ref     $checkins.user-id
                               :fingerprint   {:global {:distinct-count 15, :nil% 0.0}}}
                              {:name          "sum"
                               :display_name  "Sum of ID"
                               :base_type     :type/Decimal
                               :semantic_type :type/PK
                               :field_ref     [:aggregation 0]
                               :fingerprint   nil}]}]
                   :limit  10}))))))

(deftest ^:parallel native-model-field-ref-test
  (testing "should use name-based field refs for joined native models with mapped database fields (metabase#58829)"
    (let [source-metadata [{:name          "_USER_ID"
                            :display_name  "User ID"
                            :base_type     :type/Integer
                            :semantic_type :type/FK
                            :fingerprint   {:global {:distinct-count 15, :nil% 0.0}}}]]
      (is (= (lib.tu.macros/mbql-query users
               {:fields [$id
                         [:field "_USER_ID" {:base-type          :type/Integer
                                             :join-alias         "alias"
                                             :qp/ignore-coercion true}]]
                :joins  [{:fields       [[:field "_USER_ID" {:base-type :type/Integer :join-alias "alias"}]]
                          :alias        "alias"
                          :strategy     :left-join
                          :condition    [:= $id [:field "_USER_ID" {:base-type :type/Integer :join-alias "alias"}]]
                          :source-query {:native "SELECT USER_ID AS _USER_ID FROM CHECKINS"}
                          :source-metadata source-metadata}]
                :limit  10})
             (resolve-joins
              (lib.tu.macros/mbql-query users
                {:fields [$id]
                 :joins  [{:fields         :all
                           :alias          "alias"
                           :condition      [:= $id [:field "_USER_ID" {:base-type :type/Integer :join-alias "alias"}]]
                           :source-query   {:native "SELECT USER_ID AS _USER_ID FROM CHECKINS"}
                           :source-metadata source-metadata}]
                 :limit  10})))))))

(deftest ^:parallel join-against-source-query-test
  (is (= (lib.tu.macros/mbql-query venues
           {:joins    [{:source-query {:source-table $$categories
                                       :fields       [$categories.id
                                                      $categories.name]}
                        :alias        "cat"
                        :condition    [:= $venues.category-id &cat.*ID/BigInteger]
                        :strategy     :left-join}]
            :fields   [$venues.id
                       $venues.name
                       $venues.category-id
                       $venues.latitude
                       $venues.longitude
                       $venues.price]
            :order-by [[:asc $venues.name]]
            :limit    3})
         (resolve-joins
          (lib.tu.macros/mbql-query venues
            {:joins    [{:source-query {:source-table $$categories
                                        :fields       [$categories.id
                                                       $categories.name]}
                         :alias        "cat"
                         :condition    [:= $venues.category-id &cat.*ID/BigInteger]}]
             :fields   [$venues.id
                        $venues.name
                        $venues.category-id
                        $venues.latitude
                        $venues.longitude
                        $venues.price]
             :order-by [[:asc $venues.name]]
             :limit    3})))))

(deftest ^:parallel do-not-duplicate-columns-with-default-temporal-bucketing-test
  (testing "Do not add a duplicate column from a join if it uses :default temporal bucketing"
    (let [original-stage {:fields [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                    (meta/id :orders :id)]
                                   [:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :join-alias "P", :temporal-unit :default}
                                    (meta/id :people :birth-date)]]}]
      (doseq [temporal-unit           [nil :default]
              base-type               [nil :type/Date]
              effective-type          [nil :type/Date]
              inherited-temporal-unit [nil :default]
              ;; make sure random keys don't affect this either
              lib-key                 [nil "PRODUCTS"]
              :let                    [opts (cond-> {:join-alias "P"
                                                     :lib/uuid   "00000000-0000-0000-0000-000000000002"}
                                              temporal-unit           (assoc :temporal-unit temporal-unit)
                                              base-type               (assoc :base-type base-type)
                                              effective-type          (assoc :effective-type effective-type)
                                              inherited-temporal-unit (assoc :inherited-temporal-unit inherited-temporal-unit)
                                              lib-key                 (assoc :lib/nonsense-key lib-key))
                                       clause [:field opts (meta/id :people :birth-date)]]]
        (testing (pr-str clause)
          (is (= original-stage
                 (resolve-joins/append-join-fields-to-fields
                  original-stage
                  [clause]))))))))

(deftest ^:parallel do-not-duplicate-columns-with-default-temporal-bucketing-e2e-test
  (testing "Do not add a duplicate column from a join if it uses :default temporal bucketing"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :database-id   (meta/id)
                           :name          "QB Binning"
                           :dataset-query (lib.tu.macros/mbql-query orders
                                            {:joins  [{:source-table (meta/id :people)
                                                       :alias        "People"
                                                       :condition    [:=
                                                                      $user-id
                                                                      &People.people.id]
                                                       :fields       [&People.people.longitude
                                                                      &People.!default.people.birth-date]}
                                                      {:source-table (meta/id :products)
                                                       :alias        "Products"
                                                       :condition    [:=
                                                                      $product-id
                                                                      &Products.products.id]
                                                       :fields       [&Products.products.price]}]
                                             :fields [$id]})}]})
          query (lib/query mp (lib.metadata/card mp 1))]
      (is (= [[:field "ID" {:base-type :type/BigInteger}]
              [:field "People__LONGITUDE" {:base-type :type/Float}]
              [:field "People__BIRTH_DATE" {:inherited-temporal-unit :default, :base-type :type/Date}]
              [:field "Products__PRICE" {:base-type :type/Float}]]
             (-> query qp.preprocess/preprocess lib/->legacy-MBQL :query :fields))))))

;;; adapted from [[metabase.query-processor.explicit-joins-test/join-against-saved-question-with-sort-test]]
(deftest ^:parallel join-against-same-table-returned-columns-test
  (testing "Joining against a query that ultimately have the same source table SHOULD result in 'duplicate' columns being included."
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query products
                   {:joins    [{:source-query {:source-table $$products
                                               :aggregation  [[:count]]
                                               :breakout     [$category]
                                               :order-by     [[:asc [:aggregation 0]]]}
                                :alias        "Q1"
                                :condition    [:= $category [:field %category {:join-alias "Q1"}]]
                                :fields       :all}]
                    :order-by [[:asc $id]]
                    :limit    1}))]
      (is (= [;; these 8 are from PRODUCTS
              "ID"
              "Ean"
              "Title"
              "Category"
              "Vendor"
              "Price"
              "Rating"
              "Created At"
              ;; the next 2 are from PRODUCTS
              "Q1 → Category"
              "Q1 → Count"]
             (map :display_name (qp.preprocess/query->expected-cols query)))))))

(deftest ^:parallel join-fields-missing-join-alias-e2e-test
  (testing "If a ref in join `:fields` is missing `:join-alias` we should add it when adding fields to the parent stage"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query {:database (meta/id)
                                           :type     :query
                                           :query    {:source-table (meta/id :venues)}}}
                          {:id              2
                           :dataset-query   {:database (meta/id)
                                             :type     :native
                                             :native   {:query "SELECT * FROM checkins"}}
                           :result-metadata (for [field (meta/fields :checkins)]
                                              (-> (meta/field-metadata :checkins field)
                                                  (dissoc :id :table-id)))}]})
          query (lib/query
                 mp
                 {:database (meta/id)
                  :type     :query
                  :query    {:source-table "card__1"
                             :joins        [{:fields       [[:field "ID" {:base-type :type/Integer}]] ; busted ref, missing join-alias
                                             :source-table "card__2"
                                             :alias        "native_card"
                                             :condition    [:=
                                                            [:field "ID" {:base-type :type/Integer}]
                                                            [:field "VENUE_ID" {:base-type :type/Integer, :join-alias "native_card"}]]
                                             :strategy     :left-join}]
                             :limit        10}})]
      (is (=? {:query {:fields [[:field "ID" {}]
                                [:field "NAME" {}]
                                [:field "CATEGORY_ID" {}]
                                [:field "LATITUDE" {}]
                                [:field "LONGITUDE" {}]
                                [:field "PRICE" {}]
                                [:field "ID" {:base-type :type/Integer, :join-alias "native_card"}]]}}
              (-> query
                  qp.preprocess/preprocess
                  lib/->legacy-MBQL))))))
