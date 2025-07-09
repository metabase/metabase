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
   [metabase.test :as mt]))

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
