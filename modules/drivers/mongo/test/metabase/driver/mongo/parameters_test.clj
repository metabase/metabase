(ns metabase.driver.mongo.parameters-test
  (:require [cheshire.core :as json]
            [cheshire.generate :as json.generate]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver.common.parameters :as common.params]
            [metabase.driver.mongo.parameters :as params]
            [metabase.query-processor :as qp]
            [metabase.test :as mt])
  (:import com.fasterxml.jackson.core.JsonGenerator))

(deftest ->utc-instant-test
  (doseq [t [#t "2020-03-14"
             #t "2020-03-14T00:00:00"
             #t "2020-03-13T17:00:00-07:00"
             #t "2020-03-13T17:00:00-07:00[America/Los_Angeles]"]]
    (testing (format "%s %s" (class t) (pr-str t))
      (is (= (t/instant "2020-03-14T00:00:00Z")
             (#'params/->utc-instant t))))))

(defn- substitute [param->value xs]
  (#'params/substitute param->value xs))

(defn- param [k]
  (common.params/->Param k))

(defn- optional [& xs]
  (common.params/->Optional xs))

(defn- field-filter
  ([field-name value-type value]
   (field-filter field-name nil value-type value))
  ([field-name base-type value-type value]
   (common.params/->FieldFilter (cond-> {:name (name field-name)}
                                  base-type
                                  (assoc :base_type base-type))
                                {:type value-type, :value value})))

(defn- comma-separated-numbers [nums]
  (common.params/->CommaSeparatedNumbers nums))

(deftest substitute-test
  (testing "non-parameterized strings should not be substituted"
    (is (= "wow"
           (substitute nil ["wow"]))))
  (testing "non-optional-params"
    (testing "single param with no string before or after"
      (is (= "100"
             (substitute {:x 100} [(param :x)]))
          "\"{{x}}\" with x = 100 should be replaced with \"100\""))
    (testing "if a param is missing, an Exception should be thrown"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"missing required parameters: #\{:x\}"
                            (substitute nil [(param :x)]))))
    (testing "params preceeded or followed by strings should get combined into a single string"
      (is (= "2100"
             (substitute {:x 100} ["2" (param :x)]))
          "\"2{{x}}\" with x = 100 should be replaced with string \"2100\""))
    (testing "temporal params"
      (is (= "ISODate(\"2019-12-06T17:01:00-08:00\")"
             (substitute {:written-at #t "2019-12-06T17:01:00-08:00[America/Los_Angeles]"} [(param :written-at)]))))
    (testing "multiple params in one string"
      (is (= "2019-12-10"
             (substitute {:year 2019, :month 12, :day 10} [(param :year) "-" (param :month) "-" (param :day)]))
          "\"{{year}}-{{month}}-{{day}}\" should be replaced with \"2019-12-09\"")
      (testing "some params missing"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"missing required parameters: #\{:day\}"
                              (substitute {:year 2019, :month 12} [(param :year) "-" (param :month) "-" (param :day)]))))))
  (testing "optional params"
    (testing "single optional param"
      (is (= nil
             (substitute nil [(optional (param :x))]))
          "\"[[{{x}}]]\" with no value for x should be replaced with `nil`"))
    (testing "{{year}}[[-{{month}}[[-{{day}}]]]]"
      (let [params [(param :year) (optional "-" (param :month) (optional "-" (param :day)))]]
        (testing "with all params present"
          (is (= "2019-12-10"
                 (substitute {:year 2019, :month 12, :day 10} params))))
        (testing "with :year & :month present but not :day"
          (is (= "2019-12"
                 (substitute {:year 2019, :month 12} params))))
        (testing "with :year present but not :month or :day"
          (is (= "2019"
                 (substitute {:year 2019} params))))
        (testing "with no params present"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"missing required parameters"
                                (substitute nil params)))))))
  (testing "comma-separated numbers"
    (is (= "{$in: [1, 2, 3]}"
           (substitute {:id (comma-separated-numbers [1 2 3])}
                       [(param :id)])))))

(defprotocol ^:private ToBSON
  (^:private to-bson [this]
   "Utility method for converting normal Clojure objects to string-serialized 'BSON'."))

(extend-protocol ToBSON
  nil
  (to-bson [_] "null")

  Object
  (to-bson [this] (pr-str this))

  clojure.lang.Keyword
  (to-bson [this] (name this))

  clojure.lang.Sequential
  (to-bson [this]
    (str "["
         (str/join ", " (map to-bson this))
         "]"))

  clojure.lang.IPersistentMap
  (to-bson [this]
    (str "{"
         (str/join ", " (for [[k v] this]
                          (str (to-bson k) ": " (to-bson v))))
         "}")))

(defn- bson-fn-call [f & args]
  (reify ToBSON
    (to-bson [_]
      (format "%s(%s)" (name f) (str/join "," (map pr-str args))))))

(defn- ISODate [s]
  (bson-fn-call :ISODate s))

(defn- strip [s]
  (str/replace s #"\s" ""))

(deftest field-filter-test
  (testing "Date ranges"
    (mt/with-clock #t "2019-12-13T12:00:00.000Z[UTC]"
      (letfn [(substitute-date-range [s]
                (substitute {:date (field-filter "date" :date/range s)}
                            ["[{$match: " (param :date) "}]"]))]
        (is (= (to-bson [{:$match {:$and [{"date" {:$gte (ISODate "2019-12-08")}}
                                          {"date" {:$lt  (ISODate "2019-12-13")}}]}}])
               (substitute-date-range "past5days")))
        (testing "Make sure ranges like last[x]/this[x] include the full range (#11715)"
          (is (= (to-bson [{:$match {:$and [{"date" {:$gte (ISODate "2019-12-01")}}
                                            {"date" {:$lt  (ISODate "2020-01-01")}}]}}])
                 (substitute-date-range "thismonth")))
          (is (= (to-bson [{:$match {:$and [{"date" {:$gte (ISODate "2019-11-01")}}
                                            {"date" {:$lt  (ISODate "2019-12-01")}}]}}])
                 (substitute-date-range "lastmonth")))))))
  (testing "multiple values"
    (doseq [[message v] {"values are a vector of numbers" [1 2 3]
                         "comma-separated numbers"        (comma-separated-numbers [1 2 3])}]
      (testing message
        (is (= (to-bson [{:$match {"id" {:$in [1 2 3]}}}])
               (substitute {:id (field-filter "id" :number v)}
                           ["[{$match: " (param :id) "}]"]))))))
  (testing "single date"
    (is (= (to-bson [{:$match {:$and [{"date" {:$gte (ISODate "2019-12-08")}}
                                      {"date" {:$lt  (ISODate "2019-12-09")}}]}}])
           (substitute {:date (field-filter "date" :date/single "2019-12-08")}
                       ["[{$match: " (param :date) "}]"]))))
  (testing "parameter not supplied"
    (is (= (to-bson [{:$match {}}])
           (substitute {:date (common.params/->FieldFilter {:name "date"} common.params/no-value)} ["[{$match: " (param :date) "}]"]))))
  (testing "operators"
    (testing "string"
      (doseq [[operator form input] [[:string/starts-with {"$regex" "^foo"} ["foo"]]
                                     [:string/ends-with {"$regex" "foo$"} ["foo"]]
                                     [:string/contains {"$regex" "foo"} ["foo"]]
                                     [:string/does-not-contain {"$not" {"$regex" "foo"}} ["foo"]]
                                     [:string/= {"$eq" "foo"} ["foo"]]]]
        (testing operator
          (is (= (strip (to-bson [{:$match {"description" form}}]))
                 (strip
                  (substitute {:desc (field-filter "description" :type/Text operator input)}
                              ["[{$match: " (param :desc) "}]"])))))))
    (testing "numeric"
      (doseq [[operator form input] [[:number/<= {"price" {"$lte" 42}} [42]]
                                     [:number/>= {"price" {"$gte" 42}} [42]]
                                     [:number/!= {"price" {"$ne" 42}} [42]]
                                     [:number/= {"price" {"$eq" 42}} [42]]
                                     ;; i don't understand the $ on price here
                                     [:number/between {"$and" [{"$expr" {"$gte" ["$price" 42]}}
                                                               {"$expr" {"$lte" ["$price" 142]}}]} [42 142]]]]
        (testing operator
          (is (= (strip (to-bson [{:$match form}]))
                 (strip
                  (substitute {:price (field-filter "price" :type/Integer operator input)}
                              ["[{$match: " (param :price) "}]"])))))))
    (testing "variadic operators"
      (testing :string/=
        ;; this could be optimized to {:description {:in ["foo" "bar"}}?
        (is (= (strip (to-bson [{:$match {"$or" [{"$expr" {"$eq" ["$description" "foo"]}}
                                                 {"$expr" {"$eq" ["$description" "bar"]}}]}}]))
               (strip
                (substitute {:desc (field-filter "description" :type/Text :string/= ["foo" "bar"])}
                            ["[{$match: " (param :desc) "}]"])))))
      (testing :string/!=
        ;; this could be optimized to {:description {:in ["foo" "bar"}}?  one thing is that we pass it through the
        ;; desugar middleware that does this [:= 1 2] -> [:or [:= 1] [:= 2]] which makes for more complicated (or just
        ;; verbose?) query where. perhaps we can introduce some notion of what is sugar and what isn't. I bet the line
        ;; between what the desugar "optimizes" and what the query processors optimize might be a bit blurry
        (is (= (strip (to-bson [{:$match {"$and" [{"$expr" {"$ne" ["$description" "foo"]}}
                                                  {"$expr" {"$ne" ["$description" "bar"]}}]}}]))
               (strip
                (substitute {:desc (field-filter "description" :type/Text :string/!= ["foo" "bar"])}
                            ["[{$match: " (param :desc) "}]"])))))
      (testing :number/=
        (is (= (strip (to-bson [{:$match {"$or" [{"$expr" {"$eq" ["$price" 1]}}
                                                 {"$expr" {"$eq" ["$price" 2]}}]}}]))
               (strip
                (substitute {:price (field-filter "price" :type/Integer :number/= [1 2])}
                            ["[{$match: " (param :price) "}]"])))))
      (testing :number/!=
        (is (= (strip (to-bson [{:$match {"$and" [{"$expr" {"$ne" ["$price" 1]}}
                                                  {"$expr" {"$ne" ["$price" 2]}}]}}]))
               (strip
                (substitute {:price (field-filter "price" :type/Integer :number/!= [1 2])}
                            ["[{$match: " (param :price) "}]"]))))))))

(defn- json-raw
  "Wrap a string so it will be spliced directly into resulting JSON as-is. Analogous to HoneySQL `raw`."
  [^String s]
  (reify json.generate/JSONable
    (to-json [_ generator]
      (.writeRawValue ^JsonGenerator generator s))))

(deftest e2e-field-filter-test
  (mt/test-driver :mongo
    (testing "date ranges"
      (is (= [[295 "2014-03-01T00:00:00Z" 7 97]
              [642 "2014-03-02T00:00:00Z" 8 9]
              [775 "2014-03-01T00:00:00Z" 4 13]]
             (mt/rows
               (qp/process-query
                 (mt/query checkins
                   {:type       :native
                    :native     {:query         (json/generate-string
                                                 [{:$match (json-raw "{{date}}")}
                                                  {:$sort {:_id 1}}])
                                 :collection    "checkins"
                                 :template-tags {"date" {:name         "date"
                                                         :display-name "Date"
                                                         :type         :dimension
                                                         :dimension    $date}}}
                    :parameters [{:type   :date/range
                                  :target [:dimension [:template-tag "date"]]
                                  :value  "2014-03-01~2014-03-02"}]}))))))
    (testing "multiple values"
      (is (= [[1 "African"]
              [2 "American"]
              [3 "Artisan"]]
             (mt/rows
               (qp/process-query
                 (mt/query categories
                   {:type       :native
                    :native     {:query         (json/generate-string [{:$match (json-raw "{{id}}")}
                                                                       {:$sort {:_id 1}}])
                                 :collection    "categories"
                                 :template-tags {"id" {:name         "id"
                                                       :display-name "ID"
                                                       :type         :dimension
                                                       :dimension    $id}}}
                    :parameters [{:type   :number
                                  :target [:dimension [:template-tag "id"]]
                                  :value  "1,2,3"}]}))))))
    (testing "param not supplied"
      (is (= [[1 "2014-04-07T00:00:00Z" 5 12]]
             (mt/rows
               (qp/process-query
                 (mt/query checkins
                   {:type   :native
                    :native {:query         (json/generate-string
                                             [{:$match (json-raw "{{date}}")}
                                              {:$sort {:_id 1}}
                                              {:$limit 1}])
                             :collection    "checkins"
                             :template-tags {"date" {:name         "date"
                                                     :display-name "Date"
                                                     :type         :dimension
                                                     :dimension    $date}}}}))))))
    (testing "text params"
      (testing "using nested fields as parameters (#11597)"
        (mt/dataset geographical-tips
          (is (= [[5 "tupac"]]
                 (mt/rows
                   (qp/process-query
                     (mt/query tips
                       {:type       :native
                        :native     {:query         (json/generate-string
                                                     [{:$match (json-raw "{{username}}")}
                                                      {:$sort {:_id 1}}
                                                      {:$project {"username" "$source.username"}}
                                                      {:$limit 1}])
                                     :collection    "tips"
                                     :template-tags {"username" {:name         "username"
                                                                 :display-name "Username"
                                                                 :type         :dimension
                                                                 :dimension    $tips.source.username}}}
                        :parameters [{:type   :text
                                      :target [:dimension [:template-tag "username"]]
                                      :value  "tupac"}]})))))))
      (testing "operators"
        (testing "string"
          (doseq [[regex operator] [["tu" :string/starts-with]
                                    ["pac" :string/ends-with]
                                    ["tupac" :string/=]
                                    ["upa" :string/contains]]]
            (mt/dataset geographical-tips
              (is (= [[5 "tupac"]]
                     (mt/rows
                       (qp/process-query
                         (mt/query tips
                           {:type       :native
                            :native     {:query         (json/generate-string
                                                         [{:$match (json-raw "{{username}}")}
                                                          {:$sort {:_id 1}}
                                                          {:$project {"username" "$source.username"}}
                                                          {:$limit 1}])
                                         :collection    "tips"
                                         :template-tags {"username" {:name         "username"
                                                                     :display-name "Username"
                                                                     :type         :dimension
                                                                     :dimension    $tips.source.username}}}
                            :parameters [{:type   operator
                                          :target [:dimension [:template-tag "username"]]
                                          :value  [regex]}]}))))))))
        (testing "numeric"
          (doseq [[input operator pred] [[[1] :number/<= #(<= % 1)]
                                         [[2] :number/>= #(>= % 2)]
                                         [[2] :number/= #(= % 2)]
                                         [[2] :number/!= #(not= % 2)]
                                         [[1 3] :number/between #(<= 1 % 3)]]]
            (is (every? (comp pred second) ;; [id price]
                        (mt/rows
                          (qp/process-query
                            (mt/query venues
                              {:type       :native
                               :native     {:query         (json/generate-string
                                                            [{:$match (json-raw "{{price}}")}
                                                             {:$project {"price" "$price"}}
                                                             {:$sort {:_id 1}}
                                                             {:$limit 10}])
                                            :collection    "venues"
                                            :template-tags {"price" {:name "price"
                                                                     :display-name "Price"
                                                                     :type         :dimension
                                                                     :dimension    $price}}}
                               :parameters [{:type   operator
                                             :target [:dimension [:template-tag "price"]]
                                             :value  input}]})))))))
        (testing "variadic operators"
          (let [run-query! (fn [operator]
                             (mt/dataset geographical-tips
                               (mt/rows
                                 (qp/process-query
                                   (mt/query tips
                                     {:type       :native
                                      :native     {:query         (json/generate-string
                                                                   [{:$match (json-raw "{{username}}")}
                                                                    {:$sort {:_id 1}}
                                                                    {:$project {"username" "$source.username"}}
                                                                    {:$limit 20}])
                                                   :collection    "tips"
                                                   :template-tags {"username" {:name         "username"
                                                                               :display-name "Username"
                                                                               :type         :dimension
                                                                               :dimension    $tips.source.username}}}
                                      :parameters [{:type   operator
                                                    :target [:dimension [:template-tag "username"]]
                                                    :value  ["bob" "tupac"]}]})))))]
            (is (= #{"bob" "tupac"}
                   (into #{} (map second)
                         (run-query! :string/=))))
            (is (= #{}
                     (set/intersection
                      #{"bob" "tupac"}
                      ;; most of these are nil as most records don't have a username. not equal is a bit ambiguous in
                      ;; mongo. maybe they might want present but not equal semantics
                      (into #{} (map second)
                            (run-query! :string/!=)))))))))))
