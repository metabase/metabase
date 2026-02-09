(ns ^:mb/driver-tests metabase.transforms-inspector.context-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms-inspector.context :as context]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Private fn access --------------------------------------------------

(def ^:private normalize-column-name   @#'context/normalize-column-name)
(def ^:private parse-joined-column-name @#'context/parse-joined-column-name)
(def ^:private match-columns-by-name    @#'context/match-columns-by-name)

;;; -------------------------------------------------- normalize-column-name --------------------------------------------------

(deftest ^:parallel normalize-column-name-test
  (testing "lowercases"
    (is (= "userid" (normalize-column-name "UserId")))
    (is (= "total" (normalize-column-name "TOTAL"))))
  (testing "strips underscores and hyphens"
    (is (= "userid" (normalize-column-name "user_id")))
    (is (= "userid" (normalize-column-name "user-id")))
    (is (= "userid" (normalize-column-name "User_Id")))
    (is (= "userid" (normalize-column-name "USER-ID"))))
  (testing "nil returns nil"
    (is (nil? (normalize-column-name nil)))))

;;; -------------------------------------------------- parse-joined-column-name --------------------------------------------------

(deftest ^:parallel parse-joined-column-name-test
  (testing "parses Alias__field pattern"
    (is (= {:alias "Products" :field-name "price"}
           (parse-joined-column-name "Products__price")))
    (is (= {:alias "Users" :field-name "created_at"}
           (parse-joined-column-name "Users__created_at"))))
  (testing "parses multi-word alias"
    (is (= {:alias "My_Table" :field-name "col"}
           (parse-joined-column-name "My_Table__col"))))
  (testing "returns nil for non-joined names"
    (is (nil? (parse-joined-column-name "price")))
    (is (nil? (parse-joined-column-name "products_price")))
    (is (nil? (parse-joined-column-name nil)))))

;;; -------------------------------------------------- match-columns-by-name --------------------------------------------------

(deftest ^:parallel match-columns-by-name-basic-test
  (let [sources [{:table_id 1 :table_name "orders"
                  :fields [{:name "id" :id 10} {:name "total" :id 11} {:name "product_id" :id 12}]}
                 {:table_id 2 :table_name "products"
                  :fields [{:name "id" :id 20} {:name "price" :id 21} {:name "category" :id 22}]}]
        join-structure [{:alias "Products" :source-table 2}]]
    (testing "matches joined column by Alias__field pattern"
      (let [target {:table_id 3 :table_name "result"
                    :fields [{:name "Products__price" :id 30}]}
            matches (seq (match-columns-by-name sources target join-structure))]
        (is (some? matches))
        (let [m (first matches)]
          (is (= "Products__price" (:output-column m)))
          (is (= 2 (:source-table-id (first (:input-columns m))))))))
    (testing "matches plain column by name"
      (let [target {:table_id 3 :table_name "result"
                    :fields [{:name "total" :id 31}]}
            matches (seq (match-columns-by-name sources target join-structure))]
        (is (some? matches))
        (is (= "total" (:output-column (first matches))))
        (is (= 1 (:source-table-id (first (:input-columns (first matches))))))))
    (testing "no match for unrecognized columns"
      (let [target {:table_id 3 :table_name "result"
                    :fields [{:name "xyz_unknown" :id 40}]}]
        (is (empty? (match-columns-by-name sources target join-structure)))))))

(deftest ^:parallel match-columns-by-name-case-insensitive-test
  (let [sources [{:table_id 1 :table_name "t1"
                  :fields [{:name "USER_ID" :id 10}]}]
        join-structure []]
    (testing "matches case-insensitively (ignoring underscores/hyphens)"
      (let [target {:table_id 2 :table_name "t2"
                    :fields [{:name "user-id" :id 20}]}
            matches (seq (match-columns-by-name sources target join-structure))]
        (is (some? matches))
        (is (= "user-id" (:output-column (first matches))))))))

(deftest ^:parallel match-columns-by-name-multiple-sources-test
  (let [sources [{:table_id 1 :table_name "orders"
                  :fields [{:name "total" :id 10}]}
                 {:table_id 2 :table_name "products"
                  :fields [{:name "total" :id 20}]}]
        join-structure []]
    (testing "when same column name exists in multiple sources, both appear as input-columns"
      (let [target {:table_id 3 :table_name "result"
                    :fields [{:name "total" :id 30}]}
            matches (seq (match-columns-by-name sources target join-structure))
            m (first matches)]
        (is (some? m))
        (is (= 2 (count (:input-columns m))))))))

;;; -------------------------------------------------- build-context integration --------------------------------------------------

(defn- simple-orders-query
  "Build a simple query against the orders table."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- joined-orders-products-query
  "Build a LEFT JOIN query between orders and products."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :products))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                               (-> (lib.metadata/field mp (mt/id :products :id))
                                   (lib/with-join-alias "Products")))])
                      (lib/with-join-alias "Products")
                      (lib/with-join-fields :all))))))

(deftest build-context-mbql-sources-test
  (testing "build-context extracts source tables from MBQL query"
    (let [transform {:source {:type :query
                              :query (simple-orders-query)}
                     :target {:schema "nonexistent" :name "nonexistent_table" :type :table}
                     :name   "test"}
          ctx (context/build-context transform)]
      (is (= :mbql (:source-type ctx)))
      (is (seq (:sources ctx)))
      (is (= (mt/id :orders) (:table_id (first (:sources ctx)))))
      (testing "source fields are populated"
        (is (seq (:fields (first (:sources ctx)))))))))

(deftest build-context-not-run-test
  (testing "build-context returns nil target when target table doesn't exist"
    (let [transform {:source {:type :query
                              :query (simple-orders-query)}
                     :target {:schema "nonexistent" :name "nonexistent_table" :type :table}
                     :name   "test"}
          ctx (context/build-context transform)]
      (is (nil? (:target ctx)))
      (is (false? (:has-column-matches? ctx))))))

(deftest build-context-with-joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "build-context extracts join structure from MBQL query with LEFT JOIN"
      (let [transform {:source {:type :query
                                :query (joined-orders-products-query)}
                       :target {:schema "nonexistent" :name "nonexistent_table" :type :table}
                       :name   "test"}
            ctx (context/build-context transform)]
        (is (true? (:has-joins? ctx)))
        (is (= 1 (count (:join-structure ctx))))
        (let [join (first (:join-structure ctx))]
          (is (= :left-join (:strategy join)))
          (is (= "Products" (:alias join)))
          (is (= (mt/id :products) (:source-table join))))
        (testing "visited-fields includes join fields"
          (is (seq (get-in ctx [:visited-fields :join_fields]))))
        (testing "multiple source tables detected"
          (is (>= (count (:sources ctx)) 2)))))))

(deftest build-context-column-matches-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "build-context populates column-matches when target exists"
      ;; Use products table as a fake target to avoid running a transform
      (let [products-table (t2/select-one :model/Table (mt/id :products))
            transform {:source {:type :query
                                :query (joined-orders-products-query)}
                       :target {:schema (:schema products-table)
                                :name   (:name products-table)
                                :type   :table}
                       :name   "test"}
            ctx (context/build-context transform)]
        (is (some? (:target ctx)))
        (is (true? (:has-column-matches? ctx)))
        (is (seq (:column-matches ctx)))
        (testing "column matches have expected structure"
          (let [m (first (:column-matches ctx))]
            (is (string? (:output-column m)))
            (is (map? (:output-field m)))
            (is (seq (:input-columns m)))))))))
