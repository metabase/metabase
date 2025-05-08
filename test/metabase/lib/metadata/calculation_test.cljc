(ns metabase.lib.metadata.calculation-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.ident :as lib.metadata.ident]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel calculate-names-even-without-metadata-test
  (testing "Even if metadata is missing, we should still be able to calculate reasonable display names"
    (doseq [query [(-> (lib.tu/venues-query)
                       (lib/order-by (meta/field-metadata :orders :total)))
                   (-> (lib.tu/venues-query)
                       (lib/order-by [:field
                                      {:lib/uuid  (str (random-uuid))
                                       :base-type :type/Text}
                                      "TOTAL"]))]]
      (testing (str "\nquery =\n" (u/pprint-to-str query))
        (is (= "Venues, Sorted by Total ascending"
               (lib/suggested-name query)))))))

(deftest ^:parallel long-display-name-test
  (let [query (lib.tu/venues-query)
        results (->> query
                     lib/visible-columns
                     (map (comp :long-display-name #(lib/display-info query 0 %))))]
    (is (= ["ID" "Name" "Category ID" "Latitude" "Longitude" "Price" "Category → ID" "Category → Name"]
           results)))

  (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        results (->> query
                     lib/visible-columns
                     (map (comp :long-display-name #(lib/display-info query 0 %))))]
    (is (= ["ID"
            "User ID"
            "Product ID"
            "Subtotal"
            "Tax"
            "Total"
            "Discount"
            "Created At"
            "Quantity"
            "User → ID"
            "User → Address"
            "User → Email"
            "User → Password"
            "User → Name"
            "User → City"
            "User → Longitude"
            "User → State"
            "User → Source"
            "User → Birth Date"
            "User → Zip"
            "User → Latitude"
            "User → Created At"
            "Product → ID"
            "Product → Ean"
            "Product → Title"
            "Product → Category"
            "Product → Vendor"
            "Product → Price"
            "Product → Rating"
            "Product → Created At"]
           results))))

(deftest ^:parallel display-name-without-metadata-test
  (testing "Some display name is generated for fields even if they cannot be resolved (#33490)"
    (let [query      (lib.tu/venues-query)
          field-id   (inc (apply max (map :id (lib/visible-columns query))))]
      (mu/disable-enforcement
        (is (=? {:name              (str field-id)
                 :display-name      "Unknown Field"
                 :long-display-name "join → Unknown Field"}
                (lib/display-info query [:field {:join-alias "join"} field-id])))))))

(deftest ^:parallel visible-columns-test
  (testing "Include all visible columns, not just projected ones (#31233)"
    (is (= ["ID"
            "NAME"
            "CATEGORY_ID"
            "LATITUDE"
            "LONGITUDE"
            "PRICE"
            "Categories__ID"            ; this column is not projected, but should still be returned.
            "Categories__NAME"]
           (map :lib/desired-column-alias
                (-> (lib.tu/venues-query)
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Categories"))])
                                  (lib/with-join-fields [(lib/with-join-alias (meta/field-metadata :categories :name) "Categories")])))
                    lib/visible-columns)))))
  (testing "nil has no visible columns (#31366)"
    (is (empty? (-> (lib.tu/venues-query)
                    (lib/visible-columns nil)))))
  (testing "Include multiple implicitly joinable columns pointing to the same table and field (##33451)"
    (is (= ["id"
            "created_by"
            "updated_by"
            "ic_accounts__via__created_by__id"
            "ic_accounts__via__created_by__name"
            "ic_accounts__via__updated_by__id"
            "ic_accounts__via__updated_by__name"]
           (->> (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
                lib/visible-columns
                (map :lib/desired-column-alias)))))
  (testing "multiple aggregations"
    (lib.metadata.calculation/visible-columns
     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
         (lib/aggregate (lib/count))
         (lib/aggregate (lib/sum (meta/field-metadata :orders :quantity)))))))

(deftest ^:parallel source-cards-test
  (testing "with :source-card"
    (let [query {:lib/type     :mbql/query
                 :lib/metadata (lib.tu/metadata-provider-with-mock-cards)
                 :database     (meta/id)
                 :stages       [{:lib/type :mbql.stage/mbql
                                 :source-card (:id ((lib.tu/mock-cards) :orders))}]}
          own-fields (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :orders))]
                       (-> field
                           (assoc :lib/source :source/card)))
          user-id    (lib.metadata/field (lib.tu/metadata-provider-with-mock-cards) (meta/id :orders :user-id))
          product-id (lib.metadata/field (lib.tu/metadata-provider-with-mock-cards) (meta/id :orders :product-id))]
      (testing "implicitly joinable columns"
        (testing "are included by visible-columns"
          (is (=? (->> (concat own-fields
                               (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :people))]
                                 (assoc field
                                        :lib/source :source/implicitly-joinable
                                        :ident      (lib.metadata.ident/implicitly-joined-ident
                                                     (:ident field) (:ident user-id))))
                               (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :products))]
                                 (assoc field
                                        :lib/source :source/implicitly-joinable
                                        :ident      (lib.metadata.ident/implicitly-joined-ident
                                                     (:ident field) (:ident product-id)))))
                       (sort-by (juxt :name :id)))
                  (sort-by (juxt :name :id) (lib.metadata.calculation/visible-columns query)))))
        (testing "are not included by returned-columns"
          (is (=? (sort-by (juxt :name :id) own-fields)
                  (sort-by (juxt :name :id) (lib.metadata.calculation/returned-columns query))))))
      (testing "multi-stage implicitly joinable columns"
        (let [own-fields (mapv #(-> %
                                    (dissoc :id :table-id)
                                    (assoc :lib/source :source/previous-stage))
                               own-fields)
              query      (lib/append-stage query)
              cols       (lib.metadata.calculation/visible-columns query)
              user-id    (m/find-first (comp #{"USER_ID"} :name) cols)
              product-id (m/find-first (comp #{"PRODUCT_ID"} :name) cols)]
          (testing "are included by visible-columns"
            (is (=? (->> (concat own-fields
                                 (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :people))]
                                   (assoc field
                                          :lib/source :source/implicitly-joinable
                                          :ident (lib.metadata.ident/implicitly-joined-ident (:ident field) (:ident user-id))))
                                 (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :products))]
                                   (assoc field
                                          :lib/source :source/implicitly-joinable
                                          :ident (lib.metadata.ident/implicitly-joined-ident (:ident field) (:ident product-id)))))
                         (sort-by (juxt :lib/source :name :id)))
                    (sort-by (juxt :lib/source :name :id) (lib.metadata.calculation/visible-columns query)))))
          (testing "are not included by returned-columns"
            (is (=? (sort-by (juxt :name :id) own-fields)
                    (sort-by (juxt :name :id) (lib.metadata.calculation/returned-columns query))))))))))

(defn- implicitly-joined [fk-ident table-key]
  (->> (for [field-key (meta/fields table-key)]
         (-> (meta/field-metadata table-key field-key)
             (assoc :lib/source :source/implicitly-joinable)
             (update :ident lib.metadata.ident/implicitly-joined-ident fk-ident)))
       (sort-by :position)))

(deftest ^:parallel self-join-visible-columns-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields (for [field [:id :tax]]
                                     (lib/ref (meta/field-metadata :orders field))))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                 [(lib/= (meta/field-metadata :orders :id)
                                                         (meta/field-metadata :orders :id))])
                                (lib/with-join-fields (for [field [:id :tax]]
                                                        (lib/ref (meta/field-metadata :orders field)))))))
        join-clause (first (lib/joins query))
        orders-cols (for [field-name ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX"
                                      "TOTAL" "DISCOUNT" "CREATED_AT" "QUANTITY"]]
                      {:name field-name
                       :lib/desired-column-alias field-name
                       :lib/source :source/table-defaults})
        joined-cols (for [field-key [:id :user-id :product-id :subtotal :tax
                                     :total :discount :created-at :quantity]
                          :let [field (meta/field-metadata :orders field-key)]]
                      {:name (:name field)
                       :lib/desired-column-alias (str "Orders__" (:name field))
                       :lib/source :source/joins
                       :ident (lib.metadata.ident/explicitly-joined-ident (:ident field) (:ident join-clause))})]
    (testing "just own columns"
      (is (=? (concat orders-cols joined-cols)
              (lib/visible-columns query -1 (lib.util/query-stage query -1) {:include-implicitly-joinable? false}))))
    (testing "with implicit joins"
      (is (=? (concat orders-cols
                      joined-cols
                      ;; First set of implicit joins
                      (implicitly-joined (:ident (meta/field-metadata :orders :user-id))
                                         :people)
                      (implicitly-joined (:ident (meta/field-metadata :orders :product-id))
                                         :products)
                      ;; Second set of implicit joins
                      (implicitly-joined
                       (lib.metadata.ident/explicitly-joined-ident (meta/ident :orders :user-id) (:ident join-clause))
                       :people)
                      (implicitly-joined
                       (lib.metadata.ident/explicitly-joined-ident
                        (meta/ident :orders :product-id)
                        (:ident join-clause))
                       :products))
              (lib/visible-columns query -1 (lib.util/query-stage query -1)))))))

(deftest ^:parallel visible-columns-excludes-offset-expressions-test
  (testing "visible-columns should exclude expressions which contain :offset"
    (let [query (-> (lib.tu/venues-query)
                    (lib/order-by (meta/field-metadata :venues :id) :asc)
                    (lib/expression "Offset col"    (lib/offset (meta/field-metadata :venues :price) -1))
                    (lib/expression "Nested Offset"
                                    (lib/* 100 (lib/offset (meta/field-metadata :venues :price) -1))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/visible-columns query)))))))

(deftest ^:parallel returned-columns-includes-offset-expressions-test
  (testing "returned-columns should include expressions which contain :offset"
    (let [query (-> (lib.tu/venues-query)
                    (lib/order-by (meta/field-metadata :venues :id) :asc)
                    (lib/expression "Offset col"    (lib/offset (meta/field-metadata :venues :price) -1))
                    (lib/expression "Nested Offset"
                                    (lib/* 100 (lib/offset (meta/field-metadata :venues :price) -1))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:name "Offset col",    :lib/source :source/expressions}
                 {:name "Nested Offset", :lib/source :source/expressions}]
                (lib/returned-columns query)))))))

(deftest ^:parallel implicitly-joinable-requires-numeric-id-test
  (letfn [(query-with-user-id-tweaks [tweaks]
            (let [base     (-> (lib.tu/mock-cards)
                               :orders/native
                               lib.tu/as-model)
                  metadata (mapv (fn [col]
                                   (cond-> col
                                     (= (:name col) "USER_ID") (merge tweaks)))
                                 (:result-metadata base))
                  model    (assoc base :result-metadata metadata)]
              (lib/query (lib.tu/metadata-provider-with-mock-card model) model)))]
    (testing "implicit join requires real field IDs, so SQL models need to provide that metadata (#37067)"
      (let [query (query-with-user-id-tweaks nil)]
        (testing "without FK metadata, only the own columns are returned"
          (is (= 9 (count (lib/visible-columns query))))
          (is (= []
                 (->> (lib/visible-columns query)
                      (remove (comp #{:source/card} :lib/source)))))))

      (testing "metadata for the FK target field is not sufficient"
        (let [query (query-with-user-id-tweaks {:fk-target-field-id (meta/id :people :id)})]
          (is (= 9 (count (lib/visible-columns query))))
          (is (= []
                 (->> (lib/visible-columns query)
                      (remove (comp #{:source/card} :lib/source)))))))

      (testing "an ID for the FK field itself is not sufficient"
        (let [query (query-with-user-id-tweaks {:id            (meta/id :orders :user-id)
                                                :semantic-type nil})]
          (is (= 9 (count (lib/visible-columns query))))
          (is (= []
                 (->> (lib/visible-columns query)
                      (remove (comp #{:source/card} :lib/source)))))))
      (testing "the ID and :semantic-type :type/FK are sufficient for an implicit join"
        (let [query         (query-with-user-id-tweaks {:id            (meta/id :orders :user-id)
                                                        :semantic-type :type/FK})
              fields-of     (fn [table-kw order-fn]
                              (->> (meta/fields table-kw)
                                   (map #(meta/field-metadata table-kw %))
                                   (sort-by order-fn)))
              orders-fields (into {} (for [[index field] (m/indexed ["ID" "SUBTOTAL" "TOTAL" "TAX" "DISCOUNT" "QUANTITY"
                                                                     "CREATED_AT" "PRODUCT_ID" "USER_ID"])]
                                       [field index]))
              orders-cols   (fields-of :orders (comp orders-fields :name))
              people-cols   (fields-of :people :position)]
          (is (= 22 (count (lib/visible-columns query))))
          (is (=? (concat (for [col orders-cols]
                            {:name       (:name col)
                             :lib/source :source/card})
                          (for [col people-cols]
                            {:name       (:name col)
                             :lib/source :source/implicitly-joinable}))
                  (lib/visible-columns query))))))))

(def cols-fns [lib/visible-columns lib/filterable-columns lib/breakoutable-columns lib/orderable-columns])

(deftest ^:parallel inherited-temporal-unit-stage-propagation-test
  (let [unit :quarter
        base (-> meta/metadata-provider
                 (lib/query (meta/table-metadata :orders))
                 (lib/aggregate (lib/count)))
        stage-0-query (lib/breakout base
                                    (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) unit))
        stage-0-breakout (first (lib/breakouts stage-0-query))
        stage-0-returned-breakout-col (first (lib/returned-columns stage-0-query))
        stage-1-query (-> (lib/append-stage stage-0-query)
                          (lib/with-fields -1 [(assoc stage-0-returned-breakout-col
                                                      :lib/source :source/previous-stage)]))
        stage-2-query (lib/append-stage stage-1-query)]
    (testing "0th stage `orderable-columns` do not contain inherited-temporal-unit"
      (is ((complement contains?)
           (u/prog1 (lib/find-matching-column stage-0-breakout (lib/orderable-columns stage-0-query))
             (is (= :metadata/column (:lib/type <>))))
           :inherited-temporal-unit)))
    (testing "1st stage col function contain inherited-temporal-unit"
      (doseq [cols-fn cols-fns
              :let [stage-1-cols (cols-fn stage-1-query)
                    stage-1-col (lib/find-matching-column stage-0-breakout stage-1-cols)]]
        (is (= unit (:inherited-temporal-unit stage-1-col)))))
    (testing "inherited-temporal-unit is propagated into 2nd stage (and further)"
      (doseq [cols-fn cols-fns
              :let [stage-2-cols (cols-fn stage-2-query)
                    stage-1-ref (first (lib/fields stage-1-query))
                    stage-2-col (lib/find-matching-column stage-1-ref stage-2-cols)]]
        (is (= unit (:inherited-temporal-unit stage-2-col)))))))

(deftest ^:parallel inherited-temporal-unit-card-propagation-test
  (let [unit :quarter
        card-id 11001100
        card-query (-> meta/metadata-provider
                       (lib/query (meta/table-metadata :orders))
                       (lib/aggregate (lib/count))
                       (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) unit)))
        breakout-ref (first (lib/breakouts card-query))
        mp (lib.tu/metadata-provider-with-card-from-query card-id card-query)
        query (lib/query mp (lib.metadata/card mp card-id))]
    (testing "_cols functions_ return :inherited-temporal-unit for a card source"
      (doseq [cols-fn cols-fns]
        (is (contains? (lib/find-matching-column breakout-ref (cols-fn query))
                       :inherited-temporal-unit))))))

(deftest ^:parallel inherited-temporal-unit-propagation-from-expression-test
  (let [expression-name "created at + 1 month"
        query (as-> meta/metadata-provider $
                (lib/query $ (meta/table-metadata :orders))
                (lib/expression $
                                expression-name
                                (lib/datetime-add (meta/field-metadata :orders :created-at)
                                                  1 :month))
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (lib/with-temporal-bucket
                                  (lib/expression-ref $ 0 expression-name)
                                  :quarter))
                (lib/append-stage $))]
    (testing "_cols functions_ return :inherited-temporla-unit for bucketed expressions"
      (doseq [cols-fn cols-fns]
        (is (= :quarter (-> (lib/expression-ref query 0 expression-name)
                            (lib/find-matching-column (cols-fn query))
                            :inherited-temporal-unit)))))
    (testing "orderable columns do not contain inherited-temporal-unit for expression"
      (is (not (contains? (lib/find-matching-column (lib/expression-ref query 0 expression-name)
                                                    (lib/orderable-columns query 0))
                          :inherited-temporal-unit))))))

(deftest ^:parallel implicit-join-columns-get-idents-test
  (let [query        (lib/query meta/metadata-provider (meta/table-metadata :orders))
        implicit-cat (->> (lib/visible-columns query)
                          (m/find-first (comp #{"CATEGORY"} :name)))
        original-cat (lib.metadata/field meta/metadata-provider (meta/id :products :category))
        product-id   (lib.metadata/field meta/metadata-provider (meta/id :orders :product-id))]
    (is (some? implicit-cat))
    (is (some? original-cat))
    (is (= "MvxP-c7scJi3Ypicz7Pko"
           (:ident original-cat)))
    (testing "implicitly joined columns have different idents"
      (testing "from the target column"
        (is (not= (:ident original-cat)
                  (:ident implicit-cat))))
      (testing "from the FK column"
        (is (not= (:ident original-cat)
                  (:ident implicit-cat))))
      (testing "combining the FK and target column idents"
        (is (= (lib.metadata.ident/implicitly-joined-ident (:ident original-cat) (:ident product-id))
               (:ident implicit-cat)))))))

(deftest ^:parallel explicit-join-columns-get-idents-test
  (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/join (lib/join-clause (meta/table-metadata :products))))
        explicit-cat (->> (lib/visible-columns query)
                          (m/find-first (comp #{"CATEGORY"} :name)))
        original-cat (lib.metadata/field meta/metadata-provider (meta/id :products :category))]
    (is (some? explicit-cat))
    (is (some? original-cat))
    (is (= "MvxP-c7scJi3Ypicz7Pko"
           (:ident original-cat)))
    (testing "explicitly joined columns have different idents"
      (testing "from the target column"
        (is (not= (:ident original-cat)
                  (:ident explicit-cat))))
      (testing "from the join clause"
        (is (not= (:ident original-cat)
                  (:ident explicit-cat))))
      (testing "combining the join and target column idents"
        (is (= (->> query lib/joins first :ident
                    (lib.metadata.ident/explicitly-joined-ident (:ident original-cat)))
               (:ident explicit-cat)))))))

(deftest ^:parallel implicit-join-via-explicitly-joined-column-test
  (let [query                (-> (lib/query meta/metadata-provider (meta/table-metadata :reviews))
                                 (lib/join (lib/join-clause (meta/table-metadata :products)))
                                 (lib/join (lib/join-clause (meta/table-metadata :orders))))
        original             (lib.metadata/field meta/metadata-provider (meta/id :people :latitude))
        {latitude "LATITUDE"
         user-id  "USER_ID"} (m/index-by :name (lib/visible-columns query))]
    (is (some? original))
    (is (some? latitude))
    (testing "columns implicitly joined via an explicitly joined FK get different idents"
      (testing "from the original target column"
        (is (not= (:ident original)
                  (:ident latitude))))
      (testing "from the explicitly joined FK column"
        (is (not= (:ident user-id)
                  (:ident latitude))))
      (testing "combining the FK and target column idents"
        (is (= (lib.metadata.ident/implicitly-joined-ident (:ident original) (:ident user-id))
               (:ident latitude)))
        (testing "where the FK ident is based on the explicit join"
          (is (= (lib.metadata.ident/explicitly-joined-ident
                  (:ident (lib.metadata/field meta/metadata-provider (meta/id :orders :user-id)))
                  (-> query lib/joins second :ident))
                 (:ident user-id))))))))

(deftest ^:parallel multiple-implicit-joins-to-same-table-test
  (let [query          (lib/query meta/metadata-provider (meta/table-metadata :gh/issues))
        by-name        (group-by :name (lib/visible-columns query))
        emails         (get by-name "EMAIL")
        by-fk          (m/index-by :fk-field-id emails)
        base-email     (lib.metadata/field meta/metadata-provider (meta/id :gh/users :email))
        [reporter-id]  (get by-name "REPORTER_ID")
        [assignee-id]  (get by-name "ASSIGNEE_ID")
        reporter-email (get by-fk (:id reporter-id))
        assignee-email (get by-fk (:id assignee-id))]
    (testing "multiple FKs for the same table have implicit joins with distinct idents"
      (is (= (lib.metadata.ident/implicitly-joined-ident (:ident base-email) (:ident reporter-id))
             (:ident reporter-email)))
      (is (= (lib.metadata.ident/implicitly-joined-ident (:ident base-email) (:ident assignee-id))
             (:ident assignee-email)))
      (is (not= (:ident reporter-email)
                (:ident assignee-email))))))

;; TODO: Implicit self-joins are not allowed! Perhaps they should be, but right now we don't suggest duplicate joins
;; since they don't work very well. I'm leaving this test case in place for now.
#_(deftest ^:parallel implicit-self-join-test
    (let [query          (lib/query meta/metadata-provider (meta/table-metadata :gh/comments))
          by-name        (group-by :name (lib/visible-columns query))
          [reply-to]     (get by-name "REPLY_TO")
          posted-ats     (->> (get by-name "POSTED_AT")
                              (group-by :fk-field-id))
          [own-at]       (get posted-ats nil)
          [reply-to-at]  (get posted-ats (meta/id :gh/comments :reply-to))
          base-posted-at (lib.metadata/field meta/metadata-provider (meta/id :gh/comments :posted-at))]
      (testing "implicit self-join gives duplicate columns distinct IDs"
        (is (= (:ident base-posted-at)
               (:ident own-at)))
        (is (= (lib.metadata.ident/implicitly-joined-ident (:ident reply-to) (:ident base-posted-at))
               (:ident reply-to-at)))
        (is (not= (:ident own-at)
                  (:ident reply-to-at))))))

(deftest ^:parallel implicit-join-through-source-or-explicit-join-test
  ;; Issues joined to itself on Issues.ID; this is dumb but it serves the purpose.
  (let [query      (-> (lib/query meta/metadata-provider (meta/table-metadata :gh/issues))
                       (lib/join (lib/join-clause (meta/table-metadata :gh/issues)
                                                  [(lib/= (meta/field-metadata :gh/issues :id)
                                                          (meta/field-metadata :gh/issues :id))])))
        by-name    (group-by :name (lib/visible-columns query))
        ;; There are *four* emails, implicitly joinable via four different FKs: source reporter and assignee, and
        ;; joined reporter and assignee.
        emails     (->> (get by-name "EMAIL")
                        (m/index-by (juxt :fk-join-alias :fk-field-id)))
        sr-email   (get emails [nil (meta/id :gh/issues :reporter-id)])
        sa-email   (get emails [nil (meta/id :gh/issues :assignee-id)])
        jr-email   (get emails ["GH Issues" (meta/id :gh/issues :reporter-id)])
        ja-email   (get emails ["GH Issues" (meta/id :gh/issues :assignee-id)])
        base-email (lib.metadata/field meta/metadata-provider (meta/id :gh/users :email))
        fk-col     (fn [column-name fk-pred]
                     (->> (get by-name column-name)
                          (m/find-first fk-pred)))]
    (testing "explicit self-join allows implicit joins via all duplicated FKs"
      (is (= 4 (count (filter some? [sr-email sa-email jr-email ja-email]))))
      (is (= 4 (count (into #{} [sr-email sa-email jr-email ja-email]))))

      (doseq [[column-name email-col] [["REPORTER_ID" sr-email]
                                       ["ASSIGNEE_ID" sa-email]]]
        (testing (str "source " column-name " gets the correct ident")
          (is (= (:ident email-col)
                 (lib.metadata.ident/implicitly-joined-ident
                  (:ident base-email) (:ident (fk-col column-name (complement :source-alias))))))))

      (doseq [[column-name email-col] [["REPORTER_ID" jr-email]
                                       ["ASSIGNEE_ID" ja-email]]]
        (testing (str "joined " column-name " gets the correct ident")
          (is (= (:ident email-col)
                 (lib.metadata.ident/implicitly-joined-ident
                  (:ident base-email)
                  (:ident (fk-col column-name :source-alias))))))))))

(deftest ^:parallel remapped-columns-test
  (testing "remapped columns appear after expressions but before joins"
    (let [mp (-> meta/metadata-provider
                 (lib.tu/remap-metadata-provider (meta/id :venues :category-id) (meta/id :categories :name)))
          query (-> (lib/query mp (meta/table-metadata :venues))
                    (lib/with-fields [(meta/field-metadata :venues :id)
                                      (meta/field-metadata :venues :category-id)])
                    (lib/expression "price10" (lib/* (meta/field-metadata :venues :price) 10))
                    (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                   [(lib/= (meta/field-metadata :venues :id)
                                                           (meta/field-metadata :orders :id))])
                                  (lib/with-join-fields [(meta/field-metadata :orders :subtotal)]))))
          join-ident (:ident (first (lib/joins query)))]
      (is (=? [{:name  "ID"
                :ident (meta/ident :venues :id)}
               {:name  "CATEGORY_ID"
                :ident (meta/ident :venues :category-id)}
               {:name  "price10"
                :ident (lib.options/ident (first (lib/expressions query)))}
               {:name  "SUBTOTAL"
                :ident (lib.metadata.ident/explicitly-joined-ident (meta/ident :orders :subtotal) join-ident)}]
              (lib/returned-columns query)))
      (is (=? [{:name  "ID"
                :ident (meta/ident :venues :id)}
               {:name  "CATEGORY_ID"
                :ident (meta/ident :venues :category-id)}
               {:name  "price10"
                :ident (lib.options/ident (first (lib/expressions query)))}
               {:name  "NAME"
                :ident (lib.metadata.ident/remap-ident (meta/ident :categories :name) (meta/ident :venues :category-id))}
               {:name  "SUBTOTAL"
                :ident (lib.metadata.ident/explicitly-joined-ident (meta/ident :orders :subtotal) join-ident)}]
              (lib/returned-columns query -1 (lib.util/query-stage query -1) {:include-remaps? true}))))))

(deftest ^:parallel remapped-columns-test-2-remapping-in-joins
  (testing "explicitly joined columns with remaps are added after their join"
    (let [mp         (-> meta/metadata-provider
                         (lib.tu/remap-metadata-provider (meta/id :venues :category-id) (meta/id :categories :name)))
          join1      (-> (lib/join-clause (meta/table-metadata :venues)
                                          [(lib/= (meta/field-metadata :orders :id)
                                                  (meta/field-metadata :venues :id))])
                         (lib/with-join-fields [(meta/field-metadata :venues :price)
                                                (meta/field-metadata :venues :category-id)]))
          join2      (-> (lib/join-clause (meta/table-metadata :products)
                                          [(lib/= (meta/field-metadata :orders :product-id)
                                                  (meta/field-metadata :products :id))])
                         (lib/with-join-fields [(meta/field-metadata :products :category)]))
          base       (-> (lib/query mp (meta/table-metadata :orders))
                         (lib/with-fields [(meta/field-metadata :orders :id)
                                           (meta/field-metadata :orders :product-id)
                                           (meta/field-metadata :orders :subtotal)]))
          exp-main   [{:name  "ID"
                       :ident (meta/ident :orders :id)}
                      {:name  "PRODUCT_ID"
                       :ident (meta/ident :orders :product-id)}
                      {:name  "SUBTOTAL"
                       :ident (meta/ident :orders :subtotal)}]
          exp-join1  [{:name  "PRICE"
                       :ident (lib.metadata.ident/explicitly-joined-ident (meta/ident :venues :price)
                                                                          (:ident join1))}
                      {:name  "CATEGORY_ID"
                       :ident (lib.metadata.ident/explicitly-joined-ident (meta/ident :venues :category-id)
                                                                          (:ident join1))}
                      {:name  "NAME"
                       :ident (lib.metadata.ident/remap-ident
                               (meta/ident :categories :name)
                               (lib.metadata.ident/explicitly-joined-ident
                                (meta/ident :venues :category-id) (:ident join1)))}]
          exp-join2  [{:name  "CATEGORY"
                       :ident (lib.metadata.ident/explicitly-joined-ident
                               (meta/ident :products :category) (:ident join2))}]
          cols       (fn [query]
                       (lib/returned-columns query -1 (lib.util/query-stage query -1) {:include-remaps? true}))]
      (is (=? (concat exp-main exp-join1 exp-join2)
              (-> base
                  (lib/join join1)
                  (lib/join join2)
                  cols)))
      (is (=? (concat exp-main exp-join2 exp-join1)
              (-> base
                  (lib/join join2)
                  (lib/join join1)
                  cols))))))
