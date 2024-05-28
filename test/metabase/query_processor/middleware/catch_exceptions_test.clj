(ns metabase.query-processor.middleware.catch-exceptions-test
  "There are additional tests in [[metabase.query-processor-test.failure-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.catch-exceptions
    :as catch-exceptions]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]))

(deftest ^:parallel exception-chain-test
  (testing "Should be able to get a sequence of exceptions by following causes, with the top-level Exception first"
    (let [e1 (ex-info "1" {:level 1})
          e2 (ex-info "2" {:level 2} e1)
          e3 (ex-info "3" {:level 3} e2)]
      (is (= [e1 e2 e3]
             (#'catch-exceptions/exception-chain e3))))))

(deftest ^:parallel exception-response-test
  (testing "Should nicely format a chain of exceptions, with the top-level Exception appearing first"
    (testing "lowest-level error `:type` should be pulled up to the top-level"
      (let [e1 (ex-info "1" {:level 1})
            e2 (ex-info "2" {:level 2, :type qp.error-type/qp} e1)
            e3 (ex-info "3" {:level 3} e2)]
        (is (= {:status     :failed
                :class      clojure.lang.ExceptionInfo
                :error      "1"
                :stacktrace true
                :error_type :qp
                :ex-data    {:level 1}
                :via        [{:status     :failed
                              :class      clojure.lang.ExceptionInfo
                              :error      "2"
                              :stacktrace true
                              :ex-data    {:level 2, :type :qp}
                              :error_type :qp}
                             {:status     :failed
                              :class      clojure.lang.ExceptionInfo
                              :error      "3"
                              :stacktrace true
                              :ex-data    {:level 3}}]}
               (-> (#'catch-exceptions/exception-response e3)
                   (update :stacktrace sequential?)
                   (update :via (fn [causes]
                                  (for [cause causes]
                                    (update cause :stacktrace sequential?)))))))))))


(defn catch-exceptions
  ([run]
   (catch-exceptions run {}))

  ([run query]
   (let [query    (merge {:type :query} query)
         metadata {}
         rows     []
         qp       (fn [query rff]
                    (run)
                    (binding [qp.pipeline/*execute* (fn [_driver _query respond]
                                                      (respond metadata rows))]
                      (qp.pipeline/*run* query rff)))
         qp       (catch-exceptions/catch-exceptions qp)
         result   (driver/with-driver :h2
                    (qp (qp/userland-query query) qp.reducible/default-rff))]
     (cond-> result
       (map? result) (update :data dissoc :rows)))))

(deftest ^:parallel no-exception-test
  (testing "No Exception -- should return response as-is"
    (is (= {:data {}, :row_count 0, :status :completed}
           (catch-exceptions (fn run []))))))

(deftest ^:synchronized no-exception-test-2
  (testing "compile and preprocess should not be called if no exception occurs"
    (let [compile-call-count (atom 0)
          preprocess-call-count (atom 0)]
      (with-redefs [qp.compile/compile       (fn [_] (swap! compile-call-count inc))
                    qp.preprocess/preprocess (fn [_] (swap! preprocess-call-count inc))]
        (is (= {:data {}, :row_count 0, :status :completed}
               (catch-exceptions (fn run []))))
        (is (= 0 @compile-call-count))
        (is (= 0 @preprocess-call-count))))))

(deftest ^:parallel sync-exception-test
  (testing "if the QP throws an Exception (synchronously), should format the response appropriately"
    (is (=? {:status     :failed
             :class      (partial = java.lang.Exception)
             :error      "Something went wrong"
             :stacktrace vector?
             :json_query {}
             :row_count  0
             :data       {:cols []}}
            (catch-exceptions (fn [] (throw (Exception. "Something went wrong"))))))))

(deftest ^:parallel catch-exceptions-test
  (testing "include-query-execution-info-test"
    (testing "Should include info from QueryExecution if added to the thrown/raised Exception"
      (binding [qp.pipeline/*run* (fn [_query _rff]
                                    (throw (ex-info "Something went wrong."
                                                    {:query-execution {:a            100
                                                                       :b            200
                                                                       :card_id      300
                                                                       ;; these keys should all get removed
                                                                       :result_rows  400
                                                                       :hash         500
                                                                       :executor_id  500
                                                                       :dashboard_id 700
                                                                       :pulse_id     800
                                                                       :native       900}}
                                                    (Exception. "Something went wrong"))))]
        (is (=? {:status     :failed
                 :class      (partial = java.lang.Exception)
                 :error      "Something went wrong"
                 :stacktrace vector?
                 :card_id    300
                 :json_query {}
                 :row_count  0
                 :data       {:cols []}
                 :a          100
                 :b          200}
                (catch-exceptions (fn run []) {})))))))

(deftest ^:parallel catch-exceptions-test-2
  (testing "Should always include :error (#23258, #23281)"
    (testing "Uses error message if present"
      (is (= "Something went wrong"
             (-> (fn [] (throw (Exception. "Something went wrong")))
                 (catch-exceptions)
                 :error))))
    (testing "Has a default if no message on error"
      (is (= "Error running query"
             (-> (fn [] (throw (ex-info nil {})))
                 (catch-exceptions)
                 :error))))))

(deftest permissions-test
  (mt/with-temp-copy-of-db
    (mt/with-no-data-perms-for-all-users!
      (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
      (testing (str "If someone doesn't have native query execution permissions, they shouldn't see the native version of "
                    "the query in the error response")
        (is (=? {:native nil, :preprocessed map?}
                (test.users/with-test-user :rasta
                  (qp/process-query
                   (qp/userland-query
                    (mt/mbql-query venues {:fields [!month.id]})))))))

      (testing "They should see it if they have ad-hoc native query perms"
        (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
        ;; this is not actually a valid query
        (is (=? {:native       {:query  (str "SELECT DATE_TRUNC('month', \"PUBLIC\".\"VENUES\".\"ID\") AS \"ID\""
                                             " FROM \"PUBLIC\".\"VENUES\" LIMIT 1048575")
                                :params nil}
                 :preprocessed map?}
                (test.users/with-test-user :rasta
                  (qp/process-query
                   (qp/userland-query
                    (mt/mbql-query venues {:fields [!month.id]}))))))))))
