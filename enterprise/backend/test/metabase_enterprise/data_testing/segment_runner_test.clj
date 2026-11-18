(ns ^:mb/driver-tests metabase-enterprise.data-testing.segment-runner-test
  "Runs of saved segment tests."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-ref
  "The `{:schema :name}` of a test-data table, as compiled SQL references it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn- field-name
  "The name the warehouse gives the field `people`.`field-key`."
  [field-key]
  (:name (lib.metadata/field (mt/metadata-provider) (mt/id :people field-key))))

(defn- people-rows
  "An input standing in for the people table, declaring only its id and source columns, with `rows` of `[id source]`."
  [rows]
  (let [[int-type text-type] (data-testing.test-util/cast-types)
        id                   (field-name :id)
        source               (field-name :source)]
    {:table   (table-ref :people)
     :format  :rows
     :columns [{:name id :cast_type int-type} {:name source :cast_type text-type}]
     :rows    (mapv (fn [[i s]] {id i source s}) rows)}))

(def ^:private three-people
  [[1 "Google"] [2 "Twitter"] [3 "Google"]])

(defn- run-segment-test!
  "Save a Segment with the attributes `segment` and a SegmentTest of it with `inputs` and `expectations`, and run the
  test, started by crowberto."
  [segment inputs expectations]
  (mt/with-temp [:model/Segment     {segment-id :id} segment
                 :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                      :inputs       inputs
                                                      :expectations expectations}]
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (data-testing.runner/run-test! :segment
                                     (t2/select-one :model/Segment :id segment-id)
                                     (t2/select-one :model/SegmentTest :id test-id)))))

(defn- outcomes
  "Each expectation of the run `result` by name: its status."
  [result]
  (into {} (map (juxt :name :status)) (:expectations result)))

(deftest segment-expectations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [[int-type text-type] (data-testing.test-util/cast-types)
          id                   (field-name :id)
          source               (field-name :source)
          result               (run-segment-test!
                                (data-testing.test-util/from-google-segment)
                                [(people-rows three-people)]
                                [{:type :equals :name "the people from Google" :format :rows
                                  :columns [{:name id :cast_type int-type} {:name source :cast_type text-type}]
                                  :rows    [{id 1 source "Google"} {id 3 source "Google"}]}
                                 {:type :equals :name "equals fails" :format :rows
                                  :columns [{:name id :cast_type int-type}]
                                  :rows    [{id 2}]}
                                 {:type :empty :name "no one from elsewhere"
                                  :sql  (str "SELECT * FROM {{output}} WHERE " source " <> 'Google'")}
                                 {:type :empty :name "empty fails" :sql "SELECT * FROM {{output}}"}])]
      (testing "the output is the input rows that match the segment, with the columns the input declares"
        (is (= {"the people from Google" :passed
                "equals fails"           :failed
                "no one from elsewhere"  :passed
                "empty fails"            :failed}
               (outcomes result)))
        (is (= :failed (:status result)))))))

(deftest segment-output-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [run! (fn [input]
                 (data-testing.test-util/refusal #(run-segment-test! (data-testing.test-util/from-google-segment)
                                                                     [input]
                                                                     [{:type :empty :name "none" :sql "SELECT * FROM {{output}} WHERE 1 = 0"}])))]
      (testing "an input given as rows needs to declare only the columns the query reads"
        (is (nil? (run! (people-rows three-people)))))
      (testing "an input given as SQL declares no columns, so the output has every column of the table, and its SQL must give them all"
        (let [{:keys [error-type message]} (run! {:table  (table-ref :people)
                                                  :format :sql
                                                  :sql    (str "SELECT 1 AS " (field-name :id) ", 'Google' AS "
                                                               (field-name :source))})]
          (is (= ::data-testing.errors/query-failed error-type))
          ;; The message can also quote the compiled SQL, which names every column, so match only the warehouse's
          ;; naming of the missing column: `column "ADDRESS"` (H2), `column people.address` (Postgres), `column
          ;; 'people.address'` (MySQL), `Identifier 'test_data.people.address'` (ClickHouse), `column name 'ADDRESS'`
          ;; (SQL Server, whose "column name" would otherwise match the NAME column), `column named "address"` (DuckDB).
          (is (re-find #"(?i)(?:column|identifier)\s+['\"`\[]?(?:\w+\.)*(?:name|email|address|city)\b"
                       (str/replace message #"(?i)column named?\b" "column"))
              message))))))

(defn- validated-outcome!
  "What becomes of a test of a Segment with the attributes `segment`, `inputs` and `expectations`, started by crowberto:
  `{:refused error-type}` when validation refuses it, else `{:status status}` of its run, or `{:run-refused error-type
  :message message}` when the run is refused."
  [segment inputs expectations]
  (mt/with-temp [:model/Segment     {segment-id :id} segment
                 :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                      :inputs       inputs
                                                      :expectations expectations}]
    (let [segment (t2/select-one :model/Segment :id segment-id)]
      (if-let [{:keys [error-type]} (data-testing.test-util/refusal #(data-testing.runner/validate-test :segment segment inputs expectations))]
        {:refused error-type}
        (binding [api/*current-user-id* (mt/user->id :crowberto)]
          (let [result (atom nil)]
            (if-let [{:keys [error-type message]}
                     (data-testing.test-util/refusal #(reset! result (data-testing.runner/run-test!
                                                                      :segment segment (t2/select-one :model/SegmentTest :id test-id))))]
              {:run-refused error-type :message message}
              {:status (:status @result)})))))))

(defn- runs-once-accepted?
  "Whether `outcome`, a [[validated-outcome!]], is a typed refusal by validation or a run that happened."
  [{:keys [refused status]}]
  (or (some? refused)
      (contains? #{:passed :failed} status)))

(defn- gizmo-orders
  "Segment attributes for the segment of the orders whose product is a Gizmo, a filter through the orders' product
  foreign key."
  []
  (let [mp     (mt/metadata-provider)
        orders (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
    {:name       "Gizmo orders"
     :table_id   (mt/id :orders)
     :definition (lib/filter orders (lib/= (some #(when (= (mt/id :products :category) (:id %)) %)
                                                 (lib/filterable-columns orders))
                                           "Gizmo"))}))

(deftest a-segment-test-through-a-foreign-key-runs-once-accepted-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [[int-type text-type] (data-testing.test-util/cast-types)
          mp                   (mt/metadata-provider)
          column               (fn [table-key field-key]
                                 (:name (lib.metadata/field mp (mt/id table-key field-key))))
          [order-id product-id product-pk category]
          [(column :orders :id) (column :orders :product_id) (column :products :id) (column :products :category)]
          orders               {:table   (table-ref :orders)
                                :format  :rows
                                :columns [{:name order-id :cast_type int-type} {:name product-id :cast_type int-type}]
                                :rows    [{order-id 1 product-id 1} {order-id 2 product-id 2}]}
          products             (fn [column-names]
                                 {:table   (table-ref :products)
                                  :format  :rows
                                  :columns (mapv (fn [n] {:name n :cast_type (if (= n product-pk) int-type text-type)})
                                                 column-names)
                                  :rows    (mapv (fn [[pk c]] (assoc (zipmap column-names (repeat nil)) product-pk pk category c))
                                                 [[1 "Gizmo"] [2 "Widget"]])})
          one-order            [{:type :empty :name "one Gizmo order"
                                 :sql  "SELECT c FROM (SELECT COUNT(*) AS c FROM {{output}}) t WHERE c <> 1"}]
          every-product-column (mapv :name (lib/returned-columns
                                            (lib/query mp (lib.metadata/table mp (mt/id :products)))))]
      (testing "premise: the products table has columns the filter does not read"
        (is (< 2 (count every-product-column))))
      (testing "control: with every products column declared, the test runs and finds the one Gizmo order"
        (is (= {:status :passed}
               (validated-outcome! (gizmo-orders) [orders (products every-product-column)] one-order))))
      (testing "with only the products columns the filter reads declared, the test is refused when saved, or else it runs to a result"
        (let [outcome (validated-outcome! (gizmo-orders) [orders (products [product-pk category])] one-order)]
          (is (runs-once-accepted? outcome) (pr-str outcome)))))))

(deftest a-segment-test-validation-accepts-runs-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [[int-type text-type] (data-testing.test-util/cast-types)
          input                (fn [& names+types]
                                 (let [columns (mapv (fn [[n t]] {:name n :cast_type t}) (partition 2 names+types))]
                                   {:table   (table-ref :people)
                                    :format  :rows
                                    :columns columns
                                    :rows    [(zipmap (map :name columns) [1 "Google"])]}))
          other-case           (fn [s]
                                 (if (= s (u/upper-case-en s)) (u/lower-case-en s) (u/upper-case-en s)))
          id                   (field-name :id)
          source               (field-name :source)
          none                 [{:type :empty :name "none" :sql "SELECT * FROM {{output}} WHERE 1 = 0"}]]
      (testing "control: an input declaring the filter's column, spelled as the warehouse spells it, runs"
        (is (= {:status :passed} (validated-outcome! (data-testing.test-util/from-google-segment) [(input id int-type source text-type)] none))))
      (testing "an input that does not declare the filter's column is refused when saved, or else it runs to a result"
        (let [outcome (validated-outcome! (data-testing.test-util/from-google-segment) [(input id int-type (field-name :name) text-type)] none)]
          (is (runs-once-accepted? outcome) (pr-str outcome))))
      (testing "an input that names no column of the table is refused when saved, or else it runs to a result"
        (let [outcome (validated-outcome! (data-testing.test-util/from-google-segment) [(input "NOT_A_COLUMN" int-type)] none)]
          (is (runs-once-accepted? outcome) (pr-str outcome))))
      (testing "an input whose column names match the table's only when case is ignored is refused when saved, or else it runs to a result"
        (let [outcome (validated-outcome! (data-testing.test-util/from-google-segment)
                                          [(input (other-case id) int-type (other-case source) text-type)]
                                          none)]
          (is (runs-once-accepted? outcome) (pr-str outcome)))))))

(deftest segment-guards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (testing "Guard A: a segment test without an input for the segment's table is refused, naming it"
      (let [{:keys [error-type message]} (data-testing.test-util/refusal #(run-segment-test!
                                                                           (data-testing.test-util/from-google-segment)
                                                                           []
                                                                           [{:type :empty :name "e" :sql "SELECT * FROM {{output}}"}]))]
        (is (= ::data-testing.errors/missing-inputs error-type))
        (is (re-find (re-pattern (str "(?i)" (:name (table-ref :people)))) message))))
    (testing "Guard B: an expectation reading a real table is refused"
      (let [{schema :schema table :name} (table-ref :orders)]
        (is (= ::data-testing.errors/unremapped-reference
               (:error-type (data-testing.test-util/refusal #(run-segment-test!
                                                              (data-testing.test-util/from-google-segment)
                                                              [(people-rows three-people)]
                                                              [{:type :empty :name "reads orders"
                                                                :sql  (str "SELECT * FROM {{output}} o JOIN " schema "." table " r ON 1 = 1")}])))))))))

(deftest segment-run-is-persisted-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                        :inputs       [(people-rows three-people)]
                                                        :expectations [{:type :empty :name "none"
                                                                        :sql  "SELECT * FROM {{output}} WHERE 1 = 0"}]}]
      (binding [api/*current-user-id* (mt/user->id :crowberto)]
        (is (= :passed (:status (data-testing.runner/run-test! :segment
                                                               (t2/select-one :model/Segment :id segment-id)
                                                               (t2/select-one :model/SegmentTest :id test-id))))))
      (testing "the run is recorded under the test as a segment test run, with its outcome"
        (is (=? [{:test_type    :segment
                  :status       :passed
                  :initiated_by (mt/user->id :crowberto)
                  :end_time     some?}]
                (t2/select :model/DataTestRun :test_type "segment" :test_id test-id)))))))
