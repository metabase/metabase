(ns metabase.driver.mongo.execute-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.async.streaming-response :as streaming-response]
   [metabase.driver.mongo.conversion :as mongo.conversion]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache.impl :as middleware.cache.impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   #_(com.mongodb BasicDBObject)
   (java.util NoSuchElementException)))

(set! *warn-on-reflection* true)

(defn- make-mongo-cursor [rows]
  (let [counter (volatile! 0)]
    (reify com.mongodb.client.MongoCursor
      (hasNext [_] (< @counter (count rows)))
      (next [_] (let [i @counter]
                  (vswap! counter inc)
                  (if (< i (count rows))
                    (mongo.conversion/to-document (get rows i))
                    (throw (NoSuchElementException. (str "no element at " i))))))
      (close [_]))))

(defn- make-mongo-aggregate-iterable [rows]
  (reify com.mongodb.client.AggregateIterable
    (cursor [_] (make-mongo-cursor rows))))

(deftest ^:parallel field-filter-relative-time-native-test
  (mt/test-driver :mongo
    (let [now (str (java.time.Instant/now))]
      (binding [mongo.execute/*aggregate*
                (fn [& _] (make-mongo-aggregate-iterable
                           [{"_id" 0
                             "name" "Crowberto"
                             "alias" "the Brave"}
                            {"_id" 1
                             "name" "Rasta"
                             "last_login" now
                             "nickname" "Blue"}]))]
        (testing "Projected and first-row fields are returned"
          (let [query {:database (mt/id)
                       :native
                       {:collection "users"
                        :query "[{\"$match\": {\"id\": {\"$lt\": 42}}},
                                 {\"$project\": {\"name\": true, \"last_login\": 1}}]"}
                       :type "native"}]
            (is (= {:rows [[0 "Crowberto" nil "the Brave"]
                           [1 "Rasta"     now nil]]
                    :columns ["_id" "name" "last_login" "alias"]}
                   (mt/rows+column-names (qp/process-query query))))))
        (testing "Columns can be suppressed"
          (let [query {:database (mt/id)
                       :native
                       {:collection "users"
                        :query "[{\"$project\": {\"name\": 2, \"last_login\": 1,
                                  \"suppressed0\": 0, \"supressed-false\": false}},
                                 {\"$match\": {\"id\": {\"$lt\": 42}}}]"}
                       :type "native"}]
            (is (= {:rows [[0 "Crowberto" nil "the Brave"]
                           [1 "Rasta"     now nil]]
                    :columns ["_id" "name" "last_login" "alias"]}
                   (mt/rows+column-names (qp/process-query query))))))))))

(deftest kill-an-in-flight-query-test
  (mt/test-driver
   :mongo
   (mt/dataset
    test-data
    ;; Dummy query execution here. If the dataset was not initialized before running this test, the timing gets out of
    ;; sync and test fails. I suspect dataset initialization happens after (or while) the future is executed.
    ;; To overcome that next line is executed - and dataset initialization forced - before the test code runs.
    (mt/run-mbql-query people {:limit 10})
    (let [canceled-chan (a/chan)]
      (binding [qp.pipeline/*canceled-chan* canceled-chan]
        (let [query (mt/mbql-query orders
                                   {:aggregation [[:sum $total]],
                                    :breakout [!month.created_at],
                                    :order-by [[:asc !month.created_at]],
                                    :joins [{:alias "People_User",
                                             :strategy :left-join,
                                             :condition
                                             [:!= $user_id &People_User.people.id],
                                             :source-table $$people}]})]
          (future (Thread/sleep 500)
                  (a/>!! canceled-chan ::streaming-response/request-canceled))
          (testing "Cancel signal kills the in progress query"
            (is (thrown-with-msg? Throwable
                                  #"Command failed with error 11601.*operation was interrupted"
                                  (qp/process-query query))))))))))

(deftest ^:synchronized question-base-on-native-model-cache-test
  (testing "Question based on native model is cacheable (#43901)"
    (mt/test-drivers
     #{:mongo}
     (t2.with-temp/with-temp
       [:model/Card c {:type :model
                       :dataset_query {:database (mt/id)
                                       :type     :native
                                       :native   {:template_tags {}
                                                  :collection "orders"
                                                  :query (str "[{\"$addFields\": {}}\n"
                                                              " {\"$limit\":1}]")}}}]
       (mt/with-temporary-setting-values [enable-query-caching true]
         (let [orig-freeze! @#'middleware.cache.impl/freeze!
               freeze-started (atom false)
               thrown-data (atom [])]
           (with-redefs [middleware.cache.impl/freeze! (fn [& args]
                                                         (reset! freeze-started true)
                                                         (try
                                                           (apply orig-freeze! args)
                                                           (catch Throwable t
                                                             (swap! thrown-data conj t)
                                                             (throw t))))]
             (let [model-based-query (-> (mt/mbql-query orders {:source-table (str "card__" (:id c))})
                                         (update :cache_strategy assoc
                                                 ;; Enable caching for current query
                                                 :avg-execution-time 5000
                                                 :min_duration_ms 1
                                                 :multiplier 100000
                                                 :type :ttl))]
               (qp/process-query model-based-query)
               (testing "Sanity: freeze! caching function ran"
                 (is (true? @freeze-started)))
               (testing "No exception was thrown during results cache serialization"
                 (is (zero? (count @thrown-data))))))))))))
