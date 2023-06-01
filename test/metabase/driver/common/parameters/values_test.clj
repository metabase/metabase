(ns metabase.driver.common.parameters.values-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Card Collection NativeQuerySnippet]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (clojure.lang ExceptionInfo)
   (java.util UUID)
   (metabase.driver.common.parameters ReferencedCardQuery)))

(set! *warn-on-reflection* true)

(def ^:private test-uuid (str (UUID/randomUUID)))

(deftest variable-value-test
  (mt/with-everything-store
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
      (is (= (params/map->CommaSeparatedNumbers {:numbers [20 40]})
             (#'params.values/value-for-tag
              {:name "number_filter", :display-name "ID", :type :number, :required true, :default "100"}
              [{:type :number/=, :value ["20" "40"], :target [:variable [:template-tag "number_filter"]]}]))))

    (testing "Unspecified value"
      (is (= params/no-value
             (#'params.values/value-for-tag {:name "id", :display-name "ID", :type :text} nil))))

    (testing "Default used"
      (is (= "100"
             (#'params.values/value-for-tag
              {:name "id", :display-name "ID", :type :text, :required true, :default "100"} nil))))))

(defn- value-for-tag
  "Call the private function and de-recordize the field"
  [field-info info]
  (mt/with-everything-store
    (mt/derecordize (#'params.values/value-for-tag field-info info))))

(defn- extra-field-info
  "Add extra field information like coercion_strategy, semantic_type, and effective_type."
  [field]
  (mt/derecordize
   (merge (mt/with-everything-store (qp.store/field (u/the-id field)))
          field)))

(defn parse-tag
  [field-info info]
  (mt/with-everything-store
    (mt/derecordize (#'params.values/parse-tag field-info info))))

(deftest field-filter-test
  (testing "specified"
    (testing "date range for a normal :type/Temporal field, targeted by name"
      (is (= {:field (extra-field-info
                      {:id            (mt/id :checkins :date)
                       :name          "DATE"
                       :parent_id     nil
                       :table_id      (mt/id :checkins)
                       :base_type     :type/Date
                       :semantic_type nil})
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
                :value  "2015-04-01~2015-05-01"}]))))

    (testing "date range for a normal :type/Temporal field, targeted by id"
      (is (= {:field (extra-field-info
                      {:id            (mt/id :checkins :date)
                       :name          "DATE"
                       :parent_id     nil
                       :table_id      (mt/id :checkins)
                       :base_type     :type/Date
                       :semantic_type nil})
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
                :value  "2015-04-01~2015-05-01"}]))))

    (testing "date range for a UNIX timestamp field should work just like a :type/Temporal field (#11934)"
      (mt/dataset tupac-sightings
        (mt/$ids sightings
          (is (= {:field (extra-field-info
                          {:id                %timestamp
                           :name              "TIMESTAMP"
                           :parent_id         nil
                           :table_id          $$sightings
                           :base_type         :type/BigInteger
                           :effective_type    :type/Instant
                           :coercion_strategy :Coercion/UNIXSeconds->DateTime})
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

  (testing "unspecified"
    (is (= {:field (extra-field-info
                    {:id            (mt/id :checkins :date)
                     :name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
            :value params/no-value}
           (value-for-tag
            {:name         "checkin_date"
             :display-name "Checkin Date"
             :type         :dimension
             :widget-type  :date/all-options
             :dimension    [:field (mt/id :checkins :date) nil]}
            nil))))

  (testing "id requiring casting"
    (is (= {:field (extra-field-info
                    {:id            (mt/id :checkins :id)
                     :name          "ID"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/BigInteger
                     :semantic_type :type/PK})
            :value {:type  :id
                    :value 5}}
           (value-for-tag
            {:name         "id"
             :display-name "ID"
             :type         :dimension
             :widget-type  :number
             :dimension    [:field (mt/id :checkins :id) nil]}
            [{:type :id, :target [:dimension [:template-tag "id"]], :value "5"}]))))

  (testing "required but unspecified"
    (is (thrown? Exception
                 (value-for-tag
                  {:name         "checkin_date"
                   :display-name "Checkin Date"
                   :type         :dimension
                   :widget-type  :date/all-options
                   :required     true
                   :dimension    [:field (mt/id :checkins :date) nil]}
                  nil))))

  (testing "required and default specified"
    (is (= {:field (extra-field-info
                    {:id            (mt/id :checkins :date)
                     :name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
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
            nil))))


  (testing "multiple values for the same tag should return a vector with multiple params instead of a single param"
    (is (= {:field (extra-field-info
                    {:id            (mt/id :checkins :date)
                     :name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
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
              :value  "2015-07-01"}]))))

  (testing "Make sure defaults values get picked up for field filter clauses"
    (is (= {:field (extra-field-info
                    {:id            (mt/id :checkins :date)
                     :name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
            :value {:type  :date/all-options
                    :value "past5days"}}
           (parse-tag
            {:name         "checkin_date"
             :display-name "Checkin Date"
             :type         :dimension
             :dimension    [:field (mt/id :checkins :date) nil]
             :default      "past5days"
             :widget-type  :date/all-options}
            nil))))
  (testing "Make sure nil values result in no value"
    (is (= {:field (extra-field-info
                    {:id             (mt/id :checkins :date)
                     :name           "DATE"
                     :parent_id      nil
                     :table_id       (mt/id :checkins)
                     :base_type      :type/Date
                     :effective_type :type/Date})
            :value params/no-value}
           (parse-tag
            {:name         "checkin_date"
             :display-name "Checkin Date"
             :type         :dimension
             :dimension    [:field (mt/id :checkins :date) nil]
             :widget-type  :date/all-options}
            nil)))))

(defn- query->params-map [query]
  (mt/with-everything-store (params.values/query->params-map query)))

(deftest field-filter-errors-test
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



(deftest card-query-test
  (mt/with-test-user :rasta
    (testing "Card query template tag gets card's native query"
      (let [test-query "SELECT 1"]
        (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id)
                                                            :type     "native"
                                                            :native   {:query test-query}}}]
          (is (= {:card-id (u/the-id card), :query test-query, :params nil}
                 (value-for-tag
                  {:name         "card-template-tag-test"
                   :display-name "Card template tag test"
                   :type         :card
                   :card-id      (:id card)}
                  []))))))

    (testing "Card query template tag generates native query for MBQL query"
      (mt/with-everything-store
        (driver/with-driver :h2
          (let [mbql-query   (mt/mbql-query venues
                               {:database (mt/id)
                                :filter   [:< [:field $price nil] 3]})
                expected-sql (str "SELECT "
                                  "\"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", "
                                  "\"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", "
                                  "\"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", "
                                  "\"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", "
                                  "\"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", "
                                  "\"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                                  "FROM \"PUBLIC\".\"VENUES\" "
                                  "WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" < 3 "
                                  "LIMIT 1048575")]
            (t2.with-temp/with-temp [Card card {:dataset_query mbql-query}]
              (is (= {:card-id (u/the-id card), :query expected-sql, :params nil}
                     (value-for-tag
                      {:name         "card-template-tag-test"
                       :display-name "Card template tag test"
                       :type         :card
                       :card-id      (:id card)}
                      []))))))))

    (testing "Persisted Models are substituted"
      (mt/test-driver :postgres
        (mt/dataset test-data
          (mt/with-persistence-enabled [persist-models!]
            (let [mbql-query (mt/mbql-query categories)]
              (mt/with-temp* [Card [model {:name "model"
                                           :dataset true
                                           :dataset_query mbql-query
                                           :database_id (mt/id)}]]
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
                                                     :card-id (u/the-id model)}}}}))))))))))))))

    (testing "Card query template tag wraps error in tag details"
      (t2.with-temp/with-temp [Card param-card {:dataset_query
                                                (mt/native-query
                                                  {:query "SELECT {{x}}"
                                                   :template-tags
                                                   {"x"
                                                    {:id   "x-tag", :name     "x", :display-name "Number x",
                                                     :type :number, :required false}}})}]
        (let [param-card-id  (:id param-card)
              param-card-tag (str "#" param-card-id)]
          (t2.with-temp/with-temp [Card card {:dataset_query
                                              (mt/native-query
                                                {:query (str "SELECT * FROM {{#" param-card-id "}} AS y")
                                                 :template-tags
                                                 {param-card-tag
                                                  {:id   param-card-tag, :name    param-card-tag, :display-name param-card-tag
                                                   :type "card",         :card-id param-card-id}}})}]
            (let [card-id  (:id card)
                  tag      {:name "card-template-tag-test", :display-name "Card template tag test",
                            :type :card,                    :card-id      card-id}
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
                (is (= card-id
                       (:card-id exc-data))))
              (testing "tag"
                (is (= tag
                       (:tag exc-data)))))))))))

(deftest card-query-permissions-test
  (testing "We should be able to run a query referenced via a template tag if we have perms for the Card in question (#12354)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
        (mt/with-temp* [Collection [collection]
                        Card       [{card-1-id :id} {:collection_id (u/the-id collection)
                                                     :dataset_query (mt/mbql-query venues
                                                                      {:order-by [[:asc $id]], :limit 2})}]
                        Card       [card-2 {:collection_id (u/the-id collection)
                                            :dataset_query (mt/native-query
                                                             {:query         "SELECT * FROM {{card}}"
                                                              :template-tags {"card" {:name         "card"
                                                                                      :display-name "card"
                                                                                      :type         :card
                                                                                      :card-id      card-1-id}}})}]]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (mt/with-test-user :rasta
            (binding [qp.perms/*card-id* (u/the-id card-2)]
              (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3]
                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]
                     (mt/rows
                      (qp/process-query (:dataset_query card-2))))))))))))

(deftest card-query-errors-test
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

(deftest snippet-test
  (letfn [(query-with-snippet [& {:as snippet-properties}]
            (assoc (mt/native-query "SELECT * FROM {{expensive-venues}}")
                   :template-tags {"expensive-venues" (merge
                                                       {:type         :snippet
                                                        :name         "expensive-venues"
                                                        :display-name "Expensive Venues"
                                                        :snippet-name "expensive-venues"}
                                                       snippet-properties)}))]
    (testing "`:snippet-id` should be required"
      (is (thrown?
           clojure.lang.ExceptionInfo
           (query->params-map (query-with-snippet)))))

    (testing "If no such Snippet exists, it should throw an Exception"
      (is (thrown?
           clojure.lang.ExceptionInfo
           (query->params-map (query-with-snippet :snippet-id Integer/MAX_VALUE)))))

    (testing "Snippet parsing should work correctly for a valid Snippet"
      (t2.with-temp/with-temp [NativeQuerySnippet {snippet-id :id} {:name    "expensive-venues"
                                                                    :content "venues WHERE price = 4"}]
        (let [expected {"expensive-venues" (params/map->ReferencedQuerySnippet {:snippet-id snippet-id
                                                                                :content    "venues WHERE price = 4"})}]
          (is (= expected
                 (query->params-map (query-with-snippet :snippet-id snippet-id))))

          (testing "`:snippet-name` property in query shouldn't have to match `:name` of Snippet in DB"
            (is (= expected
                   (query->params-map (query-with-snippet :snippet-id snippet-id, :snippet-name "Old Name"))))))))))

(deftest invalid-param-test
  (testing "Should throw an Exception if we try to pass with a `:type` we don't understand"
    (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                       :template-tags {"x" {:name "x"
                                            :type :writer}})]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (query->params-map query))))))

(deftest dont-be-too-strict-test
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

(deftest parse-card-include-parameters-test
  (testing "Parsing a Card reference should return a `ReferencedCardQuery` record that includes its parameters (#12236)"
    (mt/dataset sample-dataset
      (t2.with-temp/with-temp [Card card {:dataset_query (mt/mbql-query orders
                                                           {:filter      [:between $total 30 60]
                                                            :aggregation [[:aggregation-options
                                                                           [:count-where [:starts-with $product_id->products.category "G"]]
                                                                           {:name "G Monies", :display-name "G Monies"}]]
                                                            :breakout    [!month.created_at]})}]
        (let [card-tag (str "#" (u/the-id card))]
          (is (schema= {:card-id  (s/eq (u/the-id card))
                        :query    su/NonBlankString
                        :params   (s/eq ["G%"])
                        s/Keyword s/Any}
                       (#'params.values/parse-tag
                        {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                         :name         card-tag
                         :display-name card-tag
                         :type         :card
                         :card-id      (u/the-id card)}
                        nil))))))))

(deftest prefer-template-tag-default-test
  (testing "Default values in a template tag should take precedence over default values passed in as part of the request"
    ;; Dashboard parameter mappings can have their own defaults specified, and those get passed in as part of the
    ;; request parameter. If the template tag also specifies a default, we should prefer that.
    (mt/dataset sample-dataset
      (testing "Field filters"
        (is (schema= {(s/eq "filter") {:value    {:type     (s/eq :category)
                                                  :value    (s/eq ["Gizmo" "Gadget"])
                                                  s/Keyword s/Any}
                                       s/Keyword s/Any}}
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
                                        :target  [:dimension [:template-tag "filter"]]}]}))))

      (testing "Raw value template tags"
        (is (= {"filter" "Foo"}
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
                                  :target  [:variable [:template-tag "filter"]]}]})))))))

(deftest field-filter-multiple-values-test
  (testing "Make sure multiple values get returned the way we'd expect"
    (is (schema= {(s/eq "checkin_date") {:value    (s/eq [{:type :date/range, :value "2015-01-01~2016-09-01"}
                                                          {:type :date/single, :value "2015-07-01"}])
                                         s/Keyword s/Any}}
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

(deftest use-parameter-defaults-test
  (testing "If parameter specifies a default value (but tag does not), use the parameter's default"
    (mt/dataset sample-dataset
      (testing "Field filters"
        (is (schema= {(s/eq "filter") {:value    {:type     (s/eq :string/=)
                                                  :default  (s/eq ["Widget"])
                                                  s/Keyword s/Any}
                                       s/Keyword s/Any}}
                     (query->params-map
                      {:template-tags {"filter"
                                       {:id           "xyz456"
                                        :name         "filter"
                                        :display-name "Filter"
                                        :type         :dimension
                                        :dimension    [:field (mt/id :products :category) nil]
                                        :widget-type  :category
                                        :required     true}}
                       :parameters    [{:type    :string/=
                                        :id      "abc123"
                                        :default ["Widget"]
                                        :target  [:dimension [:template-tag "filter"]]}]}))))

      (testing "Raw value template tags"
        (is (= {"filter" "Bar"}
               (query->params-map
                {:template-tags {"filter"
                                 {:id           "f0774ef5-a14a-e181-f557-2d4bb1fc94ae"
                                  :name         "filter"
                                  :display-name "Filter"
                                  :type         :text
                                  :required     true}}
                 :parameters    [{:type    :string/=
                                  :id      "5791ff38"
                                  :default "Bar"
                                  :target  [:variable [:template-tag "filter"]]}]})))))))

(deftest value->number-test
  (testing `params.values/value->number
    (testing "should handle a vector"
      (testing "of strings"
        (is (= 1
               (#'params.values/value->number ["1"]))))
      (testing "of numbers (#20845)"
        (is (= 1
               (#'params.values/value->number [1])))))))

(deftest handle-referenced-card-parameter-mixed-with-other-parameters-test
  (testing "Should be able to handle for Card ref params regardless of whether other params are passed in (#21246)\n"
    (mt/dataset sample-dataset
      (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (mt/mbql-query products)}]
        (let [param-name    (format "#%d" card-id)
              template-tags {param-name {:type         :card
                                         :card-id      card-id
                                         :display-name param-name
                                         :id           "__source__"
                                         :name         param-name}}]
          (testing "With no parameters passed in"
            (is (schema= {(s/eq param-name) ReferencedCardQuery}
                         (params.values/query->params-map {:template-tags template-tags}))))
          (testing "WITH parameters passed in"
            (let [parameters [{:type   :date/all-options
                               :value  "2022-04-20"
                               :target [:dimension [:template-tag "created_at"]]}]]
              (is (schema= {(s/eq param-name) ReferencedCardQuery}
                           (params.values/query->params-map {:template-tags template-tags
                                                             :parameters    parameters}))))))))))
