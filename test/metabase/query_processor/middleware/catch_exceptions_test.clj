(ns metabase.query-processor.middleware.catch-exceptions-test
  (:require [clojure.test :refer :all]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.query-processor :as qp]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.test.util.log :as tu.log]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.query-processor.context.default :as context.default]
            [schema.core :as s]
            [medley.core :as m]))

(use-fixtures :each (fn [thunk]
                      (mt/with-log-level :fatal
                        (thunk))))

(deftest exception-chain-test
  (testing "Should be able to get a sequence of exceptions by following causes, with the top-level Exception first"
    (let [e1 (ex-info "1" {:level 1})
          e2 (ex-info "2" {:level 2} e1)
          e3 (ex-info "3" {:level 3} e2)]
      (is (= [e1 e2 e3]
             (#'catch-exceptions/exception-chain e3))))))

(deftest exception-response-test
  (testing "Should nicely format a chain of exceptions, with the top-level Exception appearing first"
    (testing "lowest-level error `:type` should be pulled up to the top-level"
      (let [e1 (ex-info "1" {:level 1})
            e2 (ex-info "2" {:level 2, :type error-type/qp} e1)
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

(defn- catch-exceptions
  ([thunk]
   (catch-exceptions thunk {}))

  ([thunk query]
   (let [qp (-> (fn [_query rff context]
                  (thunk)
                  (context/reducef rff context {} []))
                catch-exceptions/catch-exceptions
                qp.reducible/async-qp
                qp.reducible/sync-qp)]
     (-> (qp query context.default/default-rff (context.default/default-context))
         (update :data dissoc :rows)))))

(deftest no-exception-test
  (testing "No Exception -- should return response as-is"
    (is (= {:data {}, :row_count 0, :status :completed}
           (catch-exceptions (fn []))))))

(deftest sync-exception-test
  (testing "if the QP throws an Exception (synchronously), should format the response appropriately"
    (is (= {:status     :failed
            :class      java.lang.Exception
            :error      "Something went wrong"
            :stacktrace true
            :json_query {}
            :row_count  0
            :data       {:cols []}}
           (-> (catch-exceptions (fn [] (throw (Exception. "Something went wrong"))))
               (update :stacktrace boolean))))))

(deftest async-exception-test
  (testing "if an Exception is returned asynchronously by `raise`, should format it the same way"
    (is (= {:status     :failed
            :class      java.lang.Exception
            :error      "Something went wrong"
            :stacktrace true
            :json_query {}
            :row_count  0
            :data       {:cols []}}
           (-> (catch-exceptions
                (fn [] (throw (Exception. "Something went wrong"))))
               (update :stacktrace boolean))))))

(deftest include-query-execution-info-test
  (testing "Should include info from QueryExecution if added to the thrown/raised Exception"
    (is (= {:status     :failed
            :class      java.lang.Exception
            :error      "Something went wrong"
            :stacktrace true
            :card_id    300
            :json_query {}
            :row_count  0
            :data       {:cols []}
            :a          100
            :b          200}
           (-> (catch-exceptions
                (fn []
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
                                  (Exception. "Something went wrong")))))
               (update :stacktrace boolean))))))

(deftest permissions-test
  (mt/with-temp-copy-of-db
    (perms/revoke-data-perms! (group/all-users) (mt/id))
    (perms/grant-permissions! (group/all-users) (mt/id) "PUBLIC" (mt/id :venues))
    (testing (str "If someone doesn't have native query execution permissions, they shouldn't see the native version of "
                  "the query in the error response")
      (test-users/with-test-user :rasta
        (is (schema= {:native (s/eq nil), :preprocessed (s/pred map?), s/Any s/Any}
                     (qp/process-userland-query
                      (mt/mbql-query venues {:fields [!month.id]}))))))

    (testing "They should see it if they have ad-hoc native query perms"
      (perms/grant-native-readwrite-permissions! (group/all-users) (mt/id))
      (test-users/with-test-user :rasta
        ;; this is not actually a valid query
        (is (schema= {:native       (s/eq {:query  (str "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"VENUES\".\"ID\", 'yyyyMM'), 'yyyyMM') "
                                                        "AS \"ID\" FROM \"PUBLIC\".\"VENUES\" LIMIT 1048575")
                                           :params nil})
                      :preprocessed (s/pred map?)
                      s/Any         s/Any}
                     (qp/process-userland-query
                      (mt/mbql-query venues {:fields [!month.id]}))))))))
