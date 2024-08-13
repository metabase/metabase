(ns metabase.driver.sql.parameters.substitute-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.parameters.native :as qp.native]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(defn- optional [& args] (params/->Optional args))
(defn- param [param-name] (params/->Param param-name))

(defn- substitute [parsed param->value]
  (driver/with-driver :h2
    (mt/with-metadata-provider meta/metadata-provider
      (sql.params.substitute/substitute parsed param->value))))

(deftest ^:parallel substitute-test
  (testing "normal substitution"
    (is (= ["select * from foobars where bird_type = ?" ["Steller's Jay"]]
           (substitute
            ["select * from foobars where bird_type = " (param "bird_type")]
            {"bird_type" "Steller's Jay"}))))
  (testing "make sure falsey values are substituted correctly"
    (testing "`nil` should get substituted as `NULL`"
      (is (= ["select * from foobars where bird_type = NULL" []]
             (substitute
              ["select * from foobars where bird_type = " (param "bird_type")]
              {"bird_type" nil})))))
  (testing "`false` should get substituted as `false`"
    (is (= ["select * from foobars where bird_type = FALSE" []]
           (substitute
            ["select * from foobars where bird_type = " (param "bird_type")]
            {"bird_type" false}))))
  (testing "optional substitution -- param present"
    (testing "should preserve whitespace inside optional params"
      (is (= ["select * from foobars  where bird_type = ?" ["Steller's Jay"]]
             (substitute
              ["select * from foobars " (optional " where bird_type = " (param "bird_type"))]
              {"bird_type" "Steller's Jay"})))))
  (testing "optional substitution -- param not present"
    (is (= ["select * from foobars" nil]
           (substitute
            ["select * from foobars " (optional " where bird_type = " (param "bird_type"))]
            {}))))
  (testing "optional -- multiple params -- all present"
    (is (= ["select * from foobars  where bird_type = ? AND color = ?" ["Steller's Jay" "Blue"]]
           (substitute
            ["select * from foobars " (optional " where bird_type = " (param "bird_type") " AND color = " (param "bird_color"))]
            {"bird_type" "Steller's Jay", "bird_color" "Blue"}))))
  (testing "optional -- multiple params -- some present"
    (is (= ["select * from foobars" nil]
           (substitute
            ["select * from foobars " (optional " where bird_type = " (param "bird_type") " AND color = " (param "bird_color"))]
            {"bird_type" "Steller's Jay"}))))
  (testing "nested optionals -- all present"
    (is (= ["select * from foobars  where bird_type = ? AND color = ?" ["Steller's Jay" "Blue"]]
           (substitute
            ["select * from foobars " (optional " where bird_type = " (param "bird_type")
                                                (optional " AND color = " (param "bird_color")))]
            {"bird_type" "Steller's Jay", "bird_color" "Blue"}))))
  (testing "nested optionals -- some present"
    (is (= ["select * from foobars  where bird_type = ?" ["Steller's Jay"]]
           (substitute
            ["select * from foobars " (optional " where bird_type = " (param "bird_type")
                                                (optional " AND color = " (param "bird_color")))]
            {"bird_type" "Steller's Jay"})))))


;;; ------------------------------------------------- Field Filters --------------------------------------------------

(defn- date-field-filter-value
  "Field filter 'values' returned by the `values` namespace are actualy `FieldFilter` record types that contain
  information about"
  []
  (params/map->FieldFilter
   {:field (meta/field-metadata :orders :created-at)
    :value {:type  :date/single
            :value (str (t/offset-date-time "2019-09-20T19:52:00.000-07:00"))}}))

(deftest ^:parallel substitute-field-filter-test
  (testing "field-filters"
    (testing "non-optional"
      (let [query ["select * from orders where " (param "created_at")]]
        (testing "param is present"
          (is (= ["select * from orders where \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?"
                  [(t/zoned-date-time "2019-09-20T19:52:00" (t/zone-id "UTC"))
                   (t/zoned-date-time "2019-09-20T19:53:00" (t/zone-id "UTC"))]]
                 (substitute query {"created_at" (date-field-filter-value)}))))
        (testing "param is missing"
          (is (= ["select * from orders where 1 = 1" []]
                 (substitute query {"created_at" (assoc (date-field-filter-value) :value params/no-value)}))
              "should be replaced with 1 = 1"))))
    (testing "optional"
      (let [query ["select * from orders " (optional "where " (param "created_at"))]]
        (testing "param is present"
          (is (= ["select * from orders where \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?"
                  [(t/zoned-date-time "2019-09-20T19:52:00" (t/zone-id "UTC"))
                   (t/zoned-date-time "2019-09-20T19:53:00" (t/zone-id "UTC"))]]
                 (substitute query {"created_at" (date-field-filter-value)}))))
        (testing "param is missing — should be omitted entirely"
          (is (= ["select * from orders" nil]
                 (substitute query {"created_at" (assoc (date-field-filter-value) :value params/no-value)}))))))))

(deftest ^:parallel substitute-field-filter-test-2
  (testing "new operators"
    (testing "string operators"
      (let [query ["select * from venues where " (param "param")]]
        (doseq [[operator {:keys [field value expected options]}]
                (partition-all
                 2
                 [:string/contains         {:field    :name
                                            :value    ["foo"]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  (\"PUBLIC\".\"VENUES\".\"NAME\" LIKE ?)"]
                                                       ["%foo%"]]}
                  :string/contains         {:field    :name
                                            :value    ["FOO"]
                                            :options  {:case-sensitive false}
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  (LOWER(\"PUBLIC\".\"VENUES\".\"NAME\") LIKE ?)"]
                                                       ["%foo%"]]}
                  :string/does-not-contain {:field    :name
                                            :value    ["foo"]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    NOT (\"PUBLIC\".\"VENUES\".\"NAME\" LIKE ?)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"NAME\" IS NULL)"
                                                        "  )"]
                                                       ["%foo%"]]}
                  :string/does-not-contain {:field    :name
                                            :value    ["FOO"]
                                            :options  {:case-sensitive false}
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    NOT (LOWER(\"PUBLIC\".\"VENUES\".\"NAME\") LIKE ?)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"NAME\" IS NULL)"
                                                        "  )"]
                                                       ["%foo%"]]}
                  :string/starts-with      {:field    :name
                                            :value    ["foo"]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  (\"PUBLIC\".\"VENUES\".\"NAME\" LIKE ?)"]
                                                       ["foo%"]]}
                  :string/=                {:field    :name
                                            :value    ["foo"]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  (\"PUBLIC\".\"VENUES\".\"NAME\" = ?)"]
                                                       ["foo"]]}
                  :string/=                {:field    :name
                                            :value    ["foo" "bar" "baz"]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    (\"PUBLIC\".\"VENUES\".\"NAME\" = ?)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"NAME\" = ?)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"NAME\" = ?)"
                                                        "  )"]
                                                       ["foo" "bar" "baz"]]}
                  :string/!=               {:field    :name
                                            :value    ["foo" "bar"]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    ("
                                                        "      (\"PUBLIC\".\"VENUES\".\"NAME\" <> ?)"
                                                        "      OR (\"PUBLIC\".\"VENUES\".\"NAME\" IS NULL)"
                                                        "    )"
                                                        "    AND ("
                                                        "      (\"PUBLIC\".\"VENUES\".\"NAME\" <> ?)"
                                                        "      OR (\"PUBLIC\".\"VENUES\".\"NAME\" IS NULL)"
                                                        "    )"
                                                        "  )"]
                                                       ["foo" "bar"]]}
                  :number/=                {:field    :price
                                            :value    [1]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  (\"PUBLIC\".\"VENUES\".\"PRICE\" = 1)"]
                                                       []]}
                  :number/=                {:field    :price
                                            :value    [1 2 3]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    (\"PUBLIC\".\"VENUES\".\"PRICE\" = 1)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"PRICE\" = 2)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"PRICE\" = 3)"
                                                        "  )"]
                                                       []]}
                  :number/!=               {:field    :price
                                            :value    [1]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    (\"PUBLIC\".\"VENUES\".\"PRICE\" <> 1)"
                                                        "    OR (\"PUBLIC\".\"VENUES\".\"PRICE\" IS NULL)"
                                                        "  )"]
                                                       []]}
                  :number/!=               {:field    :price
                                            :value    [1 2 3]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  ("
                                                        "    ("
                                                        "      (\"PUBLIC\".\"VENUES\".\"PRICE\" <> 1)"
                                                        "      OR (\"PUBLIC\".\"VENUES\".\"PRICE\" IS NULL)"
                                                        "    )"
                                                        "    AND ("
                                                        "      (\"PUBLIC\".\"VENUES\".\"PRICE\" <> 2)"
                                                        "      OR (\"PUBLIC\".\"VENUES\".\"PRICE\" IS NULL)"
                                                        "    )"
                                                        "    AND ("
                                                        "      (\"PUBLIC\".\"VENUES\".\"PRICE\" <> 3)"
                                                        "      OR (\"PUBLIC\".\"VENUES\".\"PRICE\" IS NULL)"
                                                        "    )"
                                                        "  )"]
                                                       []]}
                  :number/>=               {:field    :price
                                            :value    [1]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  (\"PUBLIC\".\"VENUES\".\"PRICE\" >= 1)"]
                                                       []]}
                  :number/between          {:field    :price
                                            :value    [1 3]
                                            :expected [["select"
                                                        "  *"
                                                        "from"
                                                        "  venues"
                                                        "where"
                                                        "  \"PUBLIC\".\"VENUES\".\"PRICE\" BETWEEN 1 AND 3"]
                                                       []]}])]
          (testing operator
            (is (= expected
                   (-> (substitute query {"param" (params/map->FieldFilter
                                                   {:field (meta/field-metadata :venues field)
                                                    :value {:type  operator
                                                            :value value
                                                            :options options}})})
                       vec
                       (update 0 (partial driver/prettify-native-form :h2))
                       (update 0 str/split-lines))))))))))

;;; -------------------------------------------- Referenced Card Queries ---------------------------------------------

(deftest ^:parallel substitute-referenced-card-query-test
  (testing "Referenced card query substitution"
    (let [query ["SELECT * FROM " (param "#123")]]
      (is (= ["SELECT * FROM (SELECT 1 `x`)" []]
             (substitute query {"#123" (params/map->ReferencedCardQuery {:card-id 123, :query "SELECT 1 `x`"})})))))
  (testing "Referenced card query substitution removes comments (#29168), trailing semicolons (#28218) and whitespace"
    (let [query ["SELECT * FROM " (param "#123")]]
      (are [nested expected] (= [(str "SELECT * FROM (" expected ")") []]
                                (substitute query {"#123" (params/map->ReferencedCardQuery
                                                           {:card-id 123, :query nested})}))
        "SELECT ';' `x`; ; "             "SELECT ';' `x`"
        "SELECT * FROM table\n-- remark" "SELECT * FROM table\n-- remark\n"))))

;;; --------------------------------------------- Native Query Snippets ----------------------------------------------

(deftest ^:parallel substitute-native-query-snippets-test
  (testing "Native query snippet substitution"
    (let [query ["SELECT * FROM test_scores WHERE " (param "snippet:symbol_is_A")]]
      (is (= ["SELECT * FROM test_scores WHERE symbol = 'A'" nil]
             (substitute query {"snippet:symbol_is_A" (params/->ReferencedQuerySnippet 123 "symbol = 'A'")}))))))


;;; ------------------------------------------ simple substitution — {{x}} ------------------------------------------

(defn- substitute-e2e {:style/indent 1} [sql params]
  (let [[query params] (driver/with-driver :h2
                         (mt/with-metadata-provider meta/metadata-provider
                           (#'sql.params.substitute/substitute (params.parse/parse sql) (into {} params))))]
    {:query query, :params (vec params)}))

(deftest ^:parallel basic-substitution-test
  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
           {"toucans_are_cool" true})))
  (is (thrown?
       Exception
       (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
         nil)))
  (testing "Multiple params"
    (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = ?"
            :params ["toucan"]}
           (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
             {"toucans_are_cool" true, "bird_type" "toucan"}))))

  (testing "Should throw an Exception if a required param is missing"
    (is (thrown?
         Exception
         (substitute-e2e "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
           {"toucans_are_cool" true})))))


;;; ---------------------------------- optional substitution — [[ ... {{x}} ... ]] ----------------------------------

(deftest ^:parallel optional-substitution-test
  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
           {"toucans_are_cool" true})))

  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool }}]]"
           {"toucans_are_cool" true})))

  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool }}]]"
           {"toucans_are_cool" true})))

  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool}}]]"
           {"toucans_are_cool" true})))

  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool_2}}]]"
           {"toucans_are_cool_2" true})))

  (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = 'toucan']]"
           {"toucans_are_cool" true})))

  (testing "Two parameters in an optional"
    (is (= {:query  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = ?"
            :params ["toucan"]}
           (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}]]"
             {"toucans_are_cool" true, "bird_type" "toucan"}))))

  (is (= {:query  "SELECT * FROM bird_facts"
          :params []}
         (substitute-e2e "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
           nil)))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           {"num_toucans" 5})))

  (testing "make sure nil gets substitute-e2ed in as `NULL`"
    (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > NULL"
            :params []}
           (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
             {"num_toucans" nil}))))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           {"num_toucans" true})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > FALSE"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           {"num_toucans" false})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > ?"
          :params ["abc"]}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           {"num_toucans" "abc"})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > ?"
          :params ["yo' mama"]}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           {"num_toucans" "yo' mama"})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           nil)))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 2 AND total_birds > 5"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           {"num_toucans" 2, "total_birds" 5})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE  AND total_birds > 5"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           {"total_birds" 5})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 3"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           {"num_toucans" 3})))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           nil)))

  (is (= {:query  "SELECT * FROM toucanneries WHERE bird_type = ? AND num_toucans > 2 AND total_birds > 5"
          :params ["toucan"]}
         (substitute-e2e "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           {"bird_type" "toucan", "num_toucans" 2, "total_birds" 5})))

  (testing "should throw an Exception if a required param is missing"
    (is (thrown?
         Exception
         (substitute-e2e "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           {"num_toucans" 2, "total_birds" 5}))))

  (is (= {:query  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5 AND num_toucans < 5"
          :params []}
         (substitute-e2e "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND num_toucans < {{num_toucans}}]]"
           {"num_toucans" 5})))

  (testing "Make sure that substitutions still work if the substitution contains brackets inside it (#3657)"
    (is (= {:query  "select * from foobars  where foobars.id in (string_to_array(100, ',')::integer[])"
            :params []}
           (substitute-e2e "select * from foobars [[ where foobars.id in (string_to_array({{foobar_id}}, ',')::integer[]) ]]"
             {"foobar_id" 100})))))


;;; ------------------------------------------- expansion tests: variables -------------------------------------------

(defn- expand**
  "Expand parameters inside a top-level native `query`. Not recursive. "
  [{:keys [parameters], inner :native, :as query}]
  (driver/with-driver :h2
    (mt/with-metadata-provider meta/metadata-provider
      (let [inner' (qp.native/expand-inner (update inner :parameters #(concat parameters %)))]
        (assoc query :native inner')))))

(defn- expand* [query]
  (-> (expand** (mbql.normalize/normalize query))
      :native
      (select-keys [:query :params :template-tags])
      (update :params vec)))

(deftest ^:parallel expand-variables-test
  ;; unspecified optional param
  (is (= {:query  "SELECT * FROM orders ;"
          :params []}
         (expand* {:native     {:query         "SELECT * FROM orders [[WHERE id = {{id}}]];"
                                :template-tags {"id" {:name "id", :display-name "ID", :type :number}}}
                   :parameters []})))

  (testing "unspecified *required* param"
    (is (thrown?
         Exception
         (expand** {:native     {:query         "SELECT * FROM orders [[WHERE id = {{id}}]];"
                                 :template-tags {"id" {:name "id", :display-name "ID", :type :number, :required true}}}
                    :parameters []}))))

  (testing "default value"
    (is (= {:query  "SELECT * FROM orders WHERE id = 100;"
            :params []}
           (expand* {:native     {:query         "SELECT * FROM orders WHERE id = {{id}};"
                                  :template-tags {"id" {:name "id", :display-name "ID", :type :number, :required true, :default "100"}}}
                     :parameters []}))))

  (testing "specified param (numbers)"
    (is (= {:query  "SELECT * FROM orders WHERE id = 2;"
            :params []}
           (expand* {:native     {:query         "SELECT * FROM orders WHERE id = {{id}};"
                                  :template-tags {"id" {:name "id", :display-name "ID", :type :number, :required true, :default "100"}}}
                     :parameters [{:type "category", :target [:variable [:template-tag "id"]], :value "2"}]}))))

  (testing "specified param (date/single)"
    (is (= {:query  "SELECT * FROM orders WHERE created_at > ?;"
            :params [#t "2016-07-19"]}
           (expand* {:native     {:query         "SELECT * FROM orders WHERE created_at > {{created_at}};"
                                  :template-tags {"created_at" {:name "created_at", :display-name "Created At", :type "date"}}}
                     :parameters [{:type :date/single, :target [:variable [:template-tag "created_at"]], :value "2016-07-19"}]}))))

  (testing "specified param (text)"
    (is (= {:query  "SELECT * FROM products WHERE category = ?;"
            :params ["Gizmo"]}
           (expand* {:native     {:query         "SELECT * FROM products WHERE category = {{category}};"
                                  :template-tags {"category" {:name "category", :display-name "Category", :type :text}}}
                     :parameters [{:type "category", :target [:variable [:template-tag "category"]], :value "Gizmo"}]})))))


;;; ----------------------------------------- expansion tests: field filters -----------------------------------------

(defn- expand-with-field-filter-param
  ([field-filter-param]
   (expand-with-field-filter-param "SELECT * FROM checkins WHERE {{date}};" field-filter-param))

  ([sql field-filter-param]
   ;; TIMEZONE FIXME
   (mt/with-clock (t/mock-clock #t "2016-06-07T12:00-00:00" (t/zone-id "UTC"))
     (-> {:native     {:query
                       sql
                       :template-tags {"date" {:name         "date"
                                               :display-name "Checkin Date"
                                               :type         :dimension
                                               :widget-type  :date/all-options
                                               :dimension    [:field (meta/id :checkins :date) nil]}}}
          :parameters (when field-filter-param
                        [(merge {:target [:dimension [:template-tag "date"]]}
                                field-filter-param)])}
         expand*
         (dissoc :template-tags)))))

(deftest expand-field-filters-test
  (mt/with-temporary-setting-values [start-of-week :sunday]
    (testing "dimension (date/single)"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ?;"
              :params [#t "2016-07-01"]}
             (expand-with-field-filter-param {:type :date/single, :value "2016-07-01"}))))
    (testing "dimension (date/range)"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-07-01"
                       #t "2016-08-01"]}
             (expand-with-field-filter-param {:type :date/range, :value "2016-07-01~2016-08-01"}))))
    (testing "dimension (date/month-year)"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-07-01"
                       #t "2016-07-31"]}
             (expand-with-field-filter-param {:type :date/month-year, :value "2016-07"}))))
    (testing "dimension (date/quarter-year)"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-01-01"
                       #t "2016-03-31"]}
             (expand-with-field-filter-param {:type :date/quarter-year, :value "Q1-2016"}))))
    (testing "dimension (date/all-options, before)"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" < ?;"
              :params [#t "2016-07-01"]}
             (expand-with-field-filter-param {:type :date/all-options, :value "~2016-07-01"}))))
    (testing "dimension (date/all-options, after)"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" > ?;"
              :params [#t "2016-07-01"]}
             (expand-with-field-filter-param {:type :date/all-options, :value "2016-07-01~"}))))
    (testing "relative date — 'yesterday'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ?;"
              :params [#t "2016-06-06"]}
             (expand-with-field-filter-param {:type :date/range, :value "yesterday"}))))
    (testing "relative date — 'past7days'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-05-31"
                       #t "2016-06-06"]}
             (expand-with-field-filter-param {:type :date/range, :value "past7days"}))))
    (testing "relative date — 'past30days'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-05-08"
                       #t "2016-06-06"]}
             (expand-with-field-filter-param {:type :date/range, :value "past30days"}))))
    (testing "relative date — 'thisweek'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-06-05"
                       #t "2016-06-11"]}
             (expand-with-field-filter-param {:type :date/range, :value "thisweek"}))))
    (testing "relative date — 'thismonth'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-06-01"
                       #t "2016-06-30"]}
             (expand-with-field-filter-param {:type :date/range, :value "thismonth"}))))
    (testing "relative date — 'thisyear'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-01-01"
                       #t "2016-12-31"]}
             (expand-with-field-filter-param {:type :date/range, :value "thisyear"}))))
    (testing "relative date — 'lastweek'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-05-29"
                       #t "2016-06-04"]}
             (expand-with-field-filter-param {:type :date/range, :value "lastweek"}))))
    (testing "relative date — 'lastmonth'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2016-05-01"
                       #t "2016-05-31"]}
             (expand-with-field-filter-param {:type :date/range, :value "lastmonth"}))))
    (testing "relative date — 'lastyear'"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?;"
              :params [#t "2015-01-01"
                       #t "2015-12-31"]}
             (expand-with-field-filter-param {:type :date/range, :value "lastyear"}))))
    (testing "dimension with no value — just replace with an always true clause (e.g. 'WHERE 1 = 1')"
      (is (= {:query  "SELECT * FROM checkins WHERE 1 = 1;"
              :params []}
             (expand-with-field-filter-param nil))))
    (testing "dimension — number — should get parsed to Number"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = 100;"
              :params []}
             (expand-with-field-filter-param {:type :number, :value "100"}))))
    (testing "dimension — text"
      (is (= {:query  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ?;"
              :params ["100"]}
             (expand-with-field-filter-param {:type :text, :value "100"}))))
    (testing (str "*OPTIONAL* Field Filter params should not get replaced with 1 = 1 if the param is not present "
                  "(#5541, #9489). *Optional params should be emitted entirely.")
      (is (= {:query  "SELECT * FROM ORDERS WHERE TOTAL > 100  AND CREATED_AT < now()"
              :params []}
             (expand-with-field-filter-param
              "SELECT * FROM ORDERS WHERE TOTAL > 100 [[AND {{created}} #]] AND CREATED_AT < now()"
              nil))))))

(deftest ^:parallel expand-exclude-field-filter-test
  (mt/with-driver :h2
    (testing "exclude date parts"
      (testing "one exclusion"
        (is (= {:query ["SELECT"
                        "  *"
                        "FROM"
                        "  checkins"
                        "WHERE"
                        "  ("
                        "    ("
                        "      extract("
                        "        month"
                        "        from"
                        "          \"PUBLIC\".\"CHECKINS\".\"DATE\""
                        "      ) <> extract("
                        "        month"
                        "        from"
                        "          ?"
                        "      )"
                        "    )"
                        "    OR ("
                        "      extract("
                        "        month"
                        "        from"
                        "          \"PUBLIC\".\"CHECKINS\".\"DATE\""
                        "      ) IS NULL"
                        "    )"
                        "  );"]
                :params [#t "2016-01-01"]}
               (-> (expand-with-field-filter-param {:type :date/all-options, :value "exclude-months-Jan"})
                   (update :query #(str/split-lines (driver/prettify-native-form :h2 %))))))))))

(deftest ^:parallel expand-exclude-field-filter-test-2
  (mt/with-driver :h2
    (testing "exclude date parts"
      (testing "two exclusions"
        (is (= {:query ["SELECT"
                        "  *"
                        "FROM"
                        "  checkins"
                        "WHERE"
                        "  ("
                        "    ("
                        "      ("
                        "        extract("
                        "          month"
                        "          from"
                        "            \"PUBLIC\".\"CHECKINS\".\"DATE\""
                        "        ) <> extract("
                        "          month"
                        "          from"
                        "            ?"
                        "        )"
                        "      )"
                        "      OR ("
                        "        extract("
                        "          month"
                        "          from"
                        "            \"PUBLIC\".\"CHECKINS\".\"DATE\""
                        "        ) IS NULL"
                        "      )"
                        "    )"
                        "    AND ("
                        "      ("
                        "        extract("
                        "          month"
                        "          from"
                        "            \"PUBLIC\".\"CHECKINS\".\"DATE\""
                        "        ) <> extract("
                        "          month"
                        "          from"
                        "            ?"
                        "        )"
                        "      )"
                        "      OR ("
                        "        extract("
                        "          month"
                        "          from"
                        "            \"PUBLIC\".\"CHECKINS\".\"DATE\""
                        "        ) IS NULL"
                        "      )"
                        "    )"
                        "  );"]
                :params [#t "2016-01-01"
                         #t "2016-02-01"]}
               (-> (expand-with-field-filter-param {:type :date/all-options, :value "exclude-months-Jan-Feb"})
                   (update :query #(str/split-lines (driver/prettify-native-form :h2 %))))))))))

;;; -------------------------------------------- "REAL" END-TO-END-TESTS ---------------------------------------------

(defmacro ^:private table-identifier
  "Get the identifier used for `table` for the current driver by looking at what the driver uses when converting MBQL
   to SQL. Different drivers qualify to different degrees (i.e. `table` vs `schema.table` vs `database.schema.table`)."
  [table-name]
  `(let [sql# (:query (qp.compile/compile (mt/mbql-query ~table-name)))]
     (second (re-find #"(?m)FROM\s+([^\s()]+)" sql#))))

;; as with the MBQL parameters tests Redshift fail for unknown reasons; disable their tests for now
;; TIMEZONE FIXME
(defn- sql-parameters-engines []
  (set (for [driver (mt/normal-drivers-with-feature :native-parameters)
             :when  (and (isa? driver/hierarchy driver :sql)
                         (not= driver :redshift))]
         driver)))

(defn- process-native [& {:as query}]
  (qp/process-query
   (merge
    (mt/native-query nil)
    query)))

(deftest ^:parallel e2e-basic-test
  (mt/test-drivers (sql-parameters-engines)
    (is (= [29]
           (mt/first-row
            (mt/format-rows-by [int]
              (process-native
                :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (table-identifier :checkins))
                             :template-tags {"checkin_date" {:name         "checkin_date"
                                                             :display-name "Checkin Date"
                                                             :type         :dimension
                                                             :widget-type  :date/range
                                                             :dimension    [:field (mt/id :checkins :date) nil]}}}
                :parameters [{:type   :date/range
                              :target [:dimension [:template-tag "checkin_date"]]
                              :value  "2015-04-01~2015-05-01"}])))))))

(deftest ^:parallel e2e-no-parameter-test
  (mt/test-drivers (sql-parameters-engines)
    (testing "no parameter — should give us a query with \"WHERE 1 = 1\""
      (is (= [1000]
             (mt/first-row
              (mt/format-rows-by [int]
                (process-native
                 :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}" (table-identifier :checkins))
                              :template-tags {"checkin_date" {:name         "checkin_date"
                                                              :display-name "Checkin Date"
                                                              :type         :dimension
                                                              :widget-type  :date/all-options
                                                              :dimension    [:field (mt/id :checkins :date) nil]}}}
                 :parameters []))))))))

(deftest ^:parallel e2e-relative-dates-test
  (mt/test-drivers (sql-parameters-engines)
    (testing (str "test that relative dates work correctly. It should be enough to try just one type of relative date "
                  "here, since handling them gets delegated to the functions in `metabase.driver.common.parameters.dates`, "
                  "which is fully-tested :D")
      (is (= [0]
             (mt/first-row
              (mt/format-rows-by [int]
                (process-native
                  :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}"
                                                      (table-identifier :checkins))
                               :template-tags {"checkin_date" {:name         "checkin_date"
                                                               :display-name "Checkin Date"
                                                               :type         :dimension
                                                               :widget-type  :date/relative
                                                               :dimension    [:field (mt/id :checkins :date) nil]}}}
                  :parameters [{:type   :date/relative
                                :target [:dimension [:template-tag "checkin_date"]]
                                :value  "thismonth"}]))))))))

(deftest ^:parallel e2e-exclude-date-parts-test
  ;; Exclude bigquery from this test, because there's a bug with bigquery and exclusion of date parts (metabase#30790)
  (mt/test-drivers (disj (sql-parameters-engines) :bigquery-cloud-sdk)
    (testing (str "test that excluding date parts work correctly. It should be enough to try just one type of exclusion "
                  "here, since handling them gets delegated to the functions in `metabase.driver.common.parameters.dates`, "
                  "which is fully-tested :D")
      (doseq [[exclusion-string expected] {"exclude-months-Jan" 14
                                           "exclude-months-Jan-Feb" 13
                                           "exclude-hours-0-1-2-3-4-5-6-7-8-9-10-11-12" 5}]
        (testing (format "test that excluding dates with %s works correctly" exclusion-string)
          (is (= [expected]
                 (mt/first-row
                  (mt/format-rows-by [int]
                    (process-native
                      :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{last_login_date}}"
                                                          (table-identifier :users))
                                   :template-tags {"last_login_date" {:name         "last_login_date"
                                                                      :display-name "Last Login Date"
                                                                      :type         :dimension
                                                                      :widget-type  :date/all-options
                                                                      :dimension    [:field (mt/id :users :last_login) nil]}}}
                      :parameters [{:type   :date/all-options
                                    :target [:dimension [:template-tag "last_login_date"]]
                                    :value  exclusion-string}]))))))))))

(deftest ^:parallel e2e-combine-multiple-filters-test
  (mt/test-drivers (sql-parameters-engines)
    (testing "test that multiple filters applied to the same variable combine into `AND` clauses (#3539)"
      (is (= [4]
             (mt/first-row
              (mt/format-rows-by [int]
                (process-native
                  :native     {:query         (format "SELECT COUNT(*) FROM %s WHERE {{checkin_date}}"
                                                      (table-identifier :checkins))
                               :template-tags {"checkin_date" {:name         "checkin_date"
                                                               :display-name "Checkin Date"
                                                               :type         :dimension
                                                               :widget-type  :date/all-options
                                                               :dimension    [:field (mt/id :checkins :date) nil]}}}
                  :parameters [{:type   :date/range
                                :target [:dimension [:template-tag "checkin_date"]]
                                :value  "2015-01-01~2016-09-01"}
                               {:type   :date/single
                                :target [:dimension [:template-tag "checkin_date"]]
                                :value  "2015-07-01"}]))))))))

(deftest e2e-parse-native-dates-test
  (testing "Native dates should be parsed with the report timezone"
    (mt/test-drivers (disj (sql-parameters-engines) :sqlite)
      (mt/with-report-timezone-id! "America/Los_Angeles"
        (let [query {:database   (mt/id)
                     :type       :native
                     :native     {:query         (if (= driver/*driver* :oracle)
                                                   "SELECT cast({{date}} as date) from dual"
                                                   "SELECT cast({{date}} as date)")
                                  :template-tags {"date" {:name "date" :display-name "Date" :type :date}}}
                     :parameters [{:type :date/single :target [:variable [:template-tag "date"]] :value "2018-04-18"}]}]
          (mt/with-native-query-testing-context query
            (is (= [(cond
                      (qp.test-util/supports-report-timezone? driver/*driver*)
                      "2018-04-18T00:00:00-07:00"

                      :else
                      "2018-04-18T00:00:00Z")]
                   (mt/first-row (qp/process-query query))))))))))

;; Some random end-to-end param expansion tests added as part of the SQL Parameters 2.0 rewrite
(deftest ^:parallel param-expansion-test
  (is (= {:query  "SELECT count(*) FROM CHECKINS WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ?",
          :params [#t "2017-03-01"
                   #t "2017-03-31"]}
         (expand* {:native     {:query         "SELECT count(*) FROM CHECKINS WHERE {{created_at}}"
                                :template-tags {"created_at" {:name         "created_at"
                                                              :display-name "Created At"
                                                              :type         :dimension
                                                              :widget-type  :date/all-options
                                                              :dimension    [:field (meta/id :checkins :date) nil]}}}
                   :parameters [{:type   :date/month-year
                                 :target [:dimension [:template-tag "created_at"]]
                                 :value  "2017-03"}]}))))

(deftest ^:parallel param-expansion-test-2
  (is (= {:query  "SELECT count(*) FROM ORDERS"
          :params []}
         (expand* {:native {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                            :template-tags {"price" {:name         "price"
                                                     :display-name "Price"
                                                     :type         :number
                                                     :required     false}}}}))))

(deftest ^:parallel param-expansion-test-3
  (is (= {:query  "SELECT count(*) FROM ORDERS WHERE price > 100"
          :params []}
         (expand* {:native     {:query         "SELECT count(*) FROM ORDERS [[WHERE price > {{price}}]]"
                                :template-tags {"price" {:name         "price"
                                                         :display-name "Price"
                                                         :type         :number
                                                         :required     false}}}
                   :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "100"}]}))))

(deftest ^:parallel param-expansion-test-4
  (is (= {:query  "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE ?"
          :params ["%Toucan%"]}
         (expand* {:native     {:query         "SELECT count(*) FROM PRODUCTS WHERE TITLE LIKE {{x}}",
                                :template-tags {"x" {:name         "x"
                                                     :display-name "X"
                                                     :type         :text
                                                     :required     true}}}
                   :parameters [{:type "category", :target [:variable [:template-tag "x"]], :value "%Toucan%"}]}))))

(deftest ^:parallel param-expansion-test-5
  (testing "make sure that you can use the same parameter multiple times (#4659)"
    (is (= {:query  "SELECT count(*) FROM products WHERE title LIKE ? AND subtitle LIKE ?"
            :params ["%Toucan%" "%Toucan%"]}
           (expand* {:native     {:query         "SELECT count(*) FROM products WHERE title LIKE {{x}} AND subtitle LIKE {{x}}",
                                  :template-tags {"x" {:name         "x"
                                                       :display-name "X"
                                                       :type         :text
                                                       :required     true}}}
                     :parameters [{:type "category", :target [:variable [:template-tag "x"]], :value "%Toucan%"}]})))))

(deftest ^:parallel param-expansion-test-6
  (testing "make sure that you can use the same parameter multiple times (#4659)"
    (is (= {:query  "SELECT * FROM ORDERS WHERE true  AND ID = ? OR USER_ID = ?"
            :params ["2" "2"]}
           (expand* {:native     {:query         "SELECT * FROM ORDERS WHERE true [[ AND ID = {{id}} OR USER_ID = {{id}} ]]"
                                  :template-tags {"id" {:name "id", :display-name "ID", :type :text}}}
                     :parameters [{:type "category", :target [:variable [:template-tag "id"]], :value "2"}]})))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            RELATIVE DATES & DEFAULTS IN "DIMENSION" PARAMS (#6059)                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel expand-field-filter-relative-dates-test
  (testing "Make sure relative date forms like `past5days` work correctly with Field Filters"
    (mt/with-clock (t/mock-clock #t "2017-11-05T12:00Z" (t/zone-id "UTC"))
      (is (= {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                           "FROM CHECKINS "
                           "WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ? "
                           "GROUP BY \"DATE\"")
              :params [#t "2017-10-31"
                       #t "2017-11-04"]}
             (expand* {:native     {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                                        "FROM CHECKINS "
                                                        "WHERE {{checkin_date}} "
                                                        "GROUP BY \"DATE\"")
                                    :template-tags {"checkin_date" {:name         "checkin_date"
                                                                    :display-name "Checkin Date"
                                                                    :type         :dimension
                                                                    :widget-type  :date/all-options
                                                                    :dimension    [:field (meta/id :checkins :date) nil]}}}
                       :parameters [{:type   :date/range
                                     :target [:dimension [:template-tag "checkin_date"]]
                                     :value  "past5days"}]}))))))

(deftest ^:parallel field-filter-defaults-test
  (testing (str "Make sure we can specify the type of a default value for a \"Dimension\" (Field Filter) by setting "
                "the `:widget-type` key. Check that it works correctly with relative dates")
    (mt/with-clock (t/mock-clock #t "2017-11-05T12:00Z" (t/zone-id "UTC"))
      (is (= {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                           "FROM CHECKINS "
                           "WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" BETWEEN ? AND ? "
                           "GROUP BY \"DATE\"")
              :params [#t "2017-10-31"
                       #t "2017-11-04"]}
             (expand* {:native {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                                    "FROM CHECKINS "
                                                    "WHERE {{checkin_date}} "
                                                    "GROUP BY \"DATE\"")
                                :template-tags {"checkin_date" {:name         "checkin_date"
                                                                :display-name "Checkin Date"
                                                                :type         :dimension
                                                                :dimension    [:field (meta/id :checkins :date) nil]
                                                                :default      "past5days"
                                                                :widget-type  :date/all-options}}}}))))))

(deftest ^:parallel field-filter-defaults-absolute-datetimes-test
  (testing "Check that default values for Field Filters work with absolute dates"
    (is (= {:query  (str "SELECT count(*) AS \"count\", \"DATE\" "
                         "FROM CHECKINS "
                         "WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" = ? "
                         "GROUP BY \"DATE\"")
            :params [#t "2017-11-14"]}
           (expand* {:native {:query         (str "SELECT count(*) AS \"count\", \"DATE\" "
                                                  "FROM CHECKINS "
                                                  "WHERE {{checkin_date}} "
                                                  "GROUP BY \"DATE\"")
                              :template-tags {"checkin_date" {:name         "checkin_date"
                                                              :display-name "Checkin Date"
                                                              :type         :dimension
                                                              :dimension    [:field (meta/id :checkins :date) nil]
                                                              :default      "2017-11-14"
                                                              :widget-type  :date/all-options}}}})))))

(deftest ^:parallel newlines-test
  (testing "Make sure queries with newlines are parsed correctly (#11526)"
    (is (= [[1]]
           (mt/rows
            (qp/process-query
             {:database   (mt/id)
              :type       "native"
              :native     {:query         "SELECT count(*)\nFROM venues\n WHERE name = {{name}}"
                           :template-tags {:name {:name         "name"
                                                  :display_name "Name"
                                                  :type         "text"
                                                  :required     true
                                                  :default      "Fred 62"}}}
              :parameters []}))))))

(deftest ^:parallel multiple-value-test
  (testing "Make sure using commas in numeric params treats them as separate IDs (#5457)"
    (is (= "SELECT * FROM USERS where id IN (1, 2, 3)"
           (-> (qp/process-query
                {:database   (mt/id)
                 :type       "native"
                 :native     {:query         "SELECT * FROM USERS [[where id IN ({{ids_list}})]]"
                              :template-tags {"ids_list" {:name         "ids_list"
                                                          :display-name "Ids list"
                                                          :type         :number}}}
                 :parameters [{:type   "category"
                               :target [:variable [:template-tag "ids_list"]]
                               :value  "1,2,3"}]})
               :data :native_form :query)))))

(deftest ^:parallel multiple-value-test-2
  (testing "make sure you can now also pass multiple values in by passing an array of values"
    (is (= {:query  "SELECT * FROM CATEGORIES where name IN (?, ?, ?)"
            :params ["BBQ" "Bakery" "Bar"]}
           (expand*
            {:native     {:query         "SELECT * FROM CATEGORIES [[where name IN ({{names_list}})]]"
                          :template-tags {"names_list" {:name         "names_list"
                                                        :display-name "Names List"
                                                        :type         :text}}}
             :parameters [{:type   "category"
                           :target [:variable [:template-tag "names_list"]]
                           :value  ["BBQ" "Bakery" "Bar"]}]})))))

(deftest ^:parallel multiple-value-test-3
  (testing "Make sure arrays of values also work for 'field filter' params"
    (is (= {:query  "SELECT * FROM CATEGORIES WHERE \"PUBLIC\".\"CATEGORIES\".\"NAME\" IN (?, ?, ?)",
            :params ["BBQ" "Bakery" "Bar"]}
           (expand*
            {:native     {:query         "SELECT * FROM CATEGORIES WHERE {{names_list}}"
                          :template-tags {"names_list" {:name         "names_list"
                                                        :display-name "Names List"
                                                        :type         :dimension
                                                        :dimension    [:field (meta/id :categories :name) nil]
                                                        :widget-type  :text}}}
             :parameters [{:type   :text
                           :target [:dimension [:template-tag "names_list"]]
                           :value  ["BBQ" "Bakery" "Bar"]}]})))))

(deftest ^:parallel include-card-parameters-test
  (testing "Make sure Card params are preserved when expanding a Card reference (#12236)"
    (binding [driver/*driver* :h2]
      (is (= ["SELECT * FROM (SELECT * FROM table WHERE x LIKE ?)"
              ["G%"]]
             (sql.params.substitute/substitute
              ["SELECT * FROM " (params/->Param "#1")]
              {"#1"
               (params/map->ReferencedCardQuery
                {:card-id 1
                 :query   "SELECT * FROM table WHERE x LIKE ?"
                 :params  ["G%"]})}))))))
