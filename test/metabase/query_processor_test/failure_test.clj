(ns metabase.query-processor-test.failure-test
  "Tests for how the query processor as a whole handles failures."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.interface :as qp.i]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]))

(defn- bad-query []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :fields       [["datetime_field" (mt/id :venues :id) "MONTH"]]}})

(defn- bad-query-schema []
  [:map
   [:database [:= (mt/id)]]
   [:type     [:= :query]]
   [:query    [:map
               [:source-table [:= (mt/id :venues)]]
               [:fields       [:= [["datetime_field" (mt/id :venues :id) "MONTH"]]]]]]])

(defn- bad-query-preprocessed-schema []
  [:map
   [:database [:= (mt/id)]]
   [:type     [:= :query]]
   [:query    [:map
               [:source-table [:= (mt/id :venues)]]
               [:fields       [:= [[:field (mt/id :venues :id) {:temporal-unit :month}]]]]
               [:limit        [:= qp.i/absolute-max-results]]]]
   [:driver {:optional true} [:= :h2]]])

(def ^:private bad-query-native-schema
  [:map
   [:query  [:= (str "SELECT DATE_TRUNC('month', \"PUBLIC\".\"VENUES\".\"ID\") AS \"ID\" "
                     "FROM \"PUBLIC\".\"VENUES\" "
                     "LIMIT 1048575")]]
   [:params :nil]])

(deftest ^:parallel process-userland-query-test
  (testing "running a bad `userland-query` via `process-query` should return stacktrace, query, preprocessed query, and native query"
    (is (malli= [:map
                 [:status       [:= :failed]]
                 [:class        (ms/InstanceOfClass Class)]
                 [:error        :string]
                 [:stacktrace   [:sequential ms/NonBlankString]]
                 ;; `:database` is removed by the catch-exceptions middleware for historical reasons
                 [:json_query   (bad-query-schema)]
                 [:preprocessed (bad-query-preprocessed-schema)]
                 [:native       bad-query-native-schema]]
                (qp/process-query (qp/userland-query (bad-query)))))))

(deftest ^:parallel process-userland-query-test-2
  (testing "running a bad `userland-query` via `process-query` should return stacktrace, query, preprocessed query, and native query"
    (is (malli= [:map
                 [:database_id  [:= (mt/id)]]
                 [:started_at   (ms/InstanceOfClass java.time.ZonedDateTime)]
                 [:json_query   (bad-query-schema)]
                 [:native       bad-query-native-schema]
                 [:status       [:= :failed]]
                 [:class        (ms/InstanceOfClass Class)]
                 [:stacktrace   [:sequential ms/NonBlankString]]
                 [:context      [:= :question]]
                 [:error        ms/NonBlankString]
                 [:row_count    [:= 0]]
                 [:running_time ms/IntGreaterThanOrEqualToZero]
                 [:preprocessed (bad-query-preprocessed-schema)]
                 [:data         [:map
                                 [:rows [:= []]]
                                 [:cols [:= []]]]]]
                (qp/process-query (qp/userland-query (bad-query) {:context :question}))))))
