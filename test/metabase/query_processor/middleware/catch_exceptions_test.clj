(ns metabase.query-processor.middleware.catch-exceptions-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [schema.core :as s]))

(deftest exception-chain-test
  (testing "Should be able to get a sequence of exceptions by following causes, with the top-level Exception first"
    (let [e1 (ex-info "1" {:level 1})
          e2 (ex-info "2" {:level 2} e1)
          e3 (ex-info "3" {:level 3} e2)]
      (is (= [e1 e2 e3]
             (#'catch-exceptions/exception-chain e3))))))

(deftest exception-response-test
  (testing "Should nicely format a chain of exceptions, with the top-level Exception appearing first"
    (let [e1 (ex-info "1" {:level 1})
          e2 (ex-info "2" {:level 2} e1)
          e3 (ex-info "3" {:level 3} e2)]
      (is (= {:status     :failed,
              :class      clojure.lang.ExceptionInfo
              :error      "1"
              :stacktrace true
              :ex-data    {:level 1}
              :via        [{:status :failed, :class clojure.lang.ExceptionInfo, :error "2", :stacktrace true, :ex-data {:level 2}}
                           {:status :failed, :class clojure.lang.ExceptionInfo, :error "3", :stacktrace true, :ex-data {:level 3}}]}
             (-> (#'catch-exceptions/exception-response e3)
                 (update :stacktrace sequential?)
                 (update :via (fn [causes]
                                (for [cause causes]
                                  (update cause :stacktrace sequential?))))))))))

(defn- catch-exceptions
  ([qp]
   (catch-exceptions qp {}))

  ([qp query]
   (mt/with-open-channels [raise-chan    (a/promise-chan)
                           finished-chan (a/promise-chan)]
     ((catch-exceptions/catch-exceptions qp)
      query
      (constantly identity)
      {:raise-chan raise-chan, :finished-chan finished-chan})
     (mt/wait-for-result finished-chan))))

(deftest no-exception-test
  (testing "No Exception -- should return response as-is"
    (is (= {}
           (catch-exceptions
            (fn [query _ {:keys [finished-chan]}]
              (a/>!! finished-chan query)))))))

(deftest async-exception-test
  (testing "if the QP throws an Exception (synchronously), should format the response appropriately"
    (is (= {:status     :failed
            :class      java.lang.Exception
            :error      "Something went wrong"
            :stacktrace true
            :query      {}}
           (-> (catch-exceptions (fn [& _] (throw (Exception. "Something went wrong"))))
               (update :stacktrace boolean))))))

(deftest async-exception-test
  (testing "if an Exception is returned asynchronously by `raise`, should format it the same way"
    (is (= {:status     :failed
            :class      java.lang.Exception
            :error      "Something went wrong"
            :stacktrace true
            :query      {}}
           (-> (catch-exceptions (fn [_ _ {:keys [raise-chan]}] (a/>!! raise-chan (Exception. "Something went wrong"))))
               (update :stacktrace boolean))))))

(deftest permissions-test
  (data/with-temp-copy-of-db
    (perms/revoke-permissions! (group/all-users) (data/id))
    (perms/grant-permissions! (group/all-users) (data/id) "PUBLIC" (data/id :venues))
    (testing (str "If someone doesn't have native query execution permissions, they shouldn't see the native version of "
                  "the query in the error response")
      (is (schema= {:native (s/eq nil), :preprocessed (s/pred map?), s/Any s/Any}
                   (test-users/with-test-user :rasta
                     (qp/process-userland-query
                      (data/mbql-query venues {:fields [!month.id]}))))))

    (testing "They should see it if they have ad-hoc native query perms"
      (perms/grant-native-readwrite-permissions! (group/all-users) (data/id))
      (is (schema= {:native       (s/eq {:query  (str "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"VENUES\".\"ID\", 'yyyyMM'), 'yyyyMM') "
                                                      "AS \"ID\" FROM \"PUBLIC\".\"VENUES\" LIMIT 1048576")
                                         :params nil})
                    :preprocessed (s/pred map?)
                    s/Any         s/Any}
                   (test-users/with-test-user :rasta
                     (qp/process-userland-query
                      (data/mbql-query venues {:fields [!month.id]}))))))))
