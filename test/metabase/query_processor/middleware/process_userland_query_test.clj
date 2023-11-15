(ns metabase.query-processor.middleware.process-userland-query-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.async.util :as async.u]
   [metabase.driver :as driver]
   [metabase.events :as events]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.process-userland-query
    :as process-userland-query]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-query-execution [query run]
  (mt/with-clock #t "2020-02-04T12:22-08:00[US/Pacific]"
    (let [original-hash (qp.util/query-hash query)
          result        (promise)]
      (with-redefs [process-userland-query/save-query-execution!* (fn [query-execution]
                                                                    (when-let [^bytes qe-hash (:hash query-execution)]
                                                                      (when (java.util.Arrays/equals qe-hash original-hash)
                                                                        (deliver result query-execution))))]
        (run
          (fn qe-result* []
            (let [qe (deref result 1000 ::timed-out)]
              (cond-> qe
                (:running_time qe) (update :running_time int?)
                (:hash qe)         (update :hash (fn [^bytes a-hash]
                                                   (some-> a-hash codecs/bytes->hex)))))))))))

(defmacro ^:private with-query-execution {:style/indent 1} [[qe-result-binding query] & body]
  `(do-with-query-execution ~query (fn [~qe-result-binding] ~@body)))

(defn- process-userland-query
  ([query]
   (process-userland-query query nil))

  ([query context]
   (let [query    (qp/userland-query query)
         metadata {}
         rows     []
         context  (merge
                   (or context (qp.context/sync-context))
                   {:executef (fn [_context _driver _query respond]
                                (respond metadata rows))})
         qp       (process-userland-query/process-userland-query-middleware
                   (fn [query rff context]
                     (qp.context/runf context query rff)))]
     (binding [driver/*driver* :h2]
       (qp query qp.reducible/default-rff context)))))

(deftest success-test
  (let [query {:type ::success-test}]
    (with-query-execution [qe query]
      (is (= #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
             (t/zoned-date-time))
          "sanity check")
      (is (=? {:status                 :completed
               :data                   {}
               :row_count              0
               :database_id            nil
               :started_at             #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
               :json_query             query
               :average_execution_time nil
               :context                nil
               :running_time           int?}
              (process-userland-query query))
          "Result should have query execution info")
      (is (=? {:hash         "310be80813db561159a218a09fa84afb4bec04ae1f9e1a1d036c944dabcdbdb0"
               :database_id  nil
               :result_rows  0
               :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
               :executor_id  nil
               :json_query   query
               :native       false
               :pulse_id     nil
               :card_id      nil
               :action_id    nil
               :context      nil
               :running_time true
               :cache_hit    false
               :dashboard_id nil}
              (qe))
          "QueryExecution should be saved"))))

(deftest failure-test
  (let [query {:type ::failure-test}]
    (with-query-execution [qe query]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Oops!"
           (process-userland-query query (qp.context/sync-context
                                          {:runf (fn [_context _query _rff]
                                                   (throw (ex-info "Oops!" {:type qp.error-type/qp})))}))))
      (is (=? {:hash         "8d5080dfc63b7f1c46537cf9ec915a4353b2aa9ca6069c6d5db56e087f027209"
               :database_id  nil
               :error        "Oops!"
               :result_rows  0
               :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
               :executor_id  nil
               :json_query   query
               :native       false
               :pulse_id     nil
               :action_id    nil
               :card_id      nil
               :context      nil
               :running_time true
               :dashboard_id nil}
              (qe))
          "QueryExecution saved in the DB should have query execution info. empty `:data` should get added to failures"))))

(def ^:private ^:dynamic *viewlog-call-count* nil)

(derive :event/card-query ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic _event]
  (when *viewlog-call-count*
    (swap! *viewlog-call-count* inc)))

(deftest ^:parallel viewlog-call-test
  (testing "no viewlog event with nil card id"
    (binding [*viewlog-call-count* (atom 0)]
      (process-userland-query {:type :query, :query? true})
      (is (zero? @*viewlog-call-count*)))))

;;; ViewLog recording is triggered indirectly by the call to [[metabase.events/publish-event!]] with the
;;; `:event/card-query` event -- see [[metabase.events.view-log]]

(deftest record-view-log-when-process-userland-query-test
  (testing "record a view log with only card id"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query users)}]
      (qp/process-query (qp/userland-query (assoc
                                            (:dataset_query card)
                                            :info {:card-id (:id card)})))

      (is (true? (t2/exists? :model/ViewLog :model "card" :model_id (:id card) :user_id nil))))))

(deftest record-view-log-when-process-userland-query-test-2
  (testing "record a view log with card id and executed by"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query users)}]
      (is (=? {:status :completed}
              (qp/process-query (qp/userland-query (assoc
                                                    (:dataset_query card)
                                                    :info {:card-id     (:id card)
                                                           :executed-by (mt/user->id :rasta)})))))
      (is (t2/exists? :model/ViewLog :model "card" :model_id (:id card) :user_id (mt/user->id :rasta))))))

(deftest record-view-log-when-process-userland-query-test-3
  (testing "skip if context is"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query users)}]
      (testing :collection
        (is (=? {:status :completed}
                (qp/process-query (qp/userland-query (assoc
                                                      (:dataset_query card)
                                                      :info {:card-id (:id card)
                                                             :context "collection"})))))
        (is (not (t2/exists? :model/ViewLog :model "card" :model_id (:id card)))))
      (testing :dashboard
        (is (=? {:status :completed}
                (qp/process-query (qp/userland-query (assoc
                                                      (:dataset_query card)
                                                      :info {:card-id (:id card)
                                                             :context "dashboard"})))))
        (is (not (t2/exists? :model/ViewLog :model "card" :model_id (:id card))))))))

(deftest cancel-test
  (let [saved-query-execution? (atom false)]
    (with-redefs [process-userland-query/save-query-execution! (fn [info]
                                                                 (reset! saved-query-execution? info))]
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (future
          (let [status (atom ::not-started)
                futur  (future
                         (process-userland-query
                          {:type :query}
                          (qp.context/sync-context
                           {:canceled-chan canceled-chan
                            :reducef       (fn [context _rff _metadata rows]
                                             (reset! status ::started)
                                             (Thread/sleep 1000)
                                             (reset! status ::done)
                                             (qp.context/resultf context rows))})))]
            (is (not= ::done
                      @status))
            (Thread/sleep 100)
            (future-cancel futur)))
        (testing "canceled-chan should get get a :cancel message"
          (let [[val port] (a/alts!! [canceled-chan (a/timeout 500)])]
            (is (= 'canceled-chan
                   (if (= port canceled-chan) 'canceled-chan 'timeout))
                "port")
            (is (= ::qp.context/cancel
                   val)
                "val")))
        (testing "No QueryExecution should get saved when a query is canceled"
          (is (not @saved-query-execution?)))))))
