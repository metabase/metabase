(ns metabase.query-processor-test.field-ref-repro-test
  "Reproduction tests for field ref(erence) issues. These are negative tests, if some fail,
  we might have actually fixed a bug."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel native-query-model-remapped-column-join-test
  (testing "Should be able to join on remapped model column (#58314)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-data (-> {:dataset_query {:native   {:query "SELECT 1 AS _ID"}
                                           :database (mt/id)
                                           :type     :native}
                           :type :model}
                          mt/card-with-metadata
                          (update :result_metadata vec)
                          (update-in [:result_metadata 0]
                                     merge
                                     ;; simulate the FE setting the redirection metadata
                                     (-> (lib.metadata/field mp (mt/id :orders :id))
                                         (select-keys [:description :display-name
                                                       :id :semantic-type])
                                         (set/rename-keys {:display-name :display_name
                                                           :semantic-type :semantic_type}))))]
        (mt/with-temp [:model/Card card card-data]
          (let [card-meta (lib.metadata/card mp (:id card))
                base (lib/query mp card-meta)
                lhs (first (lib/join-condition-lhs-columns base card-meta nil nil))
                rhs (first (lib/join-condition-rhs-columns base card-meta nil nil))
                query (lib/join base (-> (lib/join-clause card-meta [(lib/= lhs (lib/with-join-alias rhs "j"))])
                                         (lib/with-join-fields :all)
                                         (lib/with-join-alias "j")))]
            (mt/with-native-query-testing-context query
              ;; should return a single row with two columns, but fails instead
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Column \"j\.ID\" not found"
                                    (mt/rows+column-names
                                     (qp/process-query query)))))))))))

(deftest ^:parallel long-column-name-in-card-test
  (testing "Should be able to handle long column names in saved questions (#35252)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-data (-> {:dataset_query {:native   {:query "SELECT ID AS \"ID\", CATEGORY as \"This is a very very long column title that makes my saved question break when I want to use it elsewhere\" FROM PRODUCTS"}
                                           :database (mt/id)
                                           :type     :native}}
                          mt/card-with-metadata)]
        (mt/with-temp [:model/Card card card-data]
          (let [card-meta (lib.metadata/card mp (:id card))
                base (lib/query mp card-meta)
                long-name-col (second (lib/filterable-columns base))
                query (lib/filter base (lib/contains long-name-col "a"))]
            (mt/with-native-query-testing-context query
              ;; should return 53 rows with two columns, but fails instead
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Column \".*very very long column title.*\" not found"
                                    (mt/rows+column-names
                                     (qp/process-query query)))))))))))

;; other than producing the metadata for the card, there is no  query processing here
(deftest ^:parallel duplicate-names-selection-test
  (testing "Should be able to distinguish columns with the same name from a card with self join (#27521)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-data (-> {:dataset_query (mt/mbql-query orders
                                            {:joins [{:source-table $$orders
                                                      :alias "o"
                                                      :fields [&o.orders.id]
                                                      :condition [:= $id &o.orders.id]}]
                                             :fields [$id]})
                           :name "Q1"}
                          mt/card-with-metadata)]
        (mt/with-temp [:model/Card card card-data]
          (let [card-meta (lib.metadata/card mp (:id card))
                id-col    (m/find-first (comp #{"ID"} :name)
                                        (lib/returned-columns (lib/query mp card-meta)))
                query     (-> (lib/query mp (lib.metadata/table mp (mt/id :reviews)))
                              (lib/join (lib/join-clause card-meta
                                                         [(lib/= (lib.metadata/field mp (mt/id :reviews :id))
                                                                 id-col)])))
                stage     (lib.util/query-stage query -1)
                visible   (lib.metadata.calculation/visible-columns query -1 stage)
                returned  (lib.metadata.calculation/returned-columns query -1 stage)
                marked    (lib.equality/mark-selected-columns query -1 visible returned)]
            (is (=? [{:name "ID",         :display-name "ID"}
                     {:name "PRODUCT_ID", :display-name "Product ID"}
                     {:name "REVIEWER",   :display-name "Reviewer"}
                     {:name "RATING",     :display-name "Rating"}
                     {:name "BODY",       :display-name "Body"}
                     {:name "CREATED_AT", :display-name "Created At"}
                     {:name "ID",         :display-name "Q1 → ID"}
                     {:name "ID_2",       :display-name "Q1 → ID"}
                     {:name "ID",         :display-name "ID"}
                     {:name "EAN",        :display-name "Ean"}
                     {:name "TITLE",      :display-name "Title"}
                     {:name "CATEGORY",   :display-name "Category"}
                     {:name "VENDOR",     :display-name "Vendor"}
                     {:name "PRICE",      :display-name "Price"}
                     {:name "RATING",     :display-name "Rating"}
                     {:name "CREATED_AT", :display-name "Created At"}]
                    visible))
            (is (=? [{:name "ID",         :display-name "ID"}
                     {:name "PRODUCT_ID", :display-name "Product ID"}
                     {:name "REVIEWER",   :display-name "Reviewer"}
                     {:name "RATING",     :display-name "Rating"}
                     {:name "BODY",       :display-name "Body"}
                     {:name "CREATED_AT", :display-name "Created At"}
                     {:name "ID_2",       :display-name "Q1 → ID"}
                     {:name "ID_2_2",     :display-name "Q1 → ID"}]
                    returned))
            (is (=? [{:name "ID", :display-name "ID", :selected? true}
                     {:name "PRODUCT_ID", :display-name "Product ID", :selected? true}
                     {:name "REVIEWER", :display-name "Reviewer", :selected? true}
                     {:name "RATING", :display-name "Rating", :selected? true}
                     {:name "BODY", :display-name "Body", :selected? true}
                     {:name "CREATED_AT", :display-name "Created At", :selected? true}
                     ;; the following two Q1 → ID should have :selected? true
                     {:name "ID", :display-name "Q1 → ID", :selected? false}
                     {:name "ID_2", :display-name "Q1 → ID", :selected? false}
                     ;; these are implicitly joinable fields, :selected? false is right
                     {:name "ID", :display-name "ID", :selected? false}
                     {:name "EAN", :display-name "Ean", :selected? false}
                     {:name "TITLE", :display-name "Title", :selected? false}
                     {:name "CATEGORY", :display-name "Category", :selected? false}
                     {:name "VENDOR", :display-name "Vendor", :selected? false}
                     {:name "PRICE", :display-name "Price", :selected? false}
                     {:name "RATING", :display-name "Rating", :selected? false}
                     {:name "CREATED_AT", :display-name "Created At", :selected? false}]
                    marked))))))))

;; other than producing the metadata for the card, there is no  query processing here
(deftest ^:parallel multiple-breakouts-of-a-field-selection-test
  (testing "Should be able to distinguish columns from multiple breakouts of a field from a card (#47734)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-data (-> {:dataset_query (mt/mbql-query orders
                                            {:aggregation [[:count]]
                                             :breakout    [!month.created_at !year.created_at]})
                           :name "Q1"}
                          mt/card-with-metadata)]
        (mt/with-temp [:model/Card card card-data]
          (let [card-meta (lib.metadata/card mp (:id card))
                count-col (m/find-first (comp #{"count"} :name)
                                        (lib/returned-columns (lib/query mp card-meta)))
                query     (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/join (lib/join-clause card-meta
                                                         [(lib/= (lib.metadata/field mp (mt/id :orders :id))
                                                                 count-col)])))
                stage     (lib.util/query-stage query -1)
                visible   (lib.metadata.calculation/visible-columns query -1 stage)
                returned  (lib.metadata.calculation/returned-columns query -1 stage)
                marked    (lib.equality/mark-selected-columns query -1 visible returned)]
            (is (=? [{:name "ID", :display-name "ID"}
                     {:name "USER_ID", :display-name "User ID"}
                     {:name "PRODUCT_ID", :display-name "Product ID"}
                     {:name "SUBTOTAL", :display-name "Subtotal"}
                     {:name "TAX", :display-name "Tax"}
                     {:name "TOTAL", :display-name "Total"}
                     {:name "DISCOUNT", :display-name "Discount"}
                     {:name "CREATED_AT", :display-name "Created At"}
                     {:name "QUANTITY", :display-name "Quantity"}
                     {:name "CREATED_AT", :display-name "Q1 → Created At: Month"}
                     {:name "CREATED_AT_2", :display-name "Q1 → Created At: Year"}
                     {:name "count", :display-name "Q1 → Count"}
                     {:name "ID", :display-name "ID"}
                     {:name "ADDRESS", :display-name "Address"}
                     {:name "EMAIL", :display-name "Email"}
                     {:name "PASSWORD", :display-name "Password"}
                     {:name "NAME", :display-name "Name"}
                     {:name "CITY", :display-name "City"}
                     {:name "LONGITUDE", :display-name "Longitude"}
                     {:name "STATE", :display-name "State"}
                     {:name "SOURCE", :display-name "Source"}
                     {:name "BIRTH_DATE", :display-name "Birth Date"}
                     {:name "ZIP", :display-name "Zip"}
                     {:name "LATITUDE", :display-name "Latitude"}
                     {:name "CREATED_AT", :display-name "Created At"}
                     {:name "ID", :display-name "ID"}
                     {:name "EAN", :display-name "Ean"}
                     {:name "TITLE", :display-name "Title"}
                     {:name "CATEGORY", :display-name "Category"}
                     {:name "VENDOR", :display-name "Vendor"}
                     {:name "PRICE", :display-name "Price"}
                     {:name "RATING", :display-name "Rating"}
                     {:name "CREATED_AT", :display-name "Created At"}]
                    visible))
            (is (=? [{:name "ID", :display-name "ID"}
                     {:name "USER_ID", :display-name "User ID"}
                     {:name "PRODUCT_ID", :display-name "Product ID"}
                     {:name "SUBTOTAL", :display-name "Subtotal"}
                     {:name "TAX", :display-name "Tax"}
                     {:name "TOTAL", :display-name "Total"}
                     {:name "DISCOUNT", :display-name "Discount"}
                     {:name "CREATED_AT", :display-name "Created At"}
                     {:name "QUANTITY", :display-name "Quantity"}
                     {:name "CREATED_AT_2", :display-name "Q1 → Created At: Month"}
                     {:name "CREATED_AT_2_2", :display-name "Q1 → Created At: Year"}
                     {:name "count", :display-name "Q1 → Count"}]
                    returned))
            (is (=? [{:name "ID", :display-name "ID", :selected? true}
                     {:name "USER_ID", :display-name "User ID", :selected? true}
                     {:name "PRODUCT_ID", :display-name "Product ID", :selected? true}
                     {:name "SUBTOTAL", :display-name "Subtotal", :selected? true}
                     {:name "TAX", :display-name "Tax", :selected? true}
                     {:name "TOTAL", :display-name "Total", :selected? true}
                     {:name "DISCOUNT", :display-name "Discount", :selected? true}
                     {:name "CREATED_AT", :display-name "Created At", :selected? true}
                     {:name "QUANTITY", :display-name "Quantity", :selected? true}
                     ;; the following two Q1 → Created At: ... fields should have :selected? true
                     {:name "CREATED_AT", :display-name "Q1 → Created At: Month", :selected? false}
                     {:name "CREATED_AT_2", :display-name "Q1 → Created At: Year", :selected? false}
                     {:name "count", :display-name "Q1 → Count", :selected? true}
                     ;; these are implicitly joinable fields, :selected? false is right
                     {:name "ID", :display-name "ID", :selected? false}
                     {:name "ADDRESS", :display-name "Address", :selected? false}
                     {:name "EMAIL", :display-name "Email", :selected? false}
                     {:name "PASSWORD", :display-name "Password", :selected? false}
                     {:name "NAME", :display-name "Name", :selected? false}
                     {:name "CITY", :display-name "City", :selected? false}
                     {:name "LONGITUDE", :display-name "Longitude", :selected? false}
                     {:name "STATE", :display-name "State", :selected? false}
                     {:name "SOURCE", :display-name "Source", :selected? false}
                     {:name "BIRTH_DATE", :display-name "Birth Date", :selected? false}
                     {:name "ZIP", :display-name "Zip", :selected? false}
                     {:name "LATITUDE", :display-name "Latitude", :selected? false}
                     {:name "CREATED_AT", :display-name "Created At", :selected? false}
                     {:name "ID", :display-name "ID", :selected? false}
                     {:name "EAN", :display-name "Ean", :selected? false}
                     {:name "TITLE", :display-name "Title", :selected? false}
                     {:name "CATEGORY", :display-name "Category", :selected? false}
                     {:name "VENDOR", :display-name "Vendor", :selected? false}
                     {:name "PRICE", :display-name "Price", :selected? false}
                     {:name "RATING", :display-name "Rating", :selected? false}
                     {:name "CREATED_AT", :display-name "Created At", :selected? false}]
                    marked))))))))

(deftest ^:parallel breakout-on-nested-join-test
  (testing "Should handle breakout on nested join column (#59918)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
        (mt/with-temp [:model/Card q1 {:dataset_query (mt/mbql-query orders
                                                        {:joins [{:source-table $$products
                                                                  :alias "p"
                                                                  :condition [:= $product_id &p.products.id]
                                                                  :fields :all}]})
                                       :name "Q1"}
                       :model/Card q2 {:dataset_query (mt/mbql-query people
                                                        {:joins [{:source-table (str "card__" (:id q1))
                                                                  :alias "j"
                                                                  :condition
                                                                  [:= $id [:field "USER_ID" {:base-type :type/Integer
                                                                                             :join-alias "j"}]]
                                                                  :fields :all}]})}]
          (let [card-meta (lib.metadata/card mp (:id q2))
                cat-col   (m/find-first (comp #{"CATEGORY"} :name)
                                        (lib/returned-columns (lib/query mp card-meta)))
                query     (-> (lib/query mp card-meta)
                              (lib/aggregate (lib/count))
                              (lib/breakout cat-col))]
            ;; should return a row with category and count
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Column .*CATEGORY.* not found"
                                  (qp/process-query query)))))))))

(deftest ^:parallel self-join-in-card-test
  (testing "Should handle self joins in cards (#44767)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
        (mt/with-temp [:model/Card q1 {:dataset_query (mt/mbql-query orders
                                                        {:joins [{:source-table $$orders
                                                                  :alias "j"
                                                                  :condition [:= $id &j.orders.id]
                                                                  :fields :all}]})
                                       :name "Q1"}]
          (let [card-meta (lib.metadata/card mp (:id q1))
                query     (lib/query mp card-meta)
                stage     (lib.util/query-stage query -1)
                visible   (lib.metadata.calculation/visible-columns query -1 stage)
                returned  (lib.metadata.calculation/returned-columns query -1 stage)
                marked    (lib.equality/mark-selected-columns query -1 visible returned)]
            (is (=? [{:name "ID",           :display-name "ID",              :selected? true}
                     {:name "USER_ID",      :display-name "User ID",         :selected? true}
                     {:name "PRODUCT_ID",   :display-name "Product ID",      :selected? true}
                     {:name "SUBTOTAL",     :display-name "Subtotal",        :selected? true}
                     {:name "TAX",          :display-name "Tax",             :selected? true}
                     {:name "TOTAL",        :display-name "Total",           :selected? true}
                     {:name "DISCOUNT",     :display-name "Discount",        :selected? true}
                     {:name "CREATED_AT",   :display-name "Created At",      :selected? true}
                     {:name "QUANTITY",     :display-name "Quantity",        :selected? true}
                     {:name "ID_2",         :display-name "j → ID",          :selected? true}
                     {:name "USER_ID_2",    :display-name "j → User ID",     :selected? true}
                     {:name "PRODUCT_ID_2", :display-name "j → Product ID",  :selected? true}
                     {:name "SUBTOTAL_2",   :display-name "j → Subtotal",    :selected? true}
                     {:name "TAX_2",        :display-name "j → Tax",         :selected? true}
                     {:name "TOTAL_2",      :display-name "j → Total",       :selected? true}
                     {:name "DISCOUNT_2",   :display-name "j → Discount",    :selected? true}
                     {:name "CREATED_AT_2", :display-name "j → Created At",  :selected? true}
                     {:name "QUANTITY_2",   :display-name "j → Quantity",    :selected? true}
                     ;; implicitly joinable fields from both Orders not selected
                     {:name "ID",           :display-name "ID",              :selected? false}
                     {:name "ADDRESS",      :display-name "Address",         :selected? false}
                     {:name "EMAIL",        :display-name "Email",           :selected? false}
                     {:name "PASSWORD",     :display-name "Password",        :selected? false}
                     {:name "NAME",         :display-name "Name",            :selected? false}
                     {:name "CITY",         :display-name "City",            :selected? false}
                     {:name "LONGITUDE",    :display-name "Longitude",       :selected? false}
                     {:name "STATE",        :display-name "State",           :selected? false}
                     {:name "SOURCE",       :display-name "Source",          :selected? false}
                     {:name "BIRTH_DATE",   :display-name "Birth Date",      :selected? false}
                     {:name "ZIP",          :display-name "Zip",             :selected? false}
                     {:name "LATITUDE",     :display-name "Latitude",        :selected? false}
                     {:name "CREATED_AT",   :display-name "Created At",      :selected? false}
                     {:name "ID",           :display-name "ID",              :selected? false}
                     {:name "EAN",          :display-name "Ean",             :selected? false}
                     {:name "TITLE",        :display-name "Title",           :selected? false}
                     {:name "CATEGORY",     :display-name "Category",        :selected? false}
                     {:name "VENDOR",       :display-name "Vendor",          :selected? false}
                     {:name "PRICE",        :display-name "Price",           :selected? false}
                     {:name "RATING",       :display-name "Rating",          :selected? false}
                     {:name "CREATED_AT",   :display-name "Created At",      :selected? false}
                     {:name "ID",           :display-name "ID",              :selected? false}
                     {:name "ADDRESS",      :display-name "Address",         :selected? false}
                     {:name "EMAIL",        :display-name "Email",           :selected? false}
                     {:name "PASSWORD",     :display-name "Password",        :selected? false}
                     {:name "NAME",         :display-name "Name",            :selected? false}
                     {:name "CITY",         :display-name "City",            :selected? false}
                     {:name "LONGITUDE",    :display-name "Longitude",       :selected? false}
                     {:name "STATE",        :display-name "State",           :selected? false}
                     {:name "SOURCE",       :display-name "Source",          :selected? false}
                     {:name "BIRTH_DATE",   :display-name "Birth Date",      :selected? false}
                     {:name "ZIP",          :display-name "Zip",             :selected? false}
                     {:name "LATITUDE",     :display-name "Latitude",        :selected? false}
                     {:name "CREATED_AT",   :display-name "Created At",      :selected? false}
                     {:name "ID",           :display-name "ID",              :selected? false}
                     {:name "EAN",          :display-name "Ean",             :selected? false}
                     {:name "TITLE",        :display-name "Title",           :selected? false}
                     {:name "CATEGORY",     :display-name "Category",        :selected? false}
                     {:name "VENDOR",       :display-name "Vendor",          :selected? false}
                     {:name "PRICE",        :display-name "Price",           :selected? false}
                     {:name "RATING",       :display-name "Rating",          :selected? false}
                     {:name "CREATED_AT",   :display-name "Created At",      :selected? false}]
                    marked))))))))

(deftest stale-unsed-field-referenced-test
  (testing "Should handle missing unused field (#60498)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
        (mt/with-temp [:model/Card m1 (-> {:dataset_query (mt/mbql-query orders)
                                           :name "M1"
                                           :type :model}
                                          mt/card-with-metadata)
                       :model/Card m2 (-> {:dataset_query (mt/mbql-query nil
                                                            {:source-table (str "card__" (:id m1))})
                                           :name "M2"
                                           :type :model}
                                          mt/card-with-metadata)
                       :model/Card m3 (-> {:dataset_query (mt/mbql-query nil
                                                            {:source-table (str "card__" (:id m2))})
                                           :name "M3"
                                           :type :model}
                                          mt/card-with-metadata)
                       :model/Card m4 (-> {:dataset_query (mt/mbql-query nil
                                                            {:source-table (str "card__" (:id m3))
                                                             :aggregation [[:count]]
                                                             :breakout    [*QUANTITY/Integer]})
                                           :name "M4"
                                           :type :model}
                                          mt/card-with-metadata)]
          (t2/update! :model/Card (:id m1) {:result_metadata
                                            (remove (comp #{"TAX"} :name)
                                                    (t2/select-one-fn :result_metadata :model/Card (:id m1)))})
          (let [card-meta (lib.metadata/card mp (:id m4))
                query     (lib/query mp card-meta)]
            (mt/with-native-query-testing-context query
              ;; should get columns QUANTITY and count and 77 rows
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Column .*TAX.* not found"
                                    (qp/process-query query))))))))))

(deftest self-join-with-external-remapping-test
  (testing "Should handle self joins with external remapping (#60444)"
    (mt/with-driver :h2
      (mt/with-temp [:model/Dimension _ {:field_id (mt/id :orders :user_id)
                                         :name "User ID"
                                         :type :external
                                         :human_readable_field_id (mt/id :people :email)}]
        (let [query (mt/mbql-query orders
                      {:joins [{:source-table $$orders
                                :alias "j"
                                :condition
                                [:= $id &j.orders.product_id]
                                :fields :all}]})]
          ;; should return 20 columns and 37320 rows
          (mt/with-native-query-testing-context query
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"column number mismatch"
                                  (-> query qp/process-query mt/rows count)))))))))

(deftest multi-stage-with-external-remapping-test
  (testing "Should handle multiple stages with external remapping (#60587)"
    (mt/with-driver :h2
      (mt/with-temp [:model/Dimension _ {:field_id (mt/id :orders :user_id)
                                         :name "User ID"
                                         :type :external
                                         :human_readable_field_id (mt/id :people :email)}]
        (let [mp    (lib.metadata.jvm/application-database-metadata-provider (mt/id))
              query (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
                      (lib/breakout $ (lib.metadata/field mp (mt/id :orders :user_id)))
                      (lib/append-stage $)
                      (lib/expression $ "user" (first (lib/returned-columns $)))
                      (lib/aggregate $ (lib/distinct (m/find-first (comp #{"user"} :name)
                                                                   (lib/visible-columns $)))))]
          ;; should return {:rows [[1746]], :columns ("count")}
          (mt/with-native-query-testing-context query
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Breakouts must be distinct"
                                  (-> query qp/process-query mt/rows+column-names)))))))))

(deftest model-with-implicit-join-and-external-remapping-test
  (testing "Should handle models with implicit join on externally remapped field (#57596)"
    (mt/with-driver :h2
      (mt/with-temp [:model/Dimension _ {:field_id (mt/id :orders :user_id)
                                         :name "User ID"
                                         :type :external
                                         :human_readable_field_id (mt/id :people :email)}
                     :model/Card {model-id :id} {:dataset_query (mt/mbql-query orders)
                                                 :name "M"
                                                 :type :model}
                     :model/Card {card-id :id} {:dataset_query (mt/mbql-query nil
                                                                 {:source-table (str "card__" model-id)})
                                                :name "C"}]
        (let [query (-> (mt/mbql-query nil
                          {:source-table (str "card__" card-id)})
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
          ;; should return 613 rows
          (mt/with-native-query-testing-context query
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Column .*STATE.* not found"
                                  (-> query qp/process-query mt/rows count)))))))))
