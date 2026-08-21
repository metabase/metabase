(ns ^:mb/driver-tests metabase.query-processor.constraints-test
  "Test for MBQL `:constraints`"
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(defn- mbql-query []
  (mt/mbql-query venues
    {:fields   [$name]
     :order-by [[:asc $id]]}))

(defn- native-query []
  (qp.compile/compile (mbql-query)))

(deftest ^:parallel max-results-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Do `:max-results` constraints affect the number of rows returned by native queries?"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
              (qp/process-query
               {:database    (mt/id)
                :type        :native
                :native      (native-query)
                :constraints {:max-results 5}})))))))

(deftest ^:parallel max-results-userland-query-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Do max results constraints work when running a userland query e.g. like we use for endpoints like `POST /api/dataset`?"
      ;; `:constraints` are applied by the server after [[qp/userland-query-with-default-constraints]], which drops
      ;; whatever the query arrived with so the server's own limits are the ones that count
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
              (qp/process-query
               (-> {:database (mt/id)
                    :type     :native
                    :native   (native-query)}
                   (qp/userland-query-with-default-constraints {:context :question})
                   (assoc :constraints {:max-results 5})))))))))

(deftest ^:parallel userland-query-drops-request-supplied-options-test
  (testing "constraints and non-caller-settable middleware options on the incoming query are dropped"
    (let [query (qp/userland-query-with-default-constraints
                 {:database    1
                  :type        :native
                  :native      {:query "SELECT 1"}
                  :constraints {:max-results 10000, :max-results-bare-rows 10000}
                  :middleware  {:disable-max-results?   true
                                :ignore-cached-results? true}}
                 {:context :question})]
      (is (nil? (:constraints query)))
      (is (nil? (get-in query [:middleware :disable-max-results?])))
      (testing "options a caller may legitimately set are kept"
        (is (true? (get-in query [:middleware :ignore-cached-results?])))))))

(deftest ^:parallel override-limit-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "constraints should override MBQL `:limit` if lower"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]]
             (mt/rows
              (qp/process-query
               (-> (mbql-query)
                   (assoc-in [:query :limit] 10)
                   (assoc :constraints {:max-results 3})))))))))

(deftest ^:parallel override-limit-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "However if `:limit` is lower than `:constraints` we should not return more than the `:limit`"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
              (qp/process-query
               (-> (mbql-query)
                   (assoc-in [:query :limit] 5)
                   (assoc :constraints {:max-results 10})))))))))
