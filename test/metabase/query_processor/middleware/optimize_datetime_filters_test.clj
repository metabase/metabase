(ns metabase.query-processor.middleware.optimize-datetime-filters-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.optimize-datetime-filters :as optimize-datetime-filters]
            [metabase.test.data :as data]
            [metabase.util.date :as du]))

(defn- optimize-datetime-filters [filter-clause]
  (-> ((optimize-datetime-filters/optimize-datetime-filters identity)
       {:database 1
        :type     :query
        :query    {:filter filter-clause}})
      (get-in [:query :filter])))

(def ^:private test-units-and-values
  [{:unit         :second
    :filter-value #inst "2019-09-24T12:19:30.500Z"
    :lower        #inst "2019-09-24T12:19:30.000Z"
    :upper        #inst "2019-09-24T12:19:31.000Z"}
   {:unit         :minute
    :filter-value #inst "2019-09-24T12:19:30.000Z"
    :lower        #inst "2019-09-24T12:19:00.000Z"
    :upper        #inst "2019-09-24T12:20:00.000Z"}
   {:unit         :hour
    :filter-value #inst "2019-09-24T12:30:00.000Z"
    :lower        #inst "2019-09-24T12:00:00.000Z"
    :upper        #inst "2019-09-24T13:00:00.000Z"}
   {:unit         :day
    :filter-value #inst "2019-09-24T12:00:00.000Z"
    :lower        #inst "2019-09-24"
    :upper        #inst "2019-09-25"}
   {:unit         :week
    :filter-value #inst "2019-09-24"
    :lower        #inst "2019-09-22"
    :upper        #inst "2019-09-29"}
   {:unit         :month
    :filter-value #inst "2019-09-24"
    :lower        #inst "2019-09-01"
    :upper        #inst "2019-10-01"}
   {:unit         :quarter
    :filter-value #inst "2019-09-01"
    :lower        #inst "2019-07-01"
    :upper        #inst "2019-10-01"}
   {:unit         :year
    :filter-value #inst "2019-09-24"
    :lower        #inst "2019-01-01"
    :upper        #inst "2020-01-01"}])

(deftest optimize-datetime-filters-test
  (doseq [{:keys [unit filter-value lower upper]} test-units-and-values]
    (let [lower [:absolute-datetime lower :default]
          upper [:absolute-datetime upper :default]]
      (testing unit
        (testing :=
          (is (= [:and
                  [:>= [:datetime-field [:field-id 1] :default] lower]
                  [:< [:datetime-field [:field-id 1] :default] upper]]
                 (optimize-datetime-filters
                  [:=
                   [:datetime-field [:field-id 1] unit]
                   [:absolute-datetime filter-value unit]]))))
        (testing :!=
          (is (= [:or
                  [:< [:datetime-field [:field-id 1] :default] lower]
                  [:>= [:datetime-field [:field-id 1] :default] upper]]
                 (optimize-datetime-filters
                  [:!=
                   [:datetime-field [:field-id 1] unit]
                   [:absolute-datetime filter-value unit]]))))
        (doseq [filter-type [:< :<=]]
          (testing filter-type
            (is (= [filter-type [:datetime-field [:field-id 1] :default] lower]
                   (optimize-datetime-filters
                    [filter-type
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]])))))
        (doseq [filter-type [:> :>=]]
          (testing filter-type
            (is (= [filter-type [:datetime-field [:field-id 1] :default] upper]
                   (optimize-datetime-filters
                    [filter-type
                     [:datetime-field [:field-id 1] unit]
                     [:absolute-datetime filter-value unit]])))))
        (testing :betweenn
          (is (= [:and
                  [:>= [:datetime-field [:field-id 1] :default] lower]
                  [:< [:datetime-field [:field-id 1] :default] upper]]
                 (optimize-datetime-filters
                  [:between
                   [:datetime-field [:field-id 1] unit]
                   [:absolute-datetime filter-value unit]
                   [:absolute-datetime filter-value unit]]))))))))

(deftest timezones-test
  (let [optimize-with-timezone (fn [inst timezone]
                                 (-> ((optimize-datetime-filters/optimize-datetime-filters identity)
                                      {:database 1
                                       :type     :query
                                       :query    {:filter [:=
                                                           [:datetime-field [:field-id 1] :day]
                                                           [:absolute-datetime inst :day]]}
                                       :settings {:report-timezone timezone}})
                                     (get-in [:query :filter])))]
    (doseq [[timezone {:keys [inst lower upper]}]
            {"UTC"        {:inst  "2015-11-18T00:00:00.000000000-00:00"
                           :lower "2015-11-18T00:00:00.000000000-00:00"
                           :upper "2015-11-19T00:00:00.000000000-00:00"}
             "US/Pacific" {:inst  "2015-11-18T08:00:00.000000000-00:00"
                           :lower "2015-11-18T08:00:00.000000000-00:00"
                           :upper "2015-11-19T08:00:00.000000000-00:00"}}]
      (testing (format "%s timezone" timezone)
        (let [inst'  (du/->Timestamp inst "UTC")
              lower' (du/->Timestamp lower "UTC")
              upper' (du/->Timestamp upper "UTC")]
          (testing "lower-bound and upper-bound util fns"
            (is (= lower'
                   (#'optimize-datetime-filters/lower-bound :day inst' timezone))
                (format "lower bound of day(%s) in the %s timezone should be %s" inst timezone lower))
            (is (= upper'
                   (#'optimize-datetime-filters/upper-bound :day inst' timezone))
                (format "upper bound of day(%s) in the %s timezone should be %s" inst timezone upper)))
          (testing "optimize-with-datetime"
            (let [expected [:and
                            [:>= [:datetime-field [:field-id 1] :default] [:absolute-datetime lower' :default]]
                            [:<  [:datetime-field [:field-id 1] :default] [:absolute-datetime upper' :default]]]]
              (is (= expected
                     (optimize-with-timezone inst' timezone))
                  (format "= %s in the %s timezone should be optimized to range %s -> %s"
                          inst timezone lower upper)))))))))

(deftest skip-optimization-test
  (let [clause [:= [:datetime-field [:field-id 1] :day] [:absolute-datetime #inst "2019-01-01" :month]]]
    (is (= clause
           (optimize-datetime-filters clause))
        "Filters with different units in the datetime field and absolute-datetime shouldn't get optimized")))

;; Make sure the optimization logic is actually applied in the resulting native query!
(defn- filter->sql [filter-clause]
  (let [result (qp/query->native
                 (data/mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      filter-clause}))]
    (update result :query #(-> (last (re-matches #"^.*(WHERE .*$)" %))
                               (str/replace #"\"" "")
                               (str/replace #"PUBLIC\." "")))))

(deftest e2e-test
  (testing :=
    (is (= {:query  "WHERE (CHECKINS.DATE >= ? AND CHECKINS.DATE < ?)"
            :params [#inst "2019-09-24T00:00:00.000000000-00:00"
                     #inst "2019-09-25T00:00:00.000000000-00:00"]}
           (data/$ids checkins
             (filter->sql [:= !day.date "2019-09-24T12:00:00.000Z"])))))
  (testing :<
    (is (= {:query  "WHERE CHECKINS.DATE < ?"
            :params [#inst "2019-09-24T00:00:00.000000000-00:00"]}
           (data/$ids checkins
             (filter->sql [:< !day.date "2019-09-24T12:00:00.000Z"])))))
  (testing :between
    (is (= {:query  "WHERE (CHECKINS.DATE >= ? AND CHECKINS.DATE < ?)"
            :params [#inst "2019-09-01T00:00:00.000000000-00:00"
                     #inst "2019-11-01T00:00:00.000000000-00:00"]}
           (data/$ids checkins
             (filter->sql [:between !month.date "2019-09-02T12:00:00.000Z" "2019-10-05T12:00:00.000Z"]))))))
