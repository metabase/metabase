(ns metabase.lib.metadata.calculate-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.metadata.calculate :as calculate]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private venues-query
  {:lib/type     :mbql/query
   :lib/metadata meta/metadata-provider
   :type         :pipeline
   :database     (meta/id)
   :stages       [{:lib/type     :mbql.stage/mbql
                   :lib/options  {:lib/uuid (str (random-uuid))}
                   :source-table (meta/id :venues)}]})

(defn- venues-query-with-last-stage [m]
  (let [query (update-in venues-query [:stages 0] merge m)]
    (is (mc/validate ::lib.schema/query query))
    query))

(defn- field-clause
  ([table field]
   (field-clause table field nil))
  ([table field options]
   [:field
    (merge {:base-type (:base_type (meta/field-metadata table field))
            :lib/uuid  (str (random-uuid))}
           options)
    (meta/id table field)]))

(deftest ^:parallel col-info-field-ids-test
  (testing "make sure columns are comming back the way we'd expect for :field clauses"
    (let [query {:lib/type     :mbql/query
                 :type         :pipeline
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid "0311c049-4973-4c2a-8153-1e2c887767f9"}
                                 :source-table (meta/id :venues)
                                 :fields       [(field-clause :venues :price)]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (is (mc/validate ::lib.schema/query query))
      (is (=? [(merge (meta/field-metadata :venues :price)
                      {:source    :fields
                       :field_ref [:field {:lib/uuid string?} (meta/id :venues :price)]})]
              (calculate/stage-metadata query))))))

;;; FIXME
#_(deftest ^:parallel col-info-implicit-join-test
  (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                "info about the source Field")
    (is (=? [(merge (dissoc (meta/field-metadata :categories :name) :database_type)
                    {:fk_field_id (meta/id :venues :category-id)
                     :source      :fields
                     :field_ref   [:field {:fk-field-id (meta/id :venues :category-id)} (meta/id :categories :name)]})]
            (stage-metadata
             {:type  :query
              :query {:source-table (meta/id :venues)
                      :fields       [[:field (meta/id :categories :name) {:fk-field-id (meta/id :venues :category-id)}]]}})))))

(deftest ^:parallel col-info-explicit-join-test
  (testing "Display name for a joined field should include a nice name for the join; include other info like :source_alias"
    (is (=? [(merge (meta/field-metadata :categories :name)
                    {:display_name "Categories → Name"
                     :source       :fields
                     :field_ref    [:field
                                    {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                                    (meta/id :categories :name)]})]
            (calculate/stage-metadata
             {:lib/type     :mbql/query
              :type         :pipeline
              :stages       [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                              :source-table (meta/id :venues)
                              :fields       [[:field
                                              {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                               :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                              (meta/id :categories :name)]]
                              :joins        [{:lib/type    :mbql/join
                                              :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
                                              :alias       "CATEGORIES__via__CATEGORY_ID"
                                              :condition   [:=
                                                            {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                            (field-clause :venues :category-id)
                                                            (field-clause :categories :id {:join-alias "CATEGORIES__via__CATEGORY_ID"})]
                                              :strategy    :left-join
                                              :fk-field-id (meta/id :venues :category-id)
                                              :stages      [{:lib/type     :mbql.stage/mbql
                                                             :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                             :source-table (meta/id :categories)}]}]}]
              :database     (meta/id)
              :lib/metadata meta/metadata-provider})))))

(defn- grandparent-parent-child-id [field]
  (+ (meta/id :venues :id)
     (case field
       :grandparent 50
       :parent      60
       :child       70)))

(def ^:private grandparent-parent-child-metadata-provider
  "A MetadataProvider for a Table that nested Fields: grandparent, parent, and child"
  (let [grandparent {:lib/type :metadata/field
                     :name     "grandparent"
                     :id       (grandparent-parent-child-id :grandparent)}
        parent      {:lib/type  :metadata/field
                     :name      "parent"
                     :parent_id (grandparent-parent-child-id :grandparent)
                     :id        (grandparent-parent-child-id :parent)}
        child       {:lib/type  :metadata/field
                     :name      "child"
                     :parent_id (grandparent-parent-child-id :parent)
                     :id        (grandparent-parent-child-id :child)}]
    (reify lib.metadata.protocols/MetadataProvider
      (database [_this]
        (dissoc meta/metadata :tables))
      (tables [_this]
        [(dissoc (meta/table-metadata :venues) :fields)])
      (fields [_this table-id]
        (when (= table-id (meta/id :venues))
          (mapv (fn [field-metadata]
                  (merge (dissoc (meta/field-metadata :venues :id) :display_name)
                         field-metadata))
                [grandparent parent child]))))))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (letfn [(col-info [a-field-clause]
            (#'calculate/metadata-for-ref
             {:lib/type     :mbql/query
              :lib/metadata grandparent-parent-child-metadata-provider
              :type         :pipeline
              :database     (meta/id)
              :stages       [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid (str (random-uuid))}
                              :source-table (meta/id :venues)}]}
             -1
             a-field-clause))]
    (testing "For fields with parents we should return them with a combined name including parent's name"
      (is (=? {:table_id          (meta/id :venues)
               :name              "grandparent.parent"
               :field_ref         [:field {} (grandparent-parent-child-id :parent)]
               :parent_id         (grandparent-parent-child-id :grandparent)
               :id                (grandparent-parent-child-id :parent)
               :visibility_type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :parent)]))))
    (testing "nested-nested fields should include grandparent name (etc)"
      (is (=? {:table_id          (meta/id :venues)
               :name              "grandparent.parent.child"
               :field_ref         [:field {} (grandparent-parent-child-id :child)]
               :parent_id         (grandparent-parent-child-id :parent)
               :id                (grandparent-parent-child-id :child)
               :visibility_type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :child)]))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:lib/stage-metadata` if it was supplied"
    (is (=? {:name          "sum"
             :display_name  "sum of User ID"
             :base_type     :type/Integer
             :field_ref     [:field {:base-type :type/Integer} "sum"]
             :semantic_type :type/FK}
            (#'calculate/metadata-for-ref
             (venues-query-with-last-stage
              {:lib/stage-metadata
               {:lib/type :metadata/results
                :columns  [{:lib/type      :metadata/field
                            :name          "abc"
                            :display_name  "another Field"
                            :base_type     :type/Integer
                            :semantic_type :type/FK}
                           {:lib/type      :metadata/field
                            :name          "sum"
                            :display_name  "sum of User ID"
                            :base_type     :type/Integer
                            :semantic_type :type/FK}]}})
             -1
             [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"])))))

(deftest ^:parallel col-info-expression-ref-test
  (is (=? {:base_type    :type/Integer
           :name         "double-price"
           :display_name "double-price"
           :field_ref    [:expression {:lib/uuid string?} "double-price"]}
          (#'calculate/metadata-for-ref
           (venues-query-with-last-stage
            {:expressions {"double-price" [:*
                                           {:lib/uuid (str (random-uuid))}
                                           (field-clause :venues :price {:base-type :type/Integer})
                                           2]}})
           -1
           [:expression {:lib/uuid (str (random-uuid))} "double-price"]))))

(deftest ^:parallel col-info-for-temporal-expression-test
  (is (=? {:base_type    :type/DateTime
           :name         "last-login-plus-2"
           :display_name "last-login-plus-2"
           :field_ref    [:expression {} "last-login-plus-2"]}
          (#'calculate/metadata-for-ref
           (venues-query-with-last-stage
            {:expressions {"last-login-plus-2" [:datetime-add
                                                {:lib/uuid (str (random-uuid))}
                                                (field-clause :users :last-login {:base-type :type/DateTime})
                                                2
                                                :hour]}})
           -1
           [:expression {:lib/uuid (str (random-uuid))} "last-login-plus-2"]))))

(deftest ^:parallel col-info-for-expression-error-message-test
  (testing "if there is no matching expression it should give a meaningful error message"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"No expression named \"double-price\""
         (#'calculate/metadata-for-ref
          (venues-query-with-last-stage
           {:expressions {"one-hundred" 100}})
          -1
          [:expression {:lib/uuid (str (random-uuid))} "double-price"])))))

(defn- col-info-for-aggregation-clause
  ([clause]
   (col-info-for-aggregation-clause venues-query clause))

  ([query clause]
   (col-info-for-aggregation-clause query -1 clause))

  ([query stage clause]
   (#'calculate/metadata-for-aggregation query stage clause 0)))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (are [clause expected] (=? expected
                             (col-info-for-aggregation-clause clause))
    ;; :count, no field
    [:/ {} [:count {}] 2]
    {:base_type    :type/Float
     :name         "count_divided_by_2"
     :display_name "Count ÷ 2"}

    ;; :sum
    [:sum {} [:+ {} (field-clause :venues :price) 1]]
    {:base_type    :type/Integer
     :name         "sum_price_plus_1"
     :display_name "Sum of Price + 1"}

    ;; options map
    [:sum
     {:name "sum_2", :display-name "My custom name", :base-type :type/BigInteger}
     (field-clause :venues :price)]
    {:base_type     :type/BigInteger
     :name          "sum_2"
     :display_name  "My custom name"}))

(deftest ^:parallel col-info-named-aggregation-test
  (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
    (is (=? {:base_type    :type/Integer
             :name         "sum_double-price"
             :display_name "Sum of double-price"}
            (col-info-for-aggregation-clause
             (venues-query-with-last-stage
              {:expressions {"double-price" [:*
                                             {:lib/uuid (str (random-uuid))}
                                             (field-clause :venues :price {:base-type :type/Integer})
                                             2]}})
             [:sum
              {:lib/uuid (str (random-uuid))}
              [:expression {:base-type :type/Integer, :lib/uuid (str (random-uuid))} "double-price"]])))))

(defn- infer-first
  ([expr]
   (infer-first expr nil))

  ([expr last-stage]
   (#'calculate/metadata-for-ref
    (venues-query-with-last-stage
     (merge
      {:expressions {"expr" expr}}
      last-stage))
    -1
    [:expression {:lib/uuid (str (random-uuid))} "expr"])))

(deftest ^:parallel infer-coalesce-test
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the field"
        (is (=? {:name         "expr"
                 :field_ref    [:expression {} "expr"]
                 :display_name "expr"
                 :base_type    :type/Text}
                (infer-first [:coalesce
                              {:lib/uuid (str (random-uuid))}
                              (field-clause :venues :name)
                              "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (not (contains? (infer-first [:coalesce {:lib/uuid (str (random-uuid))} (field-clause :venues :name) "bar"])
                              :id)))))
      (testing "Gets the type information from the literal"
        (is (=? {:base_type    :type/Text
                 :name         "expr"
                 :display_name "expr"
                 :field_ref    [:expression {} "expr"]}
                (infer-first [:coalesce {:lib/uuid (str (random-uuid))} "bar" (field-clause :venues :name)])))))))

(deftest ^:parallel infer-case-test
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name         "expr"
                 :field_ref    [:expression {} "expr"]
                 :display_name "expr"
                 :base_type    :type/Text}
                (infer-first [:coalesce
                              {:lib/uuid (str (random-uuid))}
                              (field-clause :venues :name)
                              "bar"])))
        (testing "does not contain a field id in its analysis (#17512)"
          (is (false?
               (contains? (infer-first [:coalesce {:lib/uuid (str (random-uuid))} (field-clause :venues :name) "bar"])
                          :id))))))))

(deftest ^:parallel deduplicate-expression-names-in-aggregations-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (is (=? [{:base_type    :type/Float
                :name         "0_9_times_avg_price"
                :display_name "0.9 × Average of Price"
                :field_ref    [:aggregation {:lib/uuid string?} 0]}
               {:base_type    :type/Float
                :name         "0_8_times_avg_price"
                :display_name "0.8 × Average of Price"
                :field_ref    [:aggregation {:lib/uuid string?} 1]}]
              (calculate/stage-metadata
               (venues-query-with-last-stage
                {:aggregation [[:*
                                {}
                                0.9
                                [:avg {} (field-clause :venues :price)]]
                               [:*
                                {}
                                0.8
                                [:avg {} (field-clause :venues :price)]]]})))))))

(deftest ^:parallel expression-references-in-fields-clause-test
  (is (=? [{:name            "prev_month"
            :display_name    "prev_month"
            :base_type       :type/DateTime
            :source          :fields
            :field_ref       [:expression {:lib/uuid string?} "prev_month"]}]
          (calculate/stage-metadata
           (venues-query-with-last-stage
            {:expressions {"prev_month" [:+
                                         {:lib/uuid (str (random-uuid))}
                                         (field-clause :users :last-login)
                                         [:interval {:lib/uuid (str (random-uuid))} -1 :month]]}
             :fields      [[:expression {:base-type :type/DateTime, :lib/uuid (str (random-uuid))} "prev_month"]]})))))
