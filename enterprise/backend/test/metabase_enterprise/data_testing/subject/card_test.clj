(ns metabase-enterprise.data-testing.subject.card-test
  "The `:card` subject plan: the database, the compiled SQL and the output names of a card. H2 only."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.subject.card]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- table-ref
  "The `{:schema :name}` of a test-data table, as compiled SQL references it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn- saved-card
  "The Card row with `card-id`, as the app database returns it."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn- tables-read
  "The tables the compiled SQL of `plan` reads."
  [plan]
  (data-testing.compile/referenced-tables :h2 (get-in plan [:compiled :query])))

(defn- refusal-type
  "The `:error-type` of the refusal `thunk` throws, or nil when it does not throw."
  [thunk]
  (try
    (thunk)
    nil
    (catch ExceptionInfo e
      (:error-type (ex-data e)))))

(defn- table-query
  "An MBQL query of the test-data table `table-key`."
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(defn- column
  "The column of `query` for the field `table-key`.`field-key`, through an implicit join when it is on another table."
  [query table-key field-key]
  (let [field-id (mt/id table-key field-key)]
    (m/find-first #(= field-id (:id %)) (lib/visible-columns query))))

(defn- native-query
  "A native query of `sql`, with `template-tags` by name."
  [sql & {:as template-tags}]
  (cond-> (lib/native-query (mt/metadata-provider) sql)
    template-tags (lib/with-template-tags template-tags)))

(deftest mbql-card-plan-test
  (mt/test-driver :h2
    (let [orders (table-query :orders)
          query  (lib/aggregate orders (lib/sum (column orders :orders :total)))]
      (mt/with-temp [:model/Card {card-id :id} {:name "Total revenue" :dataset_query query}]
        (let [plan (data-testing.subject/subject-plan :card (saved-card card-id))]
          (testing "a saved MBQL card runs on its query's database"
            (is (= (mt/id) (get-in plan [:database :id]))))
          (testing "its compiled SQL reads the table of its query"
            (is (= #{(table-ref :orders)} (tables-read plan))))
          (testing "expectation SQL names the output with `{{output}}`, which stands for one reserved bare table"
            (is (= "{{output}}" (:output-token plan)))
            (is (= [{:schema nil :name data-testing.compile/output-name}] (:output-tables plan))))
          (testing "messages name the output by the card's name"
            (is (= "Total revenue" (:output-label plan)))))
        (testing "a card that is not saved is not a subject"
          (is (thrown-with-msg? ExceptionInfo #"Invalid input"
                                (data-testing.subject/subject-plan :card {:dataset_query (:dataset_query (saved-card card-id))}))))))))

(deftest mbql-card-implicit-join-plan-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (let [orders (table-query :orders)]
                                                               (-> orders
                                                                   (lib/aggregate (lib/sum (column orders :orders :total)))
                                                                   (lib/breakout (column orders :products :category))))}]
      (testing "an implicit join reads the joined table too"
        (is (= #{(table-ref :orders) (table-ref :products)}
               (tables-read (data-testing.subject/subject-plan :card (saved-card card-id)))))))))

(deftest mbql-card-with-a-foreign-key-remap-plan-test
  (mt/test-driver :h2
    (mt/with-column-remappings [orders.product_id products.title]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (let [orders (table-query :orders)]
                                                                 (lib/with-fields orders [(column orders :orders :id)
                                                                                          (column orders :orders :product_id)]))}]
        (testing "a foreign-key remap adds no join: the test need not declare the remapped table"
          (is (= #{(table-ref :orders)}
                 (tables-read (data-testing.subject/subject-plan :card (saved-card card-id))))))))))

(deftest native-card-plan-test
  (mt/test-driver :h2
    (let [{:keys [schema name]} (table-ref :people)]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (native-query (str "SELECT * FROM " schema "." name))}]
        (testing "a native card reads the tables its SQL names"
          (is (= #{(table-ref :people)}
                 (tables-read (data-testing.subject/subject-plan :card (saved-card card-id))))))))))

(deftest native-card-with-card-reference-plan-test
  (mt/test-driver :h2
    (let [{:keys [schema name]} (table-ref :products)]
      (mt/with-temp [:model/Card {referenced-id :id} {:dataset_query (native-query (str "SELECT * FROM " schema "." name))}
                     :model/Card {card-id :id}       {:dataset_query
                                                      (native-query
                                                       (str "SELECT * FROM {{#" referenced-id "}} AS p")
                                                       (str "#" referenced-id) {:type         :card
                                                                                :name         (str "#" referenced-id)
                                                                                :display-name (str "#" referenced-id)
                                                                                :card-id      referenced-id})}]
        (testing "a `{{#ref}}` reads the tables of the card it names"
          (is (= #{(table-ref :products)}
                 (tables-read (data-testing.subject/subject-plan :card (saved-card card-id))))))))))

(deftest native-card-with-snippet-plan-test
  (mt/test-driver :h2
    (let [{:keys [schema name]} (table-ref :venues)]
      (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "venues table" :content (str schema "." name)}
                     :model/Card {card-id :id} {:dataset_query
                                                (native-query
                                                 "SELECT * FROM {{snippet: venues table}}"
                                                 "snippet: venues table" {:type         :snippet
                                                                          :name         "snippet: venues table"
                                                                          :display-name "Venues table"
                                                                          :snippet-name "venues table"
                                                                          :snippet-id   snippet-id})}]
        (testing "a snippet reads the tables its content names"
          (is (= #{(table-ref :venues)}
                 (tables-read (data-testing.subject/subject-plan :card (saved-card card-id))))))))))

(deftest metric-and-model-card-plan-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Card {metric-id :id} {:type          :metric
                                                :dataset_query (lib/aggregate (table-query :orders) (lib/count))}
                   :model/Card {model-id :id}  {:type          :model
                                                :dataset_query (table-query :venues)}
                   :model/Card {over-model-id :id} {:dataset_query (let [mp (mt/metadata-provider)]
                                                                     (-> (lib/query mp (lib.metadata/card mp model-id))
                                                                         (lib/aggregate (lib/count))))}]
      (testing "a metric card reads the tables of its query"
        (is (= #{(table-ref :orders)}
               (tables-read (data-testing.subject/subject-plan :card (saved-card metric-id))))))
      (testing "a model card reads the tables of its query"
        (is (= #{(table-ref :venues)}
               (tables-read (data-testing.subject/subject-plan :card (saved-card model-id))))))
      (testing "an MBQL question over a model reads the model's tables"
        (is (= #{(table-ref :venues)}
               (tables-read (data-testing.subject/subject-plan :card (saved-card over-model-id)))))))))

(defn- refusal
  "The `:error-type` and message of the refusal `thunk` throws, or nil when it does not throw."
  [thunk]
  (try
    (thunk)
    nil
    (catch ExceptionInfo e
      {:error-type (:error-type (ex-data e)) :message (ex-message e)})))

(deftest card-with-a-parameter-and-no-default-is-refused-test
  (mt/test-driver :h2
    (let [{:keys [schema name]} (table-ref :people)
          people                (str schema "." name)
          tag                   (fn [tag-name & {:as more}]
                                  (merge {:type :text :name tag-name :display-name tag-name} more))
          plan-of               (fn [query]
                                  (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
                                    (refusal #(data-testing.subject/subject-plan :card (saved-card card-id)))))]
      (testing "a required parameter with no default: the refusal says card tests cannot set it"
        (is (= {:error-type ::data-testing.errors/uncompilable-subject
                :message    (str "This card has a parameter with no default value: source. "
                                 "Card tests cannot set parameter values.")}
               (plan-of (native-query (str "SELECT * FROM " people " WHERE source = {{source}}")
                                      "source" (tag "source" :required true))))))
      (testing "a parameter outside an optional clause with no default is refused the same way"
        (is (= {:error-type ::data-testing.errors/uncompilable-subject
                :message    (str "This card has a parameter with no default value: source. "
                                 "Card tests cannot set parameter values.")}
               (plan-of (native-query (str "SELECT * FROM " people " WHERE source = {{source}}")
                                      "source" (tag "source"))))))
      (testing "control: a required parameter with a default compiles at its default"
        (is (nil? (plan-of (native-query (str "SELECT * FROM " people " WHERE source = {{source}}")
                                         "source" (tag "source" :required true :default "Google"))))))
      (testing "control: a parameter in an optional clause compiles without a value"
        (is (nil? (plan-of (native-query (str "SELECT * FROM " people " WHERE 1 = 1 [[AND source = {{source}}]]")
                                         "source" (tag "source")))))))))

(deftest card-on-a-database-without-testing-is-refused-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
      (let [supports? driver/database-supports?]
        (with-redefs [driver/database-supports? (fn [driver feature database]
                                                  (and (not= :transforms/testing feature)
                                                       (supports? driver feature database)))]
          (testing "a card on a database whose driver cannot run tests is refused"
            (is (= ::data-testing.errors/unsupported-driver
                   (refusal-type #(data-testing.subject/subject-plan :card (saved-card card-id)))))))))))
