(ns metabase-enterprise.data-testing.subject.segment-test
  "The `:segment` subject plan: the database, the compiled SQL and the output names of a segment. H2 only."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.subject.segment]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.data-testing.util :as data-testing.u]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- people-query
  "An MBQL query of the people table."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :people)))))

(defn- people-column
  "The column of `query` for the field `people`.`field-key`."
  [query field-key]
  (some #(when (= (mt/id :people field-key) (:id %)) %) (lib/visible-columns query)))

(defn- people-columns
  "The names of every column of the people table, as the warehouse spells them."
  []
  (set (map :name (lib/returned-columns (people-query)))))

(defn- selected-columns
  "The column aliases the compiled SQL of `plan` selects."
  [plan]
  (set (map second (re-seq #"AS \"([^\"]+)\"" (get-in plan [:compiled :query])))))

(defn- plan-of
  "The subject plan of the saved Segment `segment-id` for a test with `inputs`."
  [segment-id inputs]
  (data-testing.subject/subject-plan :segment (t2/select-one :model/Segment :id segment-id) inputs))

(deftest segment-plan-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :name       "From Google"
                                                    :definition (:definition (data-testing.test-util/from-google-segment))}]
      (let [plan (plan-of segment-id [(data-testing.test-util/people-rows-input "ID" "SOURCE")])]
        (testing "a segment runs on its table's database"
          (is (= (mt/id) (get-in plan [:database :id]))))
        (testing "its compiled SQL reads its table and keeps its filter"
          (is (= #{{:schema "PUBLIC" :name "PEOPLE"}}
                 (data-testing.compile/referenced-tables :h2 (get-in plan [:compiled :query]))))
          (is (= ["Google"] (vec (get-in plan [:compiled :params])))))
        (testing "expectation SQL names the output with `{{output}}`, and messages name it by the segment's name"
          (is (= "{{output}}" (:output-token plan)))
          (is (= [{:schema nil :name data-testing.compile/output-name}] (:output-tables plan)))
          (is (= "From Google" (:output-label plan))))))))

(deftest segment-output-has-the-declared-columns-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :name       "From Google"
                                                    :definition (:definition (data-testing.test-util/from-google-segment))}]
      (testing "premise: the people table has more columns than the input declares"
        (is (< 2 (count (people-columns)))))
      (testing "the output has the columns the input declares for the segment's table"
        (is (= #{"ID" "SOURCE"} (selected-columns (plan-of segment-id [(data-testing.test-util/people-rows-input "ID" "SOURCE")])))))
      (testing "on a database that keeps case, such as H2, a declared name that differs only in case selects no column"
        (is (= #{"ID"} (selected-columns (plan-of segment-id [(data-testing.test-util/people-rows-input "ID" "Source")])))))
      (testing "on a database that ignores case, a declared name that differs only in case selects the column"
        (with-redefs [data-testing.u/column-names-ignore-case? (constantly true)]
          (is (= #{"ID" "SOURCE"} (selected-columns (plan-of segment-id [(data-testing.test-util/people-rows-input "id" "Source")]))))))
      (testing "the case rule is the one of the driver of the segment's database"
        (with-redefs [data-testing.u/column-names-ignore-case? #(= :h2 %)]
          (is (= #{"ID" "SOURCE"} (selected-columns (plan-of segment-id [(data-testing.test-util/people-rows-input "id" "Source")]))))))
      (testing "a declared column the table lacks adds nothing"
        (is (= #{"ID"} (selected-columns (plan-of segment-id [(data-testing.test-util/people-rows-input "ID" "NOT_A_COLUMN")]))))))))

(deftest segment-output-has-every-column-without-declared-columns-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :name       "From Google"
                                                    :definition (:definition (data-testing.test-util/from-google-segment))}]
      (testing "an input given as SQL declares no columns, so the output has every column of the table"
        (is (= (people-columns)
               (selected-columns (plan-of segment-id [{:table  {:schema "PUBLIC" :name "PEOPLE"}
                                                       :format :sql
                                                       :sql    "SELECT 1 AS ID"}])))))
      (testing "an input that declares no column of the table leaves every column"
        (is (= (people-columns) (selected-columns (plan-of segment-id [(data-testing.test-util/people-rows-input "NOT_A_COLUMN")])))))
      (testing "with no input for the table, every column"
        (is (= (people-columns) (selected-columns (plan-of segment-id []))))))))

(deftest segment-using-a-segment-plan-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {inner-id :id} {:table_id   (mt/id :people)
                                                  :name       "From Google"
                                                  :definition (:definition (data-testing.test-util/from-google-segment))}]
      (let [mp    (mt/metadata-provider)
            query (people-query)]
        (mt/with-temp [:model/Segment {outer-id :id} {:table_id   (mt/id :people)
                                                      :name       "From Google, after 10"
                                                      :definition (-> query
                                                                      (lib/filter (lib.metadata/segment mp inner-id))
                                                                      (lib/filter (lib/> (people-column query :id) 10)))}]
          (let [{{sql :query params :params} :compiled} (plan-of outer-id [(data-testing.test-util/people-rows-input "ID" "SOURCE")])]
            (testing "the inner segment's filter is expanded into the compiled SQL, beside the outer one's"
              (is (= ["Google"] (vec params)))
              (is (re-find #"\"SOURCE\" = \?" sql) sql)
              (is (re-find #"\"ID\" > 10" sql) sql))))))))

(defn- table-rows-input
  "An input standing in for the `PUBLIC` table `table-name`, declaring `column-names`, with no rows."
  [table-name & column-names]
  (assoc (apply data-testing.test-util/people-rows-input column-names) :table {:schema "PUBLIC" :name table-name}))

(defn- outer-selected-columns
  "The column aliases the outermost SELECT list of the compiled SQL of `plan` selects."
  [plan]
  (let [select-list (second (re-find #"^SELECT (.*?) FROM " (get-in plan [:compiled :query])))]
    (set (map second (re-seq #"AS \"([^\"]+)\"" select-list)))))

(deftest segment-output-has-the-columns-of-the-input-for-its-own-table-test
  (mt/test-driver :h2
    (let [mp     (mt/metadata-provider)
          orders (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :orders)
                                                      :name       "Gizmo orders"
                                                      :definition (lib/filter
                                                                   orders
                                                                   (lib/= (some #(when (= (mt/id :products :category) (:id %)) %)
                                                                                (lib/filterable-columns orders))
                                                                          "Gizmo"))}]
        (let [orders-input   (table-rows-input "ORDERS" "ID" "PRODUCT_ID")
              products-input (table-rows-input "PRODUCTS" "ID" "CATEGORY")]
          (testing "premise: the compiled SQL reads both the segment's table and the table its filter goes through"
            (is (= #{{:schema "PUBLIC" :name "ORDERS"} {:schema "PUBLIC" :name "PRODUCTS"}}
                   (data-testing.compile/referenced-tables
                    :h2 (get-in (plan-of segment-id [orders-input products-input]) [:compiled :query])))))
          (testing "the output has the columns the input for the segment's own table declares, whatever the order of the inputs"
            (is (= #{"ID" "PRODUCT_ID"} (outer-selected-columns (plan-of segment-id [orders-input products-input]))))
            (is (= #{"ID" "PRODUCT_ID"} (outer-selected-columns (plan-of segment-id [products-input orders-input]))))))))))

(deftest segment-whose-definition-cannot-compile-is-refused-test
  (mt/test-driver :h2
    (let [query (people-query)]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                      :name       "Missing field"
                                                      :definition (lib/filter query (lib/= [:field
                                                                                            {:lib/uuid  (str (random-uuid))
                                                                                             :base-type :type/Text}
                                                                                            Integer/MAX_VALUE]
                                                                                           "Google"))}
                     :model/Segment {control-id :id} {:table_id   (mt/id :people)
                                                      :name       "From Google"
                                                      :definition (:definition (data-testing.test-util/from-google-segment))}]
        (testing "control: a segment whose fields exist compiles"
          (is (nil? (data-testing.test-util/refusal #(plan-of control-id [])))))
        (testing "a segment whose definition names a field that does not exist is refused as uncompilable"
          (let [{:keys [error-type message]} (data-testing.test-util/refusal #(plan-of segment-id []))]
            (is (= ::data-testing.errors/uncompilable-subject error-type))
            (is (re-find #"^The query under test could not be compiled to SQL: " (str message)) message)))))))

(deftest segment-on-a-database-without-testing-is-refused-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :definition (:definition (data-testing.test-util/from-google-segment))}]
      (let [supports? driver/database-supports?]
        (with-redefs [driver/database-supports? (fn [driver feature database]
                                                  (and (not= :transforms/testing feature)
                                                       (supports? driver feature database)))]
          (testing "a segment on a database whose driver cannot run tests is refused"
            (is (= ::data-testing.errors/unsupported-driver
                   (try (plan-of segment-id [])
                        nil
                        (catch ExceptionInfo e (:error-type (ex-data e))))))))))))
