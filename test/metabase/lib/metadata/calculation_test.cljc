(ns metabase.lib.metadata.calculation-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cache :as lib.metadata.cache]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
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
        (is (=? {:name              "Unknown Field"
                 :display-name      "join → Unknown Field" #_"Unknown Field" ; either answer can be considered correct I guess
                 :long-display-name "join → Unknown Field"}
                (lib/display-info query [:field {:join-alias "join"} field-id])))))))

(defn- visible-columns-with-desired-aliases
  "[[lib/visible-columns]] no longer includes `:lib/desired-column-alias` (which never really made sense because desired
  column alias is a function of the columns that are RETURNED) but since so many tests were written to look at it this
  function is around to make those tests continue to work without extensive rewrites."
  [query]
  (into []
        (lib.field.util/add-source-and-desired-aliases-xform query)
        (lib/visible-columns query)))

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
                    visible-columns-with-desired-aliases))))))

(deftest ^:parallel visible-columns-test-2
  (testing "nil has no visible columns (#31366)"
    (is (empty? (-> (lib.tu/venues-query)
                    (lib/visible-columns nil))))))

(deftest ^:parallel visible-columns-test-3
  (testing "Include multiple implicitly joinable columns pointing to the same table and field (##33451)"
    (is (= ["id"
            "created_by"
            "updated_by"
            "ic_accounts__via__created_by__id"
            "ic_accounts__via__created_by__name"
            "ic_accounts__via__updated_by__id"
            "ic_accounts__via__updated_by__name"]
           (->> (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
                visible-columns-with-desired-aliases
                (map :lib/desired-column-alias))))))

(deftest ^:parallel visible-columns-test-4
  (testing "multiple aggregations"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :quantity))))]
      (is (= [["Orders"   "ID"]
              ["Orders"   "User ID"]
              ["Orders"   "Product ID"]
              ["Orders"   "Subtotal"]
              ["Orders"   "Tax"]
              ["Orders"   "Total"]
              ["Orders"   "Discount"]
              ["Orders"   "Created At"]
              ["Orders"   "Quantity"]
              ["People"   "User → ID"]
              ["People"   "User → Address"]
              ["People"   "User → Email"]
              ["People"   "User → Password"]
              ["People"   "User → Name"]
              ["People"   "User → City"]
              ["People"   "User → Longitude"]
              ["People"   "User → State"]
              ["People"   "User → Source"]
              ["People"   "User → Birth Date"]
              ["People"   "User → Zip"]
              ["People"   "User → Latitude"]
              ["People"   "User → Created At"]
              ["Products" "Product → ID"]
              ["Products" "Product → Ean"]
              ["Products" "Product → Title"]
              ["Products" "Product → Category"]
              ["Products" "Product → Vendor"]
              ["Products" "Product → Price"]
              ["Products" "Product → Rating"]
              ["Products" "Product → Created At"]]
             (map #(-> (lib/display-info query -1 %)
                       ((juxt (comp :long-display-name :table) :long-display-name)))
                  (lib.metadata.calculation/visible-columns query)))))))

(deftest ^:parallel source-cards-test
  (testing "with :source-card"
    (let [query {:lib/type     :mbql/query
                 :lib/metadata (lib.tu/metadata-provider-with-mock-cards)
                 :database     (meta/id)
                 :stages       [{:lib/type :mbql.stage/mbql
                                 :source-card (:id (:orders (lib.tu/mock-cards)))}]}
          own-fields (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :orders))]
                       (-> field
                           (assoc :lib/source :source/card)))]
      (testing "implicitly joinable columns"
        (testing "are included by visible-columns"
          (is (=? (->> (concat own-fields
                               (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :people))]
                                 (assoc field
                                        :lib/source :source/implicitly-joinable))
                               (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :products))]
                                 (assoc field
                                        :lib/source :source/implicitly-joinable)))
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
              query      (lib/append-stage query)]
          (testing "are included by visible-columns"
            (is (=? (->> (concat own-fields
                                 (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :people))]
                                   (assoc field
                                          :lib/source :source/implicitly-joinable))
                                 (for [field (lib.metadata/fields (lib.tu/metadata-provider-with-mock-cards) (meta/id :products))]
                                   (assoc field
                                          :lib/source :source/implicitly-joinable)))
                         (sort-by (juxt :lib/source :name :id)))
                    (sort-by (juxt :lib/source :name :id) (lib.metadata.calculation/visible-columns query)))))
          (testing "are not included by returned-columns"
            (is (=? (sort-by (juxt :name :id) own-fields)
                    (sort-by (juxt :name :id) (lib.metadata.calculation/returned-columns query))))))))))

(defn- implicitly-joined [table-key]
  (->> (for [field-key (meta/fields table-key)]
         (-> (meta/field-metadata table-key field-key)
             (assoc :lib/source :source/implicitly-joinable)))
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
                       :lib/source :source/joins})]
    (testing "just own columns"
      (is (=? (concat orders-cols joined-cols)
              (lib/visible-columns query -1 (lib.util/query-stage query -1) {:include-implicitly-joinable? false}))))
    (testing "with implicit joins"
      (is (=? (concat orders-cols
                      joined-cols
                      ;; First set of implicit joins
                      (implicitly-joined :people)
                      (implicitly-joined :products)
                      ;; Second set of implicit joins
                      (implicitly-joined :people)
                      (implicitly-joined :products))
              (lib/visible-columns query -1 (lib.util/query-stage query -1)))))))

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

(deftest ^:parallel implicit-join-via-explicitly-joined-column-test
  (let [query                (-> (lib/query meta/metadata-provider (meta/table-metadata :reviews))
                                 (lib/join (lib/join-clause (meta/table-metadata :products)))
                                 (lib/join (lib/join-clause (meta/table-metadata :orders))))
        original             (lib.metadata/field meta/metadata-provider (meta/id :people :latitude))
        {latitude "LATITUDE"} (m/index-by :name (lib/visible-columns query))]
    (is (some? original))
    (is (some? latitude))))

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
        ja-email   (get emails ["GH Issues" (meta/id :gh/issues :assignee-id)])]
    (testing "explicit self-join allows implicit joins via all duplicated FKs"
      (is (= 4 (count (filter some? [sr-email sa-email jr-email ja-email]))))
      (is (= 4 (count (into #{} [sr-email sa-email jr-email ja-email])))))))

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
                                  (lib/with-join-fields [(meta/field-metadata :orders :subtotal)]))))]
      (is (=? [{:name  "ID"}
               {:name  "CATEGORY_ID"}
               {:name  "price10"}
               {:name  "SUBTOTAL"}]
              (lib/returned-columns query)))
      (is (=? [{:name  "ID"}
               {:name  "CATEGORY_ID"}
               {:name  "price10"}
               {:name  "NAME"}
               {:name  "SUBTOTAL"}]
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
          exp-main   [{:name  "ID"}
                      {:name  "PRODUCT_ID"}
                      {:name  "SUBTOTAL"}]
          exp-join1  [{:name  "PRICE"}
                      {:name  "CATEGORY_ID"}
                      {:name  "NAME"}]
          exp-join2  [{:name  "CATEGORY"}]
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

(deftest ^:parallel remapped-visible-columns-test
  (let [product-id  (meta/id :orders :product-id)
        mp          (-> meta/metadata-provider
                        (lib.tu/remap-metadata-provider product-id (meta/id :products :title)))
        base        (lib/query mp (meta/table-metadata :orders))
        ;; join1 explicitly joins the target of the remapping
        join1       (-> (lib/join-clause (meta/table-metadata :products)
                                         [(lib/= (meta/field-metadata :orders :product-id)
                                                 (meta/field-metadata :products :id))])
                        (lib/with-join-fields [(meta/field-metadata :products :title)]))
        ;; join2 explicitly joins the target of the remapping and one more field from the same table (products)
        join2       (-> (lib/join-clause (meta/table-metadata :products)
                                         [(lib/= (meta/field-metadata :orders :product-id)
                                                 (meta/field-metadata :products :id))])
                        (lib/with-join-fields [(meta/field-metadata :products :title)
                                               (meta/field-metadata :products :ean)]))
        join1-query (lib/join base join1)
        join2-query (lib/join base join2)
        card1-id    11001100
        card2-id    11001101
        card-mp     (-> mp
                        (lib.tu/metadata-provider-with-card-from-query card1-id join1-query)
                        (lib.tu/metadata-provider-with-card-from-query card2-id join2-query))
        card1-query (lib/query card-mp (lib.metadata/card card-mp card1-id))
        card2-query (lib/query card-mp (lib.metadata/card card-mp card2-id))
        cols        (fn cols
                      ([query]
                       (cols query {:include-remaps? true}))
                      ([query opts]
                       (lib/visible-columns query -1 (lib.util/query-stage query -1) opts)))
        orders-id   (meta/id :orders)
        products-id (meta/id :products)
        people-id   (meta/id :people)
        user-id     (meta/id :orders :user-id)
        table-fields
        [{:name "ID",         :lib/source :source/table-defaults, :table-id orders-id}
         {:name "USER_ID",    :lib/source :source/table-defaults, :table-id orders-id, :fk-target-field-id (meta/id :people :id)}
         {:name "PRODUCT_ID", :lib/source :source/table-defaults, :table-id orders-id, :fk-target-field-id (meta/id :products :id)}
         {:name "SUBTOTAL",   :lib/source :source/table-defaults, :table-id orders-id}
         {:name "TAX",        :lib/source :source/table-defaults, :table-id orders-id}
         {:name "TOTAL",      :lib/source :source/table-defaults, :table-id orders-id}
         {:name "DISCOUNT",   :lib/source :source/table-defaults, :table-id orders-id}
         {:name "CREATED_AT", :lib/source :source/table-defaults, :table-id orders-id}
         {:name "QUANTITY",   :lib/source :source/table-defaults, :table-id orders-id}
         {:name "TITLE",      :lib/source :source/table-defaults, :table-id products-id}]
        ;; the order of the fields is like this because the MP created by metadata-provider-with-card-from-query
        ;; sorts the fields in the result metadata by :id
        card2-fields
        [{:name "TITLE",      :lib/source :source/card, :table-id products-id}
         {:name "EAN",        :lib/source :source/card, :table-id products-id}
         {:name "ID",         :lib/source :source/card, :table-id orders-id}
         {:name "SUBTOTAL",   :lib/source :source/card, :table-id orders-id}
         {:name "TOTAL",      :lib/source :source/card, :table-id orders-id}
         {:name "TAX",        :lib/source :source/card, :table-id orders-id}
         {:name "DISCOUNT",   :lib/source :source/card, :table-id orders-id}
         {:name "QUANTITY",   :lib/source :source/card, :table-id orders-id}
         {:name "CREATED_AT", :lib/source :source/card, :table-id orders-id}
         {:name "PRODUCT_ID", :lib/source :source/card, :table-id orders-id, :fk-target-field-id (meta/id :products :id)}
         {:name "USER_ID",    :lib/source :source/card, :table-id orders-id, :fk-target-field-id (meta/id :people :id)}]
        ;; card1 has the same fields as card2, except EAN, which is not added by the join
        card1-fields
        (into [] (remove (comp #{"EAN"} :name)) card2-fields)
        people-fields
        [{:name "ID",         :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "ADDRESS",    :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "EMAIL",      :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "PASSWORD",   :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "NAME",       :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "CITY",       :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "LONGITUDE",  :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "STATE",      :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "SOURCE",     :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "BIRTH_DATE", :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "ZIP",        :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "LATITUDE",   :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}
         {:name "CREATED_AT", :lib/source :source/implicitly-joinable, :table-id people-id, :fk-field-id user-id}]
        ;; the fields of the product table can come from the explicit join...
        products-join-fields
        [{:name "ID",         :lib/source :source/joins, :table-id products-id}
         {:name "EAN",        :lib/source :source/joins, :table-id products-id}
         {:name "TITLE",      :lib/source :source/joins, :table-id products-id}
         {:name "CATEGORY",   :lib/source :source/joins, :table-id products-id}
         {:name "VENDOR",     :lib/source :source/joins, :table-id products-id}
         {:name "PRICE",      :lib/source :source/joins, :table-id products-id}
         {:name "RATING",     :lib/source :source/joins, :table-id products-id}
         {:name "CREATED_AT", :lib/source :source/joins, :table-id products-id}]
        ;; or they can come from an implicit join
        products-implicit-join-fields
        (mapv #(assoc %, :lib/source :source/implicitly-joinable, :fk-field-id product-id)
              products-join-fields)]
    (testing "base case: no joins"
      (is (=? (concat table-fields
                      people-fields
                      products-implicit-join-fields)
              (cols base))))
    (testing "joins don't exclude implicitly joinable fields for _visible_ columns"
      (let [expected-columns (concat table-fields
                                     products-join-fields
                                     people-fields)]
        (is (=? expected-columns
                (cols join1-query)))
        (is (=? expected-columns
                (cols join2-query)))))
    (testing (str "joins in cards (previous stages)\n"
                  "These tests demonstrate an unwanted difference in behavior.\n"
                  "If they break such that both cases produce the same result, that's an improvement"
                  " unless that single result cannot be considered correct")
      (testing "implicit fields are NOT excluded, if all the joined fields are remapping targets"
        (is (=? (concat card1-fields
                        products-implicit-join-fields
                        people-fields)
                (cols card1-query))))
      (testing "implicit fields are excluded, if NOT all the joined fields are remapping targets"
        (is (=? (concat card2-fields
                        people-fields)
                (cols card2-query)))))))

(defn- check-visible-columns
  "Check that calling [[lib/visible-columns]] on `query` produces the `expected-cols`.

  `expected-cols` should be a list of tuples of [:lib/desired-column-alias :lib/source] for the expected columns."
  [query expected-cols]
  (is (= expected-cols
         (map (juxt :lib/desired-column-alias :lib/source)
              (visible-columns-with-desired-aliases query)))))

(deftest ^:parallel visible-columns-orders+people-card-test
  (testing "single-card orders+people join (#34743)"
    (let [inner (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/join (meta/table-metadata :people)))
          mp    (lib.tu/metadata-provider-with-card-from-query 1 inner)
          query (lib/query mp (lib.metadata/card mp 1))]
      (check-visible-columns
       query
       [["ID" :source/card]
        ["SUBTOTAL" :source/card]
        ["TOTAL" :source/card]
        ["TAX" :source/card]
        ["DISCOUNT" :source/card]
        ["QUANTITY" :source/card]
        ["CREATED_AT" :source/card]
        ["PRODUCT_ID" :source/card]
        ["USER_ID" :source/card]
        ["People - User__ID" :source/card]
        ["People - User__STATE" :source/card]
        ["People - User__CITY" :source/card]
        ["People - User__ADDRESS" :source/card]
        ["People - User__NAME" :source/card]
        ["People - User__SOURCE" :source/card]
        ["People - User__ZIP" :source/card]
        ["People - User__LATITUDE" :source/card]
        ["People - User__PASSWORD" :source/card]
        ["People - User__BIRTH_DATE" :source/card]
        ["People - User__LONGITUDE" :source/card]
        ["People - User__EMAIL" :source/card]
        ["People - User__CREATED_AT" :source/card]
        ["PRODUCTS__via__PRODUCT_ID__ID" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__EAN" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__TITLE" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__CATEGORY" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__VENDOR" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__PRICE" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__RATING" :source/implicitly-joinable]
        ["PRODUCTS__via__PRODUCT_ID__CREATED_AT" :source/implicitly-joinable]]))))

(deftest ^:parallel visible-columns-checkins+users+venues-card-test
  (testing "multi-card checkins+users+venues join"
    ;; The idea is that these are all joins between cards and nested queries.
    (let [mp1 (lib.tu/metadata-provider-with-mock-cards)
          checkins-card (:checkins (lib.tu/mock-cards))
          users-card (:users (lib.tu/mock-cards))
          venues-card (:venues (lib.tu/mock-cards))
          checkins-card-query (lib/query mp1 checkins-card)
          users-card-query (lib/query mp1 users-card)
          venues-card-query (lib/query mp1 venues-card)
          checkins+users-card-query (-> checkins-card-query
                                        (lib/join (lib/join-clause
                                                   users-card
                                                   [(lib/=
                                                     (lib.tu/field-literal-ref checkins-card-query "USER_ID")
                                                     (lib/with-join-alias
                                                      (lib.tu/field-literal-ref users-card-query "ID")
                                                      "Users"))])))
          next-card-id (->> (lib.tu/mock-cards)
                            vals
                            (map :id)
                            (reduce max 0)
                            inc)
          mp2 (lib.tu/metadata-provider-with-card-from-query mp1 next-card-id checkins+users-card-query)
          checkins+users-card2-query (lib/query mp2 (lib.metadata/card mp2 next-card-id))
          checkins+users+venues-card-query (-> checkins+users-card2-query
                                               (lib/join (lib/join-clause
                                                          venues-card
                                                          [(lib/=
                                                            (lib.tu/field-literal-ref
                                                             checkins+users-card2-query
                                                             "VENUE_ID")
                                                            (lib/with-join-alias
                                                             (lib.tu/field-literal-ref venues-card-query "ID")
                                                             "Venues"))])))]
      (check-visible-columns
       checkins+users+venues-card-query
       [["ID" :source/card]
        ["DATE" :source/card]
        ["USER_ID" :source/card]
        ["VENUE_ID" :source/card]
        ["Mock users card - User__ID" :source/card]
        ["Mock users card - User__NAME" :source/card]
        ["Mock users card - User__LAST_LOGIN" :source/card]
        ["Mock users card - User__PASSWORD" :source/card]
        ["Mock venues card - Venue__ID" :source/joins]
        ["Mock venues card - Venue__NAME" :source/joins]
        ["Mock venues card - Venue__CATEGORY_ID" :source/joins]
        ["Mock venues card - Venue__LATITUDE" :source/joins]
        ["Mock venues card - Venue__LONGITUDE" :source/joins]
        ["Mock venues card - Venue__PRICE" :source/joins]
        ["CATEGORIES__via__CATEGORY_ID__via__Mock venues card_3ff5ce7b" :source/implicitly-joinable]
        ["CATEGORIES__via__CATEGORY_ID__via__Mock venues card_29b31c85" :source/implicitly-joinable]]))))

(deftest ^:parallel visible-columns-products+reviews-model-test
  (testing "model products+reviews join"
    (check-visible-columns
     (lib/query (lib.tu/metadata-provider-with-mock-cards)
                ((lib.tu/mock-cards) :model/products-and-reviews))
     [["ID" :source/card]
      ["EAN" :source/card]
      ["TITLE" :source/card]
      ["CATEGORY" :source/card]
      ["VENDOR" :source/card]
      ["PRICE" :source/card]
      ["RATING" :source/card]
      ["CREATED_AT" :source/card]
      ["Reviews__ID" :source/card]
      ["Reviews__PRODUCT_ID" :source/card]
      ["Reviews__REVIEWER" :source/card]
      ["Reviews__RATING" :source/card]
      ["Reviews__BODY" :source/card]
      ["Reviews__CREATED_AT" :source/card]])))

(deftest ^:parallel visible-columns-implicit-join-via-explicit-join-test
  (testing "query with implicitly-joinable columns via an explicit join"
    (check-visible-columns
     (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
         (lib/join (lib/join-clause
                    (meta/table-metadata :venues)
                    [(lib/=
                      (meta/field-metadata :checkins :venue-id)
                      (lib/with-join-alias (meta/field-metadata :venues :id) "Venues"))])))
     [["ID" :source/table-defaults]
      ["DATE" :source/table-defaults]
      ["USER_ID" :source/table-defaults]
      ["VENUE_ID" :source/table-defaults]
      ["Venues__ID" :source/joins]
      ["Venues__NAME" :source/joins]
      ["Venues__CATEGORY_ID" :source/joins]
      ["Venues__LATITUDE" :source/joins]
      ["Venues__LONGITUDE" :source/joins]
      ["Venues__PRICE" :source/joins]
      ["USERS__via__USER_ID__ID" :source/implicitly-joinable]
      ["USERS__via__USER_ID__NAME" :source/implicitly-joinable]
      ["USERS__via__USER_ID__LAST_LOGIN" :source/implicitly-joinable]
      ["CATEGORIES__via__CATEGORY_ID__via__Venues__ID" :source/implicitly-joinable]
      ["CATEGORIES__via__CATEGORY_ID__via__Venues__NAME" :source/implicitly-joinable]])))

(deftest ^:parallel visible-columns-no-join-test
  (testing "query with no join"
    (check-visible-columns
     (lib.tu/venues-query)
     [["ID" :source/table-defaults]
      ["NAME" :source/table-defaults]
      ["CATEGORY_ID" :source/table-defaults]
      ["LATITUDE" :source/table-defaults]
      ["LONGITUDE" :source/table-defaults]
      ["PRICE" :source/table-defaults]
      ["CATEGORIES__via__CATEGORY_ID__ID" :source/implicitly-joinable]
      ["CATEGORIES__via__CATEGORY_ID__NAME" :source/implicitly-joinable]])))

(deftest ^:parallel visible-columns-explicit-join-test
  (testing "query with an explicit join"
    ;; Note that CATEGORIES.ID and NAME are no longer implicitly joinable, being "shadowed" by the explicit join.
    (check-visible-columns
     (lib.tu/query-with-join)
     [["ID" :source/table-defaults]
      ["NAME" :source/table-defaults]
      ["CATEGORY_ID" :source/table-defaults]
      ["LATITUDE" :source/table-defaults]
      ["LONGITUDE" :source/table-defaults]
      ["PRICE" :source/table-defaults]
      ["Cat__ID" :source/joins]
      ["Cat__NAME" :source/joins]])))

(deftest ^:parallel visible-columns-mutliple-fks-test
  (testing "query with multiple FKs to different tables"
    (check-visible-columns
     (lib/query meta/metadata-provider (meta/table-metadata :checkins))
     [["ID" :source/table-defaults]
      ["DATE" :source/table-defaults]
      ["USER_ID" :source/table-defaults]
      ["VENUE_ID" :source/table-defaults]
      ["USERS__via__USER_ID__ID" :source/implicitly-joinable]
      ["USERS__via__USER_ID__NAME" :source/implicitly-joinable]
      ["USERS__via__USER_ID__LAST_LOGIN" :source/implicitly-joinable]
      ["VENUES__via__VENUE_ID__ID" :source/implicitly-joinable]
      ["VENUES__via__VENUE_ID__NAME" :source/implicitly-joinable]
      ["VENUES__via__VENUE_ID__CATEGORY_ID" :source/implicitly-joinable]
      ["VENUES__via__VENUE_ID__LATITUDE" :source/implicitly-joinable]
      ["VENUES__via__VENUE_ID__LONGITUDE" :source/implicitly-joinable]
      ["VENUES__via__VENUE_ID__PRICE" :source/implicitly-joinable]])))

(deftest ^:parallel visible-columns-mutliple-fks-same-table-test
  (testing "query with multiple FKs to same table"
    (check-visible-columns
     (lib/query meta/metadata-provider (meta/table-metadata :gh/issues))
     [["ID" :source/table-defaults]
      ["ASSIGNEE_ID" :source/table-defaults]
      ["REPORTER_ID" :source/table-defaults]
      ["IS_OPEN" :source/table-defaults]
      ["REPORTED_AT" :source/table-defaults]
      ["CLOSED_AT" :source/table-defaults]
      ["GH_USERS__via__ASSIGNEE_ID__ID" :source/implicitly-joinable]
      ["GH_USERS__via__ASSIGNEE_ID__BIRTHDAY" :source/implicitly-joinable]
      ["GH_USERS__via__ASSIGNEE_ID__EMAIL" :source/implicitly-joinable]
      ["GH_USERS__via__REPORTER_ID__ID" :source/implicitly-joinable]
      ["GH_USERS__via__REPORTER_ID__BIRTHDAY" :source/implicitly-joinable]
      ["GH_USERS__via__REPORTER_ID__EMAIL" :source/implicitly-joinable]])))

(deftest ^:parallel visible-columns-fk-to-self-test
  (testing "query with FK to self"
    ;; Implicit self-joins currently not supported. If you are implementing support for implicit self-joins, see also
    ;; the commented-out implicit-self-join-test, above.
    (check-visible-columns
     (lib/query meta/metadata-provider (meta/table-metadata :gh/comments))
     [["ID" :source/table-defaults]
      ["AUTHOR_ID" :source/table-defaults]
      ["POSTED_AT" :source/table-defaults]
      ["BODY_MARKDOWN" :source/table-defaults]
      ["REPLY_TO" :source/table-defaults]
      ["GH_USERS__via__AUTHOR_ID__ID" :source/implicitly-joinable]
      ["GH_USERS__via__AUTHOR_ID__BIRTHDAY" :source/implicitly-joinable]
      ["GH_USERS__via__AUTHOR_ID__EMAIL" :source/implicitly-joinable]])))

(deftest ^:parallel caching-test
  (let [query      (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                       (lib/join (meta/table-metadata :categories)))
        call-count (atom {:hits 0, :misses 0})]
    (doseq [f [#'lib/returned-columns
               #'lib/visible-columns]]
      (testing f
        (binding [lib.metadata.cache/*cache-hit-hook*  (fn [_v]
                                                         (swap! call-count update :hits inc))
                  lib.metadata.cache/*cache-miss-hook* (fn [_v]
                                                         (swap! call-count update :misses inc))]
          (is (seq (f query)))
          (let [num-misses (:misses @call-count)]
            (is (pos-int? num-misses)
                "The first call should result in some cache misses")
            (is (pos-int? (:hits @call-count))
                "The first call should result in some cache hits for recursive metadata calculation")
            (is (seq (f query)))
            (is (= num-misses
                   (:misses @call-count))
                "Another call should result in ZERO additional cache misses -- we should be returning the cached value")))))))

(deftest ^:parallel returned-columns-no-duplicates-test
  (testing "Don't return columns from a join twice (QUE-1607)"
    (let [mp    meta/metadata-provider
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query products
                   {:joins    [{:source-query {:source-table $$orders
                                               :breakout     [$orders.product-id]
                                               :aggregation  [[:sum $orders.quantity]]}
                                :alias        "Orders"
                                :condition    [:= $id &Orders.orders.product-id]
                                :fields       [[:field "sum" {:join-alias "Orders", :base-type :type/Integer}]]}]
                    :fields   [$title $category]
                    :order-by [[:asc $id]]}))
          cols  (lib/returned-columns query -1)]
      (is (= ["TITLE"
              "CATEGORY"
              "Orders__sum"]
             (mapv :lib/desired-column-alias cols)))
      (is (=? [[:field {} (meta/id :products :title)]
               [:field {} (meta/id :products :category)]
               [:field {:join-alias "Orders"} "sum"]]
              (mapv lib/ref cols)))
      (testing "update stage :fields to include the columns from the join already"
        (let [query' (assoc-in query [:stages 0 :fields] (mapv lib/ref cols))
              cols'  (lib/returned-columns query' -1)]
          (is (= ["TITLE"
                  "CATEGORY"
                  "Orders__sum"]
                 (mapv :lib/desired-column-alias cols')))
          (is (=? [[:field {} (meta/id :products :title)]
                   [:field {} (meta/id :products :category)]
                   [:field {:join-alias "Orders"} "sum"]]
                  (mapv lib/ref cols'))))))))

(deftest ^:parallel do-not-incorrectly-propagate-temporal-unit-in-returned-columns-test
  (testing "temporal unit should not be incorrectly propagated in returned-columns past the stage where the bucketing was done"
    (let [query (lib/query
                 meta/metadata-provider

                 (lib.tu.macros/mbql-query people
                   {:source-query {:source-table $$people
                                   :breakout     [!month.created-at]
                                   :aggregation  [[:count]]}
                    :joins        [{:source-query {:source-table $$people
                                                   :breakout     [!month.birth-date]
                                                   :aggregation  [[:count]]}
                                    :alias        "Q2"
                                    :condition    [:= !month.created-at !month.&Q2.birth-date]
                                    :fields       [[:field (meta/id :people :birth-date) {:join-alias "Q2"}]
                                                   [:field "count" {:base-type :type/Integer, :join-alias "Q2"}]]}]}))]
      (is (= [{:lib/desired-column-alias "CREATED_AT"
               :inherited-temporal-unit  :month}
              {:lib/desired-column-alias "count"}
              {:lib/desired-column-alias "Q2__BIRTH_DATE"
               :inherited-temporal-unit  :month}
              {:lib/desired-column-alias "Q2__count"}]
             (map #(select-keys % [:lib/desired-column-alias :metabase.lib.field/temporal-unit :inherited-temporal-unit])
                  (lib/returned-columns query)))))))

(deftest ^:parallel returned-columns-no-duplicates-test-2
  (testing "Don't return columns from a join twice (QUE-1607)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query people
                   {:source-query {:source-table $$people
                                   :breakout     [!month.created-at]
                                   :aggregation  [[:count]]}
                    :joins        [{:source-query {:source-table $$people
                                                   :breakout     [!month.birth-date]
                                                   :aggregation  [[:count]]}
                                    :alias        "Q2"
                                    :condition    [:= !month.created-at !month.&Q2.birth-date]
                                    :fields       [[:field (meta/id :people :birth-date) {:join-alias "Q2"}]
                                                   [:field "count" {:base-type :type/Integer, :join-alias "Q2"}]]}]
                    :fields       [[:field (meta/id :people :created-at) {:inherited-temporal-unit :month}]
                                   [:field "count" {:base-type :type/Integer}]
                                   [:field (meta/id :people :birth-date) {:join-alias "Q2"}]
                                   [:field "count" {:base-type :type/Integer, :join-alias "Q2"}]]
                    :order-by     [[:asc !month.created-at]]}))
          cols (lib/returned-columns query)]
      (is (= ["CREATED_AT"
              "count"
              "Q2__BIRTH_DATE"
              "Q2__count"]
             (mapv :lib/desired-column-alias cols))))))
