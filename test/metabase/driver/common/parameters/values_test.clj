(ns metabase.driver.common.parameters.values-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.models :refer [Card Collection NativeQuerySnippet]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (clojure.lang ExceptionInfo)
   (metabase.driver.common.parameters ReferencedCardQuery)))

(set! *warn-on-reflection* true)

(def ^:private test-uuid (str (random-uuid)))

(deftest ^:parallel variable-value-test
  (testing "Specified value, targeted by name"
    (is (= "2"
           (#'params.values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"}
            [{:type :category, :target [:variable [:template-tag "id"]], :value "2"}]))))

  (testing "Specified value, targeted by ID"
    (is (= "2"
           (#'params.values/value-for-tag
            {:name "id", :id test-uuid, :display-name "ID", :type :text, :required true, :default "100"}
            [{:type :category, :target [:variable [:template-tag {:id test-uuid}]], :value "2"}]))))

  (testing "Multiple values with new operators"
    (is (= 20
           (#'params.values/value-for-tag
            {:name "number_filter", :display-name "ID", :type :number, :required true, :default "100"}
            [{:type :number/=, :value ["20"], :target [:variable [:template-tag "number_filter"]]}])))
    (is (= [20 40]
           (#'params.values/value-for-tag
            {:name "number_filter", :display-name "ID", :type :number, :required true, :default "100"}
            [{:type :number/=, :value ["20" "40"], :target [:variable [:template-tag "number_filter"]]}]))))

  (testing "Unspecified value"
    (is (= params/no-value
           (#'params.values/value-for-tag {:name "id", :display-name "ID", :type :text} nil))))

  (testing "Unspecified value when required"
    (is (thrown? Exception
                 (#'params.values/value-for-tag {:name "id", :display-name "ID", :required true, :type :text} nil))))

  (testing "Empty value when required"
    (is (thrown? Exception
                 (#'params.values/value-for-tag
                  {:name "id", :id test-uuid, :display-name "ID", :required true, :type :text}
                  [{:type :category, :target [:variable [:template-tag {:id test-uuid}]], :value nil}]))))

  (testing "Default used with unspecified value"
    (is (= "100"
           (#'params.values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"} nil))))

  (testing "Default not used with empty value"
    (is (= params/no-value
           (#'params.values/value-for-tag
            {:name "id", :id test-uuid, :display-name "ID", :type :text, :default "100"}
            [{:type :category, :target [:variable [:template-tag {:id test-uuid}]], :value nil}]))))

  (testing "Default not used with empty value when required"
    (is (thrown? Exception
                 (#'params.values/value-for-tag
                  {:name "id", :id test-uuid, :display-name "ID", :type :text, :required true, :default "100"}
                  [{:type :category, :target [:variable [:template-tag {:id test-uuid}]], :value nil}])))))

(defn- value-for-tag
  "Call the private function and de-recordize the field"
  [field-info info]
  (letfn [(thunk []
            (mt/derecordize (#'params.values/value-for-tag field-info info)))]
    (if (qp.store/initialized?)
      (thunk)
      (mt/with-metadata-provider (mt/id)
        (thunk)))))

(defn- extra-field-info
  "Add extra field information like `:coercion-strategy`, `:semantic-type`, and `:effective-type`."
  [field]
  (letfn [(field-metadata* []
            (lib.metadata/field (qp.store/metadata-provider) (u/the-id field)))
          (field-metadata []
            (if (qp.store/initialized?)
              (field-metadata*)
              (mt/with-metadata-provider (mt/id)
                (field-metadata*))))]
    (merge (field-metadata) field)))

(defn parse-tag
  [field-info info]
  (mt/derecordize (#'params.values/parse-tag field-info info)))

(deftest ^:parallel field-filter-date-range-targeted-by-name-test
  (testing "date range for a normal :type/Temporal field, targeted by name"
    (is (=? {:field (extra-field-info
                     {:id            (mt/id :checkins :date)
                      :name          "DATE"
                      :parent-id     nil
                      :table-id      (mt/id :checkins)
                      :base-type     :type/Date
                      :semantic-type nil})
             :value {:type  :date/range
                     :value "2015-04-01~2015-05-01"}}
            (value-for-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :dimension    [:field (mt/id :checkins :date) nil]
              :widget-type  :date/all-options}
             [{:type   :date/range
               :target [:dimension [:template-tag "checkin_date"]]
               :value  "2015-04-01~2015-05-01"}])))))

(deftest ^:parallel field-filter-date-range-targeted-by-id-test
  (testing "date range for a normal :type/Temporal field, targeted by id"
    (is (=? {:field (extra-field-info
                     {:id            (mt/id :checkins :date)
                      :name          "DATE"
                      :parent-id     nil
                      :table-id      (mt/id :checkins)
                      :base-type     :type/Date
                      :semantic-type nil})
             :value {:type  :date/range
                     :value "2015-04-01~2015-05-01"}}
            (value-for-tag
             {:name         "checkin_date"
              :id           test-uuid
              :display-name "Checkin Date"
              :type         :dimension
              :dimension    [:field (mt/id :checkins :date) nil]
              :widget-type  :date/all-options}
             [{:type   :date/range
               :target [:dimension [:template-tag {:id test-uuid}]]
               :value  "2015-04-01~2015-05-01"}])))))

(deftest ^:parallel field-filter-date-range-for-unix-timestamp-test
  (testing "date range for a UNIX timestamp field should work just like a :type/Temporal field (#11934)"
    (mt/dataset tupac-sightings
      (mt/$ids sightings
        (is (=? {:field (extra-field-info
                         {:id                %timestamp
                          :name              "TIMESTAMP"
                          :parent-id         nil
                          :table-id          $$sightings
                          :base-type         :type/BigInteger
                          :effective-type    :type/Instant
                          :coercion-strategy :Coercion/UNIXSeconds->DateTime})
                 :value {:type  :date/range
                         :value "2020-02-01~2020-02-29"}}
                (value-for-tag
                 {:name         "timestamp"
                  :display-name "Sighting Timestamp"
                  :type         :dimension
                  :dimension    $timestamp
                  :widget-type  :date/range}
                 [{:type   :date/range
                   :target [:dimension [:template-tag "timestamp"]]
                   :value  "2020-02-01~2020-02-29"}])))))))

(deftest ^:parallel field-filter-with-unspecified-value-test
  (testing "unspecified"
    (is (=? {:field (extra-field-info
                     {:id            (mt/id :checkins :date)
                      :name          "DATE"
                      :parent-id     nil
                      :table-id      (mt/id :checkins)
                      :base-type     :type/Date
                      :semantic-type nil})
             :value params/no-value}
            (value-for-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :widget-type  :date/all-options
              :dimension    [:field (mt/id :checkins :date) nil]}
             nil)))))

(deftest ^:parallel field-filter-id-requiring-parsing-test
  (testing "id requiring parsing"
    (is (=? {:field (extra-field-info
                     {:id            (mt/id :checkins :id)
                      :name          "ID"
                      :parent-id     nil
                      :table-id      (mt/id :checkins)
                      :base-type     :type/BigInteger
                      :semantic-type :type/PK})
             :value {:type  :id
                     :value 5}}
            (value-for-tag
             {:name         "id"
              :display-name "ID"
              :type         :dimension
              :widget-type  :number
              :dimension    [:field (mt/id :checkins :id) nil]}
             [{:type :id, :target [:dimension [:template-tag "id"]], :value "5"}])))))

(deftest ^:parallel field-filter-with-required-but-no-value-test
  (testing "required but unspecified"
    (is (thrown? Exception
                 (value-for-tag
                  {:name         "checkin_date"
                   :display-name "Checkin Date"
                   :type         :dimension
                   :widget-type  :date/all-options
                   :required     true
                   :dimension    [:field (mt/id :checkins :date) nil]}
                  nil)))))

(deftest ^:parallel field-filter-with-required-and-default-test
  (testing "required and default specified"
    (is (=? {:field (extra-field-info
                     {:id            (mt/id :checkins :date)
                      :name          "DATE"
                      :parent-id     nil
                      :table-id      (mt/id :checkins)
                      :base-type     :type/Date
                      :semantic-type nil})
             :value {:type  :date/range
                     :value "2015-04-01~2015-05-01"}}
            (value-for-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :widget-type  :date/range
              :required     true
              :default      "2015-04-01~2015-05-01"
              :dimension    [:field (mt/id :checkins :date) nil]}
             nil)))))

(deftest ^:parallel field-filter-multiple-values-for-same-tag-test
  (testing "multiple values for the same tag should return a vector with multiple params instead of a single param"
    (is (=? {:field (extra-field-info
                     {:id            (mt/id :checkins :date)
                      :name          "DATE"
                      :parent-id     nil
                      :table-id      (mt/id :checkins)
                      :base-type     :type/Date
                      :semantic-type nil})
             :value [{:type  :date/range
                      :value "2015-01-01~2016-09-01"}
                     {:type  :date/single
                      :value "2015-07-01"}]}
            (value-for-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :widget-type  :date/all-options
              :dimension    [:field (mt/id :checkins :date) nil]}
             [{:type   :date/range
               :target [:dimension [:template-tag "checkin_date"]]
               :value  "2015-01-01~2016-09-01"}
              {:type   :date/single
               :target [:dimension [:template-tag "checkin_date"]]
               :value  "2015-07-01"}])))))

(deftest ^:parallel field-filter-default-values-test
  (mt/with-metadata-provider meta/metadata-provider
    (testing "Make sure defaults values get picked up for field filter clauses"
      (is (=? {:field (extra-field-info
                       {:id            (meta/id :checkins :date)
                        :name          "DATE"
                        :parent-id     nil
                        :table-id      (meta/id :checkins)
                        :base-type     :type/Date
                        :semantic-type nil})
               :value {:type  :date/all-options
                       :value "past5days"}}
              (parse-tag
               {:name         "checkin_date"
                :display-name "Checkin Date"
                :type         :dimension
                :dimension    [:field (meta/id :checkins :date) nil]
                :default      "past5days"
                :widget-type  :date/all-options}
               nil))))))

(deftest ^:parallel field-filter-nil-values-test
  (mt/with-metadata-provider meta/metadata-provider
    (testing "Make sure nil values result in no value"
      (is (=? {:field (extra-field-info
                       {:id             (meta/id :checkins :date)
                        :name           "DATE"
                        :parent-id      nil
                        :table-id       (meta/id :checkins)
                        :base-type      :type/Date
                        :effective-type :type/Date})
               :value params/no-value}
              (parse-tag
               {:name         "checkin_date"
                :display-name "Checkin Date"
                :type         :dimension
                :dimension    [:field (meta/id :checkins :date) nil]
                :widget-type  :date/all-options}
               nil))))))

(defn- query->params-map [inner-query]
  (if (qp.store/initialized?)
    (params.values/query->params-map inner-query)
    (qp.store/with-metadata-provider (mt/id)
      (params.values/query->params-map inner-query))))

(deftest ^:parallel field-filter-errors-test
  (testing "error conditions for field filter (:dimension) parameters"
    (testing "Should throw an Exception if Field does not exist"
      (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                         :template-tags {"x" {:name         "x"
                                              :display-name "X"
                                              :type         :dimension
                                              :dimension    [:field Integer/MAX_VALUE nil]}})]
        (is (thrown?
             clojure.lang.ExceptionInfo
             (query->params-map query)))))))

(deftest ^:parallel card-query-test
  (mt/with-test-user :rasta
    (testing "Card query template tag gets card's native query"
      (let [test-query "SELECT 1"]
        (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                          meta/metadata-provider
                                          [{:database (meta/id)
                                            :type     "native"
                                            :native   {:query test-query}}])
          (is (= {:card-id 1, :query test-query, :params nil}
                 (value-for-tag
                  {:name         "card-template-tag-test"
                   :display-name "Card template tag test"
                   :type         :card
                   :card-id      1}
                  []))))))))

(deftest ^:parallel card-query-test-2
  (mt/with-test-user :rasta
    (testing "Card query template tag generates native query for MBQL query"
      (driver/with-driver :h2
        (let [mbql-query   (lib.tu.macros/mbql-query venues
                             {:database (meta/id)
                              :filter   [:< [:field $price nil] 3]})
              expected-sql (str "SELECT "
                                "\"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", "
                                "\"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", "
                                "\"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", "
                                "\"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", "
                                "\"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", "
                                "\"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                                "FROM \"PUBLIC\".\"VENUES\" "
                                "WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" < 3")]
          (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                            meta/metadata-provider
                                            [mbql-query])
            (is (= {:card-id 1, :query expected-sql, :params nil}
                   (value-for-tag
                    {:name         "card-template-tag-test"
                     :display-name "Card template tag test"
                     :type         :card
                     :card-id      1}
                    [])))))))))

(deftest card-query-test-3
  (mt/with-test-user :rasta
    (testing "Persisted Models are substituted"
      (mt/test-driver :postgres
        (mt/dataset test-data
          (mt/with-persistence-enabled [persist-models!]
            (let [mbql-query (mt/mbql-query categories)]
              (mt/with-temp [Card model {:name "model"
                                         :type :model
                                         :dataset_query mbql-query
                                         :database_id (mt/id)}]
                (persist-models!)
                (testing "tag uses persisted table"
                  (let [pi (t2/select-one 'PersistedInfo :card_id (u/the-id model))]
                    (is (= "persisted" (:state pi)))
                    (is (re-matches #"select \* from \"metabase_cache_[a-z0-9]+_[0-9]+\".\"model_[0-9]+_model\""
                                    (:query
                                     (value-for-tag
                                      {:name         "card-template-tag-test"
                                       :display-name "Card template tag test"
                                       :type         :card
                                       :card-id      (:id model)}
                                      []))))
                    (testing "query hits persisted table"
                      (let [persisted-schema (ddl.i/schema-name {:id (mt/id)}
                                                                (public-settings/site-uuid))
                            update-query     (format "update %s.%s set name = name || ' from cached table'"
                                                     persisted-schema (:table_name pi))
                            model-query (format "select c_orig.name, c_cached.name
                                               from categories c_orig
                                               left join {{#%d}} c_cached
                                               on c_orig.id = c_cached.id
                                               order by c_orig.id desc limit 3"
                                                (u/the-id model))
                            tag-name    (format "#%d" (u/the-id model))]
                        (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                                       [update-query])
                        (is (= [["Winery" "Winery from cached table"]
                                ["Wine Bar" "Wine Bar from cached table"]
                                ["Vegetarian / Vegan" "Vegetarian / Vegan from cached table"]]
                               (mt/rows (qp/process-query
                                         {:database (mt/id)
                                          :type :native
                                          :native {:query model-query
                                                   :template-tags
                                                   {(keyword tag-name)
                                                    {:id "c6558da4-95b0-d829-edb6-45be1ee10d3c"
                                                     :name tag-name
                                                     :display-name tag-name
                                                     :type "card"
                                                     :card-id (u/the-id model)}}}}))))))))))))))))

(deftest ^:parallel card-query-test-4
  (mt/with-test-user :rasta
    (testing "Card query template tag wraps error in tag details"
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [{:type     :native
                                          :native   {:query         "SELECT {{x}}"
                                                     :template-tags {"x" {:id           "x-tag"
                                                                          :name         "x"
                                                                          :display-name "Number x"
                                                                          :type         :number
                                                                          :required     false}}}
                                          :database (meta/id)}
                                         {:type     :native
                                          :native   {:query         "SELECT * FROM {{#1}} AS y"
                                                     :template-tags {"#1" {:id           "#1"
                                                                           :name         "#1"
                                                                           :display-name "#1"
                                                                           :type         "card"
                                                                           :card-id      1}}}
                                          :database (meta/id)}])
        (let [tag      {:name         "card-template-tag-test"
                        :display-name "Card template tag test"
                        :type         :card
                        :card-id      1}
              e        (try
                         (value-for-tag tag [])
                         (catch ExceptionInfo e
                           e))
              exc-data (some (fn [e]
                               (when (:card-query-error? (ex-data e))
                                 (ex-data e)))
                             (take-while some? (iterate ex-cause e)))]
          (testing "should be a card Query error"
            (is (= true
                   (boolean (:card-query-error? exc-data)))))
          (testing "card-id"
            (is (= 1
                   (:card-id exc-data))))
          (testing "tag"
            (is (= tag
                   (:tag exc-data)))))))))

(deftest card-query-permissions-test
  (testing "We should be able to run a query referenced via a template tag if we have perms for the Card in question (#12354)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :no)
          (mt/with-temp [Collection collection {}
                         Card       {card-1-id :id} {:collection_id (u/the-id collection)
                                                     :dataset_query (mt/mbql-query venues
                                                                      {:order-by [[:asc $id]] :limit 2})}
                         Card       card-2 {:collection_id (u/the-id collection)
                                            :dataset_query (mt/native-query
                                                             {:query         "SELECT * FROM {{card}}"
                                                              :template-tags {"card" {:name         "card"
                                                                                      :display-name "card"
                                                                                      :type         :card
                                                                                      :card-id      card-1-id}}})}]
            (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
            (mt/with-test-user :rasta
              (binding [qp.perms/*card-id* (u/the-id card-2)]
                (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3]
                        [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]
                       (mt/rows
                        (qp/process-query (:dataset_query card-2)))))))))))))

(deftest ^:parallel card-query-errors-test
  (testing "error conditions for :card parameters"
    (testing "should throw an Exception if Card does not exist"
      (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                         :template-tags {"x" {:name         "x"
                                              :display-name "X"
                                              :type         :card
                                              :card-id      Integer/MAX_VALUE}})]
        (is (thrown?
             clojure.lang.ExceptionInfo
             (query->params-map query)))))))

(defn- query-with-snippet [& {:as snippet-properties}]
  (assoc (mt/native-query "SELECT * FROM {{expensive-venues}}")
         :template-tags {"expensive-venues" (merge
                                             {:type         :snippet
                                              :name         "expensive-venues"
                                              :display-name "Expensive Venues"
                                              :snippet-name "expensive-venues"}
                                             snippet-properties)}))

(deftest ^:parallel snippet-validation-test
  (testing "`:snippet-id` should be required"
    (is (thrown?
         clojure.lang.ExceptionInfo
         (query->params-map (query-with-snippet)))))
  (testing "If no such Snippet exists, it should throw an Exception"
    (is (thrown?
         clojure.lang.ExceptionInfo
         (query->params-map (query-with-snippet :snippet-id Integer/MAX_VALUE))))))

(deftest snippet-happy-path-test
  (testing "Snippet parsing should work correctly for a valid Snippet"
    (t2.with-temp/with-temp [NativeQuerySnippet {snippet-id :id} {:name    "expensive-venues"
                                                                  :content "venues WHERE price = 4"}]
      (let [expected {"expensive-venues" (params/map->ReferencedQuerySnippet {:snippet-id snippet-id
                                                                              :content    "venues WHERE price = 4"})}]
        (is (= expected
               (query->params-map (query-with-snippet :snippet-id snippet-id))))

        (testing "`:snippet-name` property in query shouldn't have to match `:name` of Snippet in DB"
          (is (= expected
                 (query->params-map (query-with-snippet :snippet-id snippet-id, :snippet-name "Old Name")))))))))

(deftest ^:parallel invalid-param-test
  (testing "Should throw an Exception if we try to pass with a `:type` we don't understand"
    (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                       :template-tags {"x" {:name "x"
                                            :type :writer}})]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (query->params-map query))))))

(deftest ^:parallel dont-be-too-strict-test
  (testing "values-for-tag should allow unknown keys (used only by FE) (#13868)"
    (testing "\nUnknown key 'filteringParameters'"
      (testing "in tag"
        (is (= "2"
               (value-for-tag
                {:name                "id"
                 :display-name        "ID"
                 :type                :text
                 :required            true
                 :default             "100"
                 :filteringParameters "222b245f"}
                [{:type   :category
                  :target [:variable [:template-tag "id"]]
                  :value  "2"}]))))
      (testing "in params"
        (is (= "2"
               (value-for-tag
                {:name         "id"
                 :display-name "ID"
                 :type         :text
                 :required     true
                 :default      "100"}
                [{:type                :category
                  :target              [:variable [:template-tag "id"]]
                  :value               "2"
                  :filteringParameters "222b245f"}])))))))

(deftest ^:parallel parse-card-include-parameters-test
  (testing "Parsing a Card reference should return a `ReferencedCardQuery` record that includes its parameters (#12236)"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:cards [(assoc (lib.tu/mock-cards :orders)
                                                      :id 1
                                                      :dataset-query (lib.tu.macros/mbql-query orders
                                                                       {:filter      [:between $total 30 60]
                                                                        :aggregation [[:aggregation-options
                                                                                       [:count-where [:starts-with $product-id->products.category "G"]]
                                                                                       {:name "G Monies", :display-name "G Monies"}]]
                                                                        :breakout    [!month.created-at]}))]})
      (is (=? {:card-id 1
               :query   (every-pred string? (complement str/blank?))
               :params  ["G%"]}
              (#'params.values/parse-tag
               {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                :name         "#1"
                :display-name "#1"
                :type         :card
                :card-id      1}
               nil))))))

(deftest ^:parallel no-value-template-tag-defaults-test
  (testing "should throw an Exception if no :value is specified for a required parameter, even if defaults are provided"
    (mt/dataset test-data
      (testing "Field filters"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You'll need to pick a value for 'Filter' before this query can run."
             (query->params-map
              {:template-tags {"filter"
                               {:id           "xyz456"
                                :name         "filter"
                                :display-name "Filter"
                                :type         :dimension
                                :dimension    [:field (mt/id :products :category) nil]
                                :widget-type  :category
                                :default      ["Gizmo" "Gadget"]
                                :required     true}}
               :parameters    [{:type    :string/=
                                :id      "abc123"
                                :default ["Widget"]
                                :target  [:dimension [:template-tag "filter"]]}]})))))))

(deftest ^:parallel no-value-template-tag-defaults-raw-value-test
  (testing "should throw an Exception if no :value is specified for a required parameter, even if defaults are provided"
    (testing "Raw value template tags"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You'll need to pick a value for 'Filter' before this query can run."
           (query->params-map
            {:template-tags {"filter"
                             {:id           "f0774ef5-a14a-e181-f557-2d4bb1fc94ae"
                              :name         "filter"
                              :display-name "Filter"
                              :type         :text
                              :required     true
                              :default      "Foo"}}
             :parameters    [{:type    :string/=
                              :id      "5791ff38"
                              :default "Bar"
                              :target  [:variable [:template-tag "filter"]]}]}))))))

(deftest ^:parallel nil-value-parameter-template-tag-default-test
  (testing "Default values passed in as part of the request should not apply when the value is nil"
    (mt/dataset test-data
      (testing "Field filters"
        (is (=? {"filter" {:value ::params/no-value}}
                (query->params-map
                 {:template-tags {"filter"
                                  {:id           "xyz456"
                                   :name         "filter"
                                   :display-name "Filter"
                                   :type         :dimension
                                   :dimension    [:field (mt/id :products :category) nil]
                                   :widget-type  :category
                                   :default      ["Gizmo" "Gadget"]}}
                  :parameters    [{:type    :string/=
                                   :id      "abc123"
                                   :default ["Widget"]
                                   :value   nil
                                   :target  [:dimension [:template-tag "filter"]]}]})))))))

(deftest ^:parallel nil-value-parameter-template-tag-default-raw-value-test
  (testing "Raw value template tags"
    (is (= {"filter" ::params/no-value}
           (query->params-map
            {:template-tags {"filter"
                             {:id           "f0774ef5-a14a-e181-f557-2d4bb1fc94ae"
                              :name         "filter"
                              :display-name "Filter"
                              :type         :text
                              :default      "Foo"}}
             :parameters    [{:type    :string/=
                              :id      "5791ff38"
                              :default "Bar"
                              :target  [:variable [:template-tag "filter"]]}]})))))

(deftest ^:parallel field-filter-multiple-values-test
  (testing "Make sure multiple values get returned the way we'd expect"
    (is (=? {"checkin_date" {:value [{:type :date/range, :value "2015-01-01~2016-09-01"}
                                     {:type :date/single, :value "2015-07-01"}]}}
            (query->params-map
             {:template-tags {"checkin_date" {:name         "checkin_date"
                                              :display-name "Checkin Date"
                                              :type         :dimension
                                              :widget-type  :date/all-options
                                              :dimension    [:field (mt/id :checkins :date) nil]}}
              :parameters    [{:type   :date/range
                               :target [:dimension [:template-tag "checkin_date"]]
                               :value  "2015-01-01~2016-09-01"}
                              {:type   :date/single
                               :target [:dimension [:template-tag "checkin_date"]]
                               :value  "2015-07-01"}]})))))

(deftest ^:parallel use-parameter-defaults-test
  (testing "If parameter specifies a default value (but tag does not), don't use the default when the value is nil"
    (mt/dataset test-data
      (testing "Field filters"
        (is (=? {"filter" {:value ::params/no-value}}
                (query->params-map
                 {:template-tags {"filter"
                                  {:id           "xyz456"
                                   :name         "filter"
                                   :display-name "Filter"
                                   :type         :dimension
                                   :dimension    [:field (mt/id :products :category) nil]
                                   :widget-type  :category}}
                  :parameters    [{:type    :string/=
                                   :id      "abc123"
                                   :default ["Widget"]
                                   :value   nil
                                   :target  [:dimension [:template-tag "filter"]]}]})))))))

(deftest ^:parallel use-parameter-defaults-raw-value-template-tags-test
  (testing "If parameter specifies a default value (but tag does not), don't use the default when the value is nil"
    (testing "Raw value template tags"
      (is (= {"filter" ::params/no-value}
             (query->params-map
              {:template-tags {"filter"
                               {:id           "f0774ef5-a14a-e181-f557-2d4bb1fc94ae"
                                :name         "filter"
                                :display-name "Filter"
                                :type         :text}}
               :parameters    [{:type    :string/=
                                :id      "5791ff38"
                                :default "Bar"
                                :value   nil
                                :target  [:variable [:template-tag "filter"]]}]}))))))

(deftest ^:parallel value->number-test
  (testing `params.values/value->number
    (testing "should handle a vector"
      (testing "of strings"
        (is (= 1
               (#'params.values/value->number ["1"]))))
      (testing "of numbers (#20845)"
        (is (= 1
               (#'params.values/value->number [1])))))))

(deftest ^:parallel handle-referenced-card-parameter-mixed-with-other-parameters-test
  (testing "Should be able to handle for Card ref params regardless of whether other params are passed in (#21246)\n"
    (mt/dataset test-data
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [(lib.tu.macros/mbql-query products)])
        (let [param-name    "#1"
              template-tags {param-name {:type         :card
                                         :card-id      1
                                         :display-name param-name
                                         :id           "__source__"
                                         :name         param-name}}]
          (testing "With no parameters passed in"
            (is (=? {param-name ReferencedCardQuery}
                    (query->params-map {:template-tags template-tags}))))
          (testing "WITH parameters passed in"
            (let [parameters [{:type   :date/all-options
                               :value  "2022-04-20"
                               :target [:dimension [:template-tag "created_at"]]}]]
              (is (=? {param-name ReferencedCardQuery}
                      (query->params-map {:template-tags template-tags
                                          :parameters    parameters}))))))))))

(deftest ^:parallel handle-dashboard-parameters-without-values-test
  (testing "dash params for a template tag may have no :value or :default (#38012)"
    (mt/dataset test-data
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [(lib.tu.macros/mbql-query orders)
                                         (lib/with-template-tags
                                           (lib/native-query meta/metadata-provider
                                                             "SELECT * FROM Orders WHERE {{createdAt}}")
                                           {"createdAt"
                                            {:type         :dimension
                                             :dimension    #_[:field (meta/id :orders :created-at)]
                                             (lib/ref (meta/field-metadata :orders :created-at))
                                             :name         "createdAt"
                                             :id           "4636d745-1467-4a70-ba20-2a08069d77ff"
                                             :display-name "CreatedAt"
                                             :widget-type  :date/all-options}})])
        (let [template-tags {"createdAt" {:type         :dimension
                                          :dimension    [:field (meta/id :orders :created-at) {}]
                                          :name         "createdAt"
                                          :id           "4636d745-1467-4a70-ba20-2a08069d77ff"
                                          :display-name "CreatedAt"
                                          :widget-type  :date/all-options}}]

          (testing "with no parameters given, no value"
            (is (=? {"createdAt" {:field {:lib/type :metadata/column}
                                  :value params/no-value}}
                    (query->params-map {:template-tags template-tags}))))
          (testing "with parameters given but blank, no value"
            (is (=? {"createdAt" {:field {:lib/type :metadata/column}
                                  :value params/no-value}}
                    (query->params-map {:template-tags template-tags
                                        :parameters    [{:type   :date/relative
                                                         :value  nil
                                                         :target [:dimension [:template-tag "createdAt"]]}
                                                        {:type   :date/month-year
                                                         :value  nil
                                                         :target [:dimension [:template-tag "createdAt"]]}]}))))
          (testing "with only the relative date parameter set, use it"
            (is (=? {"createdAt" {:field {:lib/type :metadata/column}
                                  :value {:type  :date/relative
                                          :value "past30days"}}}
                    (query->params-map {:template-tags template-tags
                                        :parameters    [{:type   :date/relative
                                                         :value  "past30days"
                                                         :target [:dimension [:template-tag "createdAt"]]}
                                                        {:type   :date/month-year
                                                         :value  nil
                                                         :target [:dimension [:template-tag "createdAt"]]}]}))))
          (testing "with only the month-year parameter set, use it"
            (is (=? {"createdAt" {:field {:lib/type :metadata/column}
                                  :value {:type  :date/month-year
                                          :value "2023-01"}}}
                    (query->params-map {:template-tags template-tags
                                        :parameters    [{:type   :date/relative
                                                         :value  nil
                                                         :target [:dimension [:template-tag "createdAt"]]}
                                                        {:type   :date/month-year
                                                         :value  "2023-01"
                                                         :target [:dimension [:template-tag "createdAt"]]}]}))))
          (testing "with both parameters set, use both"
            (is (=? {"createdAt" {:field {:lib/type :metadata/column}
                                  :value [{:type  :date/relative
                                           :value "past30days"}
                                          {:type  :date/month-year
                                           :value "2023-01"}]}}
                    (query->params-map {:template-tags template-tags
                                        :parameters    [{:type   :date/relative
                                                         :value  "past30days"
                                                         :target [:dimension [:template-tag "createdAt"]]}
                                                        {:type   :date/month-year
                                                         :value  "2023-01"
                                                         :target [:dimension [:template-tag "createdAt"]]}]})))))))))

(deftest ^:parallel referenced-card-ids-test
  (mt/with-temp [:model/Card {card-1-id :id} {:collection_id nil
                                              :dataset_query (mt/mbql-query venues {:limit 2})}
                 :model/Card {card-2-id :id} {:collection_id nil
                                              :dataset_query (mt/native-query
                                                              {:query         "SELECT * FROM {{card}}"
                                                               :template-tags {"card" {:name         "card"
                                                                                       :display-name "card"
                                                                                       :type         :card
                                                                                       :card-id      card-1-id}}})}]
    ;; even tho Card 2 references Card 1, we don't want to include it in the set of referenced Card IDs, since you
    ;; should only need permissions for Card 2 to be able to run the query (see #15131)
    (testing (format "Card 1 ID = %d, Card 2 ID = %d" card-1-id card-2-id)
      (mt/with-metadata-provider (mt/id)
        (is (=? #{card-2-id}
                (params.values/referenced-card-ids (params.values/query->params-map
                                                    {:query         "SELECT * FROM {{card}}"
                                                     :template-tags {"card" {:name         "card"
                                                                             :display-name "card"
                                                                             :type         :card
                                                                             :card-id      card-2-id}}}))))))))
