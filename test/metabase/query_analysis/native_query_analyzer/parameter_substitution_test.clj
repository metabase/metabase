(ns ^:parallel metabase.query-analysis.native-query-analyzer.parameter-substitution-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.lib.native :as lib-native]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.query-analysis.native-query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private ->sql (comp :query nqa.sub/replace-tags))

(def ^:private tag-definitions
  (delay
    { ;; Normal variables
     "source"        {:type         :text
                      :display-name "Source"
                      :name         "source"}
     "favorite_nbr"  {:type         :number
                      :display-name "Fav"
                      :name         "favorite_nbr"}
     "created"       {:type         :date
                      :display-name "Genesis"
                      :name         "created"}
     ;; Time granularity
     "time_unit"     {:type         :temporal-unit
                      :display-name "Unit"
                      :name         "time_unit"}
     ;; Field Filters: Dates
     "created_range" {:type         :dimension,
                      :name         "created_range"
                      :display-name "Created At :)"
                      :dimension    [:field (mt/id :people :created_at) {:base-type :type/Date}]
                      :widget-type  :date/range}
     "created_my"    {:type         :dimension,
                      :name         "created_my"
                      :display-name "Created At :)"
                      :dimension    [:field (mt/id :people :created_at) {:base-type :type/Date}]
                      :widget-type  :date/month-year}
     "created_qy"    {:type         :dimension,
                      :name         "created_qy"
                      :display-name "Created At :)"
                      :dimension    [:field (mt/id :people :created_at) {:base-type :type/Date}]
                      :widget-type  :date/quarter-year}
     "created_rel"   {:type         :dimension,
                      :name         "created_rel"
                      :display-name "Created At :)"
                      :dimension    [:field (mt/id :people :created_at) {:base-type :type/Date}]
                      :widget-type  :date/relative}
     "date_ao"       {:type         :dimension,
                      :name         "date_ao"
                      :display-name "Date: All Options"
                      :dimension    [:field (mt/id :people :created_at) {:base-type :type/Date}]
                      :widget-type  :date/all-options}
     ;; Field Filters: Numbers
     "num_not_eq"    {:type         :dimension,
                      :name         "num_not_eq"
                      :display-name "!="
                      :dimension    [:field (mt/id :orders :total) {:base-type :type/Number}]
                      :widget-type  :number/!=}
     "num_lte"       {:type         :dimension,
                      :name         "num_lte"
                      :display-name "<="
                      :dimension    [:field (mt/id :orders :total) {:base-type :type/Number}]
                      :widget-type  :number/<=}
     "num_eq"        {:type         :dimension,
                      :name         "num_eq"
                      :display-name "="
                      :dimension    [:field (mt/id :orders :total) {:base-type :type/Number}]
                      :widget-type  :number/=}
     "num_gte"       {:type         :dimension,
                      :name         "num_gte"
                      :display-name ">="
                      :dimension    [:field (mt/id :orders :total) {:base-type :type/Number}]
                      :widget-type  :number/>=}
     "num_between"   {:type         :dimension,
                      :name         "num_between"
                      :display-name "Betwixt"
                      :dimension    [:field (mt/id :orders :total) {:base-type :type/Number}]
                      :widget-type  :number/between}
     ;; Field Filters: Strings
     "str_not_eq"    {:type         :dimension,
                      :name         "str_not_eq"
                      :display-name "String !="
                      :dimension    [:field (mt/id :people :name) {:base-type :type/Text}]
                      :widget-type  :string/!=}
     "str_eq"        {:type         :dimension,
                      :name         "str_eq"
                      :display-name "String ="
                      :dimension    [:field (mt/id :people :name) {:base-type :type/Text}]
                      :widget-type  :string/=}
     "str_contains"  {:type         :dimension,
                      :name         "str_contains"
                      :display-name "String Contains"
                      :dimension    [:field (mt/id :people :name) {:base-type :type/Text}]
                      :widget-type  :string/contains}
     "str_dnc"       {:type         :dimension,
                      :name         "str_dnc"
                      :display-name "String Does Not Contain"
                      :dimension    [:field (mt/id :people :name) {:base-type :type/Text}]
                      :widget-type  :string/does-not-contain}
     "str_ends"      {:type         :dimension,
                      :name         "str_ends"
                      :display-name "String Ends With"
                      :dimension    [:field (mt/id :people :name) {:base-type :type/Text}]
                      :widget-type  :string/ends-with}
     "str_starts"    {:type         :dimension,
                      :name         "str_starts"
                      :display-name "String Starts With"
                      :dimension    [:field (mt/id :people :name) {:base-type :type/Text}]
                      :widget-type  :string/starts-with}}))

(defn- tags
  [& ts]
  (select-keys @tag-definitions ts))

(deftest basic-variables-test
  (testing "text variable"
    (is (= "SELECT * FROM people WHERE source = ?"
           (->sql (mt/native-query {:template-tags (tags "source")
                                    :query "SELECT * FROM people WHERE source = {{source}}"})))))
  (testing "number variable"
    (is (= "SELECT * FROM people WHERE favorite_number = 1" ; Numbers are put right in, no `?`
           (->sql (mt/native-query {:template-tags (tags "favorite_nbr")
                                    :query "SELECT * FROM people WHERE favorite_number = {{favorite_nbr}}"})))))
  (testing "date variable"
    (is (= "SELECT * FROM people WHERE created_at = ?"
           (->sql (mt/native-query {:template-tags (tags "created")
                                    :query "SELECT * FROM people WHERE created_at = {{created}}"}))))))

(deftest many-variables-test
  (is (= "SELECT * FROM people WHERE source = ? AND favorite_number = 1 AND created_at = ?"
         (->sql (mt/native-query {:template-tags (tags "source" "favorite_nbr" "created")
                                  :query         (str "SELECT * FROM people WHERE source = {{source}} AND "
                                                      "favorite_number = {{favorite_nbr}} AND created_at = "
                                                      "{{created}}")})))))

(deftest optional-test
  (is (= "SELECT * FROM people WHERE  source = ? AND favorite_number = 1  AND created_at = ?"
         (->sql (mt/native-query {:template-tags (tags "source" "favorite_nbr" "created")
                                  :query         (str "SELECT * FROM people WHERE [[ source = {{source}} AND ]]"
                                                      "favorite_number = {{favorite_nbr}} [[ AND created_at = "
                                                      "{{created}} ]]")})))))

(deftest field-filter-date-test
  (doseq [date-filter ["created_range" "created_my" "created_qy" "created_rel" "date_ao"]]
    (is (= "SELECT * FROM people WHERE \"PUBLIC\".\"PEOPLE\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"PEOPLE\".\"CREATED_AT\" < ?"
           (->sql (mt/native-query {:template-tags (tags date-filter)
                                    :query         (format "SELECT * FROM people WHERE {{%s}}" date-filter)}))))))

(deftest field-filter-number-test
  ;; :number/!=
  (is (= "SELECT * FROM orders WHERE ((\"PUBLIC\".\"ORDERS\".\"TOTAL\" <> 1) OR (\"PUBLIC\".\"ORDERS\".\"TOTAL\" IS NULL))"
         (->sql (mt/native-query {:template-tags (tags "num_not_eq")
                                  :query         "SELECT * FROM orders WHERE {{num_not_eq}}"}))))
  ;; :number/<=
  (is (= "SELECT * FROM orders WHERE (\"PUBLIC\".\"ORDERS\".\"TOTAL\" <= 1)"
         (->sql (mt/native-query {:template-tags (tags "num_lte")
                                  :query         "SELECT * FROM orders WHERE {{num_lte}}"}))))
  ;; :number/=
  (is (= "SELECT * FROM orders WHERE (\"PUBLIC\".\"ORDERS\".\"TOTAL\" = 1)"
         (->sql (mt/native-query {:template-tags (tags "num_eq")
                                  :query         "SELECT * FROM orders WHERE {{num_eq}}"}))))
  ;; :number/>=
  (is (= "SELECT * FROM orders WHERE (\"PUBLIC\".\"ORDERS\".\"TOTAL\" >= 1)"
         (->sql (mt/native-query {:template-tags (tags "num_gte")
                                  :query         "SELECT * FROM orders WHERE {{num_gte}}"}))))
  ;; :number/between
  (is (= "SELECT * FROM orders WHERE \"PUBLIC\".\"ORDERS\".\"TOTAL\" BETWEEN 1 AND 2"
         (->sql (mt/native-query {:template-tags (tags "num_between")
                                  :query         "SELECT * FROM orders WHERE {{num_between}}"})))))

(deftest optional-field-filter-test
    (is (= "SELECT * FROM orders WHERE \"PUBLIC\".\"ORDERS\".\"TOTAL\" BETWEEN 1 AND 2 AND (\"PUBLIC\".\"ORDERS\".\"TOTAL\" = 1)"
         (->sql (mt/native-query {:template-tags (tags "num_between" "num_eq")
                                  :query         "SELECT * FROM orders WHERE {{num_between}} [[AND {{num_eq}}]]"})))))

(deftest field-filter-string-test
  (is (= "SELECT * FROM people WHERE ((\"PUBLIC\".\"PEOPLE\".\"NAME\" <> ?) OR (\"PUBLIC\".\"PEOPLE\".\"NAME\" IS NULL))"
         (->sql (mt/native-query {:template-tags (tags "str_not_eq")
                                  :query         "SELECT * FROM people WHERE {{str_not_eq}}"}))))
  (is (= "SELECT * FROM people WHERE (\"PUBLIC\".\"PEOPLE\".\"NAME\" = ?)"
         (->sql (mt/native-query {:template-tags (tags "str_eq")
                                  :query         "SELECT * FROM people WHERE {{str_eq}}"}))))
  (is (= "SELECT * FROM people WHERE (\"PUBLIC\".\"PEOPLE\".\"NAME\" LIKE ?)"
         (->sql (mt/native-query {:template-tags (tags "str_contains")
                                  :query         "SELECT * FROM people WHERE {{str_contains}}"}))))
  (is (= "SELECT * FROM people WHERE (NOT (\"PUBLIC\".\"PEOPLE\".\"NAME\" LIKE ?) OR (\"PUBLIC\".\"PEOPLE\".\"NAME\" IS NULL))"
         (->sql (mt/native-query {:template-tags (tags "str_dnc")
                                  :query         "SELECT * FROM people WHERE {{str_dnc}}"}))))
  (is (= "SELECT * FROM people WHERE (\"PUBLIC\".\"PEOPLE\".\"NAME\" LIKE ?)"
         (->sql (mt/native-query {:template-tags (tags "str_ends")
                                  :query         "SELECT * FROM people WHERE {{str_ends}}"}))))
  (is (= "SELECT * FROM people WHERE (\"PUBLIC\".\"PEOPLE\".\"NAME\" LIKE ?)"
         (->sql (mt/native-query {:template-tags (tags "str_starts")
                                  :query         "SELECT * FROM people WHERE {{str_starts}}"})))))

(deftest snippet-test
  (testing "With a snippet"
    (t2.with-temp/with-temp
      [:model/NativeQuerySnippet {snippet-id :id} {:name    "a lovely snippet"
                                                   :content "where total > 10"}]
      (let [og-query "SELECT total FROM orders {{snippet: a lovely snippet}}"]
        (is (= "SELECT total FROM orders where total > 10"
               (->sql (mt/native-query {:query         og-query
                                        :template-tags (assoc-in (lib-native/extract-template-tags og-query)
                                                                 ["snippet: a lovely snippet" :snippet-id]
                                                                 snippet-id)}))))))))

(deftest card-ref-test
  (t2.with-temp/with-temp
    [:model/Card {card-id :id} {:type          :model
                                :dataset_query (mt/native-query {:query "select * from checkins"})}]
    (let [q  (format "SELECT * FROM {{#%s}} LIMIT 3" card-id)
          tt (lib-native/extract-template-tags q)]
      (is (= "SELECT * FROM (select * from checkins) LIMIT 3"
             (->sql (mt/native-query {:template-tags tt
                                      :query         q})))))))

(deftest default-values
  (let [blocklist #{;; there's a type check on :template-tags blocking these
                    :date/single
                    :id
                    :category
                    :boolean
                    ;; no valid default for temporal-unit
                    :temporal-unit
                    ;; no longer in use
                    :location/city
                    :location/state
                    :location/zip_code
                    :location/country}
        expected  (set/difference (into #{} (keys lib.schema.parameter/types))
                                  blocklist)
        tag->type (fn [{:keys [type widget-type]}] (if (= type :dimension) widget-type type))]
    (is (set/subset? expected (into #{} (keys nqa.sub/default-values)))
        "Ensure that you have a default value for all types defined in lib.schema.parameter/types")
    (is (set/subset? expected (into #{} (map tag->type (vals @tag-definitions))))
        "Ensure that you have a test for each type defined in lib.schema.parameter/types")))
