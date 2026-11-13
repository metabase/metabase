(ns metabase-enterprise.data-testing.subject.segment-test
  "The `:segment` subject plan: the database, the compiled SQL and the output names of a segment. H2 only."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.subject.segment]
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

(defn- from-google
  "A segment definition: people whose source is Google."
  []
  (let [query (people-query)]
    (lib/filter query (lib/= (people-column query :source) "Google"))))

(defn- people-columns
  "The names of every column of the people table, as the warehouse spells them."
  []
  (set (map :name (lib/returned-columns (people-query)))))

(defn- selected-columns
  "The column aliases the compiled SQL of `plan` selects."
  [plan]
  (set (map second (re-seq #"AS \"([^\"]+)\"" (get-in plan [:compiled :query])))))

(defn- rows-input
  "An input standing in for the people table, declaring `column-names`, with no rows."
  [& column-names]
  {:table   {:schema "PUBLIC" :name "PEOPLE"}
   :format  :rows
   :columns (mapv (fn [column-name] {:name column-name :cast_type "VARCHAR"}) column-names)
   :rows    []})

(defn- plan-of
  "The subject plan of the saved Segment `segment-id` for a test with `inputs`."
  [segment-id inputs]
  (data-testing.subject/subject-plan :segment (t2/select-one :model/Segment :id segment-id) inputs))

(deftest segment-plan-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :name       "From Google"
                                                    :definition (from-google)}]
      (let [plan (plan-of segment-id [(rows-input "ID" "SOURCE")])]
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
                                                    :definition (from-google)}]
      (testing "premise: the people table has more columns than the input declares"
        (is (< 2 (count (people-columns)))))
      (testing "the output has the columns the input declares for the segment's table"
        (is (= #{"ID" "SOURCE"} (selected-columns (plan-of segment-id [(rows-input "ID" "SOURCE")])))))
      (testing "column names match whatever their case"
        (is (= #{"ID" "SOURCE"} (selected-columns (plan-of segment-id [(rows-input "id" "Source")])))))
      (testing "a declared column the table lacks adds nothing"
        (is (= #{"ID"} (selected-columns (plan-of segment-id [(rows-input "ID" "NOT_A_COLUMN")]))))))))

(deftest segment-output-has-every-column-without-declared-columns-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :name       "From Google"
                                                    :definition (from-google)}]
      (testing "an input given as SQL declares no columns, so the output has every column of the table"
        (is (= (people-columns)
               (selected-columns (plan-of segment-id [{:table  {:schema "PUBLIC" :name "PEOPLE"}
                                                       :format :sql
                                                       :sql    "SELECT 1 AS ID"}])))))
      (testing "an input that declares no column of the table leaves every column"
        (is (= (people-columns) (selected-columns (plan-of segment-id [(rows-input "NOT_A_COLUMN")])))))
      (testing "with no input for the table, every column"
        (is (= (people-columns) (selected-columns (plan-of segment-id []))))))))

(deftest segment-using-a-segment-plan-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {inner-id :id} {:table_id   (mt/id :people)
                                                  :name       "From Google"
                                                  :definition (from-google)}]
      (let [mp    (mt/metadata-provider)
            query (people-query)]
        (mt/with-temp [:model/Segment {outer-id :id} {:table_id   (mt/id :people)
                                                      :name       "From Google, after 10"
                                                      :definition (-> query
                                                                      (lib/filter (lib.metadata/segment mp inner-id))
                                                                      (lib/filter (lib/> (people-column query :id) 10)))}]
          (let [{{sql :query params :params} :compiled} (plan-of outer-id [(rows-input "ID" "SOURCE")])]
            (testing "the inner segment's filter is expanded into the compiled SQL, beside the outer one's"
              (is (= ["Google"] (vec params)))
              (is (re-find #"\"SOURCE\" = \?" sql) sql)
              (is (re-find #"\"ID\" > 10" sql) sql))))))))

(deftest segment-on-a-database-without-testing-is-refused-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :people)
                                                    :definition (from-google)}]
      (let [supports? driver/database-supports?]
        (with-redefs [driver/database-supports? (fn [driver feature database]
                                                  (and (not= :transforms/testing feature)
                                                       (supports? driver feature database)))]
          (testing "a segment on a database whose driver cannot run tests is refused"
            (is (= ::data-testing.errors/unsupported-driver
                   (try (plan-of segment-id [])
                        nil
                        (catch ExceptionInfo e (:error-type (ex-data e))))))))))))
