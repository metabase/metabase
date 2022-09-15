(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.test :refer :all]
            [clojure.string :as str]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.test :as mt]
            [metabase.util.date-2 :as u.date]))

(defn- formatting [x]
  (if (number? x)
    (int x)
    (-> x
        (str/replace  #"T" " ")
        (str/replace  #"Z" ""))))

(defn- test-date-extract
  [{:keys [aggregation breakout expressions fields limit]}]
  (if breakout
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :breakout    breakout})
         (mt/formatted-rows [formatting formatting]))
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :fields      fields})
         (mt/formatted-rows [formatting]))))

(mt/defdataset times-mixed
  [["times" [{:field-name "index"
              :base-type :type/Integer}
             {:field-name "dt"
              :base-type :type/DateTime}
             {:field-name "d"
              :base-type :type/Date}
             {:field-name "as_dt"
              :base-type :type/Text
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/ISO8601->DateTime}
             {:field-name "as_d"
              :base-type :type/Text
              :effective-type :type/Date
              :coercion-strategy :Coercion/ISO8601->Date}]
    [[1 #t "2004-03-19 09:19:09" #t "2004-03-19" "2004-03-19 09:19:09" "2004-03-19"]
     [2 #t "2008-06-20 10:20:10" #t "2008-06-20" "2008-06-20 10:20:10" "2008-06-20"]
     [3 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]
     [4 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]]]])

(def ^:private date-extraction-op->-unit
  {:get-second      :second-of-minute
   :get-minute      :minute-of-hour
   :get-hour        :hour-of-day
   :get-day-of-week :day-of-week
   :get-day         :day-of-month
   :get-month       :month-of-year
   :get-quarter     :quarter-of-year
   :get-year        :year})

(defn- extract
  [op x]
  (u.date/extract x (date-extraction-op->-unit op)))

(deftest extraction-function-tests
  (mt/dataset times-mixed
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-functions) :mongo)
      (testing "with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]]
          (doseq [op [:get-year :get-quarter :get-month :get-day :get-day-of-week :get-hour :get-minute :get-second]]
              (doseq [[expected query]
                      [[[[(extract op #t "2004-03-19 09:19:09")] [(extract op #t "2008-06-20 10:20:10")]
                         [(extract op #t "2012-11-21 11:21:11")] [(extract op #t "2012-11-21 11:21:11")]]
                        {:expressions {"expr" [op [:field field-id nil]]}
                         :fields      [[:expression "expr"]]}]

                       [[[(extract op #t "2004-03-19 09:19:09")] [(extract op #t "2008-06-20 10:20:10")]

                         [(extract op #t "2012-11-21 11:21:11")] [(extract op #t "2012-11-21 11:21:11")]]
                        {:aggregation [[op [:field field-id nil]]]}]

                       [(into [] (frequencies [(extract op #t "2004-03-19 09:19:09") (extract op #t "2008-06-20 10:20:10")
                                               (extract op #t "2012-11-21 11:21:11") (extract op #t "2012-11-21 11:21:11")]))
                        {:expressions {"expr" [op [:field field-id nil]]}
                         :aggregation [[:count]]
                         :breakout    [[:expression "expr"]]}]]]
                (testing (format "%s function works as expected on %s column for driver %s" op col-type driver/*driver*)
                  (is (= (set expected) (set (test-date-extract query)))))))))

      (testing "with date columns"
        (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]]
          (doseq [op [:get-year :get-quarter :get-month :get-day :get-day-of-week]]
              (doseq [[expected query]
                      [[[[(extract op #t "2004-03-19 09:19:09")] [(extract op #t "2008-06-20 10:20:10")]
                         [(extract op #t "2012-11-21 11:21:11")] [(extract op #t "2012-11-21 11:21:11")]]
                        {:expressions {"expr" [op [:field field-id nil]]}
                         :fields      [[:expression "expr"]]}]

                       [[[(extract op #t "2004-03-19 09:19:09")] [(extract op #t "2008-06-20 10:20:10")]
                         [(extract op #t "2012-11-21 11:21:11")] [(extract op #t "2012-11-21 11:21:11")]]
                        {:aggregation [[op [:field field-id nil]]]}]

                       [(into [] (frequencies [(extract op #t "2004-03-19 09:19:09") (extract op #t "2008-06-20 10:20:10")
                                               (extract op #t "2012-11-21 11:21:11") (extract op #t "2012-11-21 11:21:11")]))
                        {:expressions {"expr" [op [:field field-id nil]]}
                         :aggregation [[:count]]
                         :breakout    [[:expression "expr"]]}]]]
                (testing (format "%s function works as expected on %s column for driver %s" op col-type driver/*driver*)
                  (is (= (set expected) (set (test-date-extract query))))))))))

    ;; need to have seperate tests for mongo it doesn't have supports for casting yet
    (mt/test-driver :mongo
      (testing "with datetimes columns"
        (let [[col-type field-id] [:datetime (mt/id :times :dt)]]
          (doseq [op [:get-year :get-quarter :get-month :get-day :get-day-of-week :get-hour :get-minute :get-second]]
            (doseq [[expected query]
                    [[[[(extract op #t "2004-03-19 09:19:09")] [(extract op #t "2008-06-20 10:20:10")]
                       [(extract op #t "2012-11-21 11:21:11")] [(extract op #t "2012-11-21 11:21:11")]]
                      {:expressions {"expr" [op [:field field-id nil]]}
                       :fields      [[:expression "expr"]]}]

                     [(into [] (frequencies [(extract op #t "2004-03-19 09:19:09") (extract op #t "2008-06-20 10:20:10")
                                             (extract op #t "2012-11-21 11:21:11") (extract op #t "2012-11-21 11:21:11")]))
                      {:expressions {"expr" [op [:field field-id nil]]}
                       :aggregation [[:count]]
                       :breakout    [[:expression "expr"]]}]]]
              (testing (format "%s function works as expected on %s column for driver %s" op col-type driver/*driver*)
                (is (= (set expected) (set (test-date-extract query)))))))))

      (testing "with date columns"
        (let [[col-type field-id] [:date (mt/id :times :d)]]
          (doseq [op [:get-year :get-quarter :get-month :get-day :get-day-of-week]]
            (doseq [[expected query]
                    [[[[(extract op #t "2004-03-19 09:19:09")] [(extract op #t "2008-06-20 10:20:10")]
                       [(extract op #t "2012-11-21 11:21:11")] [(extract op #t "2012-11-21 11:21:11")]]
                      {:expressions {"expr" [op [:field field-id nil]]}
                       :fields      [[:expression "expr"]]}]

                     [(into [] (frequencies [(extract op #t "2004-03-19 09:19:09") (extract op #t "2008-06-20 10:20:10")
                                             (extract op #t "2012-11-21 11:21:11") (extract op #t "2012-11-21 11:21:11")]))
                      {:expressions {"expr" [op [:field field-id nil]]}
                       :aggregation [[:count]]
                       :breakout    [[:expression "expr"]]}]]]
              (testing (format "%s function works as expected on %s column for driver %s" op col-type driver/*driver*)
                (is (= (set expected) (set (test-date-extract query))))))))))))

(defn- date-math
  [op x amount unit col-type]
  (let [amount (if (= op :date-add)
                 amount
                 (- amount))
        result (cond
                 ;; unlike everybody else, vertica decided when adding 1 year it will do that by adding 365 days,
                 ;; or 90 days if you want to add a quarter.
                 ;; That means if you do `select date '2004-02-02' + interval '2 year';` in vertica, it will returns
                 ;; `2006-02-01` because 2004 is a leap year. All others DBs will return `2006-02-02` instead.
                 (and (= driver/*driver* :vertica) (#{:year :quarter :month} unit))
                 (u.date/add x :day (* amount (case unit
                                                :year    365
                                                :quarter (* 3 30)
                                                :month   30)))
                 :else
                 (u.date/add x unit amount))]
    (t/format "yyyy-MM-dd HH:mm:ss" result)))

(defn- mongo-major-version [db]
  (-> (get-in db [:details :version])
      (str/split #"\.")
      first
      parse-long))

(deftest date-math-tests
  (mt/dataset times-mixed
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-functions) :mongo)
     (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]]
       (doseq [op [:date-add :date-subtract]]
         (doseq [unit [:year :quarter :month :day :hour :minute :second]]
           (doseq [[expected query]
                   [[[[(date-math op #t "2004-03-19 09:19:09" 2 unit col-type)] [(date-math op #t "2008-06-20 10:20:10" 2 unit col-type)]
                      [(date-math op #t "2012-11-21 11:21:11" 2 unit col-type)] [(date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]]
                     {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                      :fields      [[:expression "expr"]]}]

                    [[[(date-math op #t "2004-03-19 09:19:09" 2 unit col-type)] [(date-math op #t "2008-06-20 10:20:10" 2 unit col-type)]
                      [(date-math op #t "2012-11-21 11:21:11" 2 unit col-type)] [(date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]]
                     {:aggregation [[op [:field field-id nil] 2 unit]]}]

                    [(into [] (frequencies
                                [(date-math op #t "2004-03-19 09:19:09" 2 unit col-type) (date-math op #t "2008-06-20 10:20:10" 2 unit col-type)
                                 (date-math op #t "2012-11-21 11:21:11" 2 unit col-type) (date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]))
                     {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                      :aggregation [[:count]]
                      :breakout    [[:expression "expr"]]}]]]
             (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
              (is (= (set expected) (set (test-date-extract query)))))))))

     (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]]
       (doseq [op [:date-add :date-subtract]]
         (doseq [unit [:year :quarter :month :day]]
           (doseq [[expected query]
                   [[[[(date-math op #t "2004-03-19 00:00:00" 2 unit col-type)] [(date-math op #t "2008-06-20 00:00:00" 2 unit col-type)]
                      [(date-math op #t "2012-11-21 00:00:00" 2 unit col-type)] [(date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]]
                     {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                      :fields      [[:expression "expr"]]}]

                    [[[(date-math op #t "2004-03-19 00:00:00" 2 unit col-type)] [(date-math op #t "2008-06-20 00:00:00" 2 unit col-type)]
                      [(date-math op #t "2012-11-21 00:00:00" 2 unit col-type)] [(date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]]
                     {:aggregation [[op [:field field-id nil] 2 unit]]}]

                    [(into [] (frequencies
                                [(date-math op #t "2004-03-19 00:00:00" 2 unit col-type) (date-math op #t "2008-06-20 00:00:00" 2 unit col-type)
                                 (date-math op #t "2012-11-21 00:00:00" 2 unit col-type) (date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]))
                     {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                      :aggregation [[:count]]
                      :breakout    [[:expression "expr"]]}]]]
             (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
                (is (= (set expected) (set (test-date-extract query))))))))))

   (mt/test-driver :mongo
     ;; date arithmetic doesn't supports until mongo 5+
     (when (> (mongo-major-version (mt/db)) 4)
       (let [[col-type field-id] [:datetime (mt/id :times :dt)]]
         (doseq [op [:date-add :date-subtract]]
           (doseq [unit [:year :quarter :month :day :hour :minute :second]]
             (doseq [[expected query]
                     [[[[(date-math op #t "2004-03-19 09:19:09" 2 unit col-type)] [(date-math op #t "2008-06-20 10:20:10" 2 unit col-type)]
                        [(date-math op #t "2012-11-21 11:21:11" 2 unit col-type)] [(date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]]
                       {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                        :fields      [[:expression "expr"]]}]

                      [(into [] (frequencies
                                  [(date-math op #t "2004-03-19 09:19:09" 2 unit col-type) (date-math op #t "2008-06-20 10:20:10" 2 unit col-type)
                                   (date-math op #t "2012-11-21 11:21:11" 2 unit col-type) (date-math op #t "2012-11-21 11:21:11" 2 unit col-type)]))
                       {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                        :aggregation [[:count]]
                        :breakout    [[:expression "expr"]]}]]]
               (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
                 (is (= (set expected) (set (test-date-extract query)))))))))

       (let [[col-type field-id] [:date (mt/id :times :d)]]
         (doseq [op [:date-add :date-subtract]]
           (doseq [unit [:year :quarter :month :day]]
             (doseq [[expected query]
                     [[[[(date-math op #t "2004-03-19 00:00:00" 2 unit col-type)] [(date-math op #t "2008-06-20 00:00:00" 2 unit col-type)]
                        [(date-math op #t "2012-11-21 00:00:00" 2 unit col-type)] [(date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]]
                       {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                        :fields      [[:expression "expr"]]}]

                      [(into [] (frequencies
                                  [(date-math op #t "2004-03-19 00:00:00" 2 unit col-type) (date-math op #t "2008-06-20 00:00:00" 2 unit col-type)
                                   (date-math op #t "2012-11-21 00:00:00" 2 unit col-type) (date-math op #t "2012-11-21 00:00:00" 2 unit col-type)]))
                       {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                        :aggregation [[:count]]
                        :breakout    [[:expression "expr"]]}]]]
               (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
                 (is (= (set expected) (set (test-date-extract query))))))))))

     (when-not (> (mongo-major-version (mt/db)) 4)
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Date arithmetic not supported in versions before 5"
                             (mt/compile (mt/mbql-query times {:expressions {"expr" [:date-add [:field (mt/id :times :dt) nil] 2 :year]}
                                                               :fields      [[:expression "expr"]]}))))
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Date arithmetic not supported in versions before 5"
                             (mt/compile (mt/mbql-query times {:expressions {"expr" [:date-subtract [:field (mt/id :times :dt) nil] 2 :year]}
                                                               :fields      [[:expression "expr"]]}))))))))
