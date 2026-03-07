(ns metabase.logger.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.logger.core :as logger]
   [metabase.test :as mt]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(deftest logs-test
  (testing "Call includes recent logs (#24616)"
    (mt/with-log-level :warn
      (let [message "Sample warning message for test"]
        (log/warn message)
        (let [logs (mt/user-http-request :crowberto :get 200 "logger/logs")]
          (is (pos? (count logs)) "No logs returned from `logger/logs`")
          (is (some (comp #(re-find (re-pattern message) %) :msg) logs)
              "Recent message not found in `logger/logs`"))))))

(deftest ^:parallel logs-permissions-test
  (testing "GET /api/logger/logs"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "logger/logs"))))
    (testing "Call successful for superusers"
      (mt/user-http-request :crowberto :get 200 "logger/logs"))))

(deftest ^:parallel presets-test
  (testing "non-admins have no access"
    (mt/user-http-request :lucky :get 403 "logger/presets"))
  (testing "admins have access"
    (is (=? [{:id "sync"
              :display_name "Sync issue troubleshooting"
              :loggers #(every? (every-pred :name (comp #{"debug"} :level)) %)}
             {:id "linkedfilters"
              :display_name "Linked filters troubleshooting"
              :loggers #(every? (every-pred :name (comp #{"debug"} :level)) %)}
             {:id "serialization"
              :display_name "Serialization troubleshooting"
              :loggers #(every? (every-pred :name (comp #{"debug"} :level)) %)}
             {:id "cache"
              :display_name "Cache troubleshooting"
              :loggers #(every? (every-pred :name (comp #{"debug"} :level)) %)}]
            (mt/user-http-request :crowberto :get 200 "logger/presets")))))

(deftest ^:parallel adjust-invocation-error-test
  (testing "wrong duration"
    (mt/user-http-request :crowberto :post 400 "logger/adjustment"
                          {:duration "1," :duration_unit :days, :log_levels {"l" :debug}}))
  (testing "wrong duration unit"
    (mt/user-http-request :crowberto :post 400 "logger/adjustment"
                          {:duration 1, :duration_unit :weeks, :log_levels {"l" :debug}}))
  (testing "wrong log level"
    (mt/user-http-request :crowberto :post 400 "logger/adjustment"
                          {:duration 1, :duration_unit :days, :log_levels {"l" :catastophic}}))
  (testing "non-admins have no access"
    (mt/user-http-request :lucky :post 403 "logger/adjustment" {:duration 1, :duration_unit :days, :log_levels {"l" "debug"}})))

(deftest ^:sequential adjust-test
  (let [trace-ns (str (random-uuid))
        fatal-ns (str (random-uuid))
        other-ns (str (random-uuid))
        log-levels {trace-ns :trace, fatal-ns :fatal}
        timeout-ms 200]
    (logger/set-ns-log-level! trace-ns :info)
    (try
      (testing "sanity check the pristine state"
        (is (= :info (logger/ns-log-level trace-ns)))
        (is (nil? (logger/exact-ns-logger fatal-ns)))
        (is (nil? (logger/exact-ns-logger other-ns))))

      (testing "overriding multiple namespaces works"
        (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                              {:duration timeout-ms, :duration_unit :milliseconds, :log_levels log-levels})
        (is (= :trace (logger/ns-log-level trace-ns)))
        (is (= :fatal (logger/ns-log-level fatal-ns)))
        (is (nil? (logger/exact-ns-logger other-ns))))

      (testing "a new override cancels the previous one"
        (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                              {:duration timeout-ms, :duration_unit :milliseconds, :log_levels {other-ns :trace}})
        (is (= :info (logger/ns-log-level trace-ns)))
        (is (nil? (logger/exact-ns-logger fatal-ns)))
        (is (= :trace (logger/ns-log-level other-ns))))

      (testing "the override is automatically undone when the timeout is reached"
        (let [limit (+ (System/currentTimeMillis) timeout-ms 5000)]
          (loop []
            (cond
              (nil? (logger/exact-ns-logger other-ns))
              (testing "levels for namespaces not mentioned should not change"
                (is (= :info (logger/ns-log-level trace-ns)))
                (is (nil? (logger/exact-ns-logger fatal-ns))))

              (< (System/currentTimeMillis) limit)
              (recur)

              :else
              (is (nil? (logger/exact-ns-logger other-ns)) "the change has not been undone automatically")))))

      (testing "empty adjustment works"
        (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                              {:duration timeout-ms, :duration_unit :milliseconds, :log_levels {}})
        (is (= :info (logger/ns-log-level trace-ns)))
        (is (nil? (logger/exact-ns-logger fatal-ns)))

        (testing "empty adjustment works a second time too"
          (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                                {:duration timeout-ms, :duration_unit :milliseconds, :log_levels {}})
          (is (= :info (logger/ns-log-level trace-ns)))
          (is (nil? (logger/exact-ns-logger fatal-ns)))))
      (finally
        (logger/remove-ns-logger! trace-ns)
        (logger/remove-ns-logger! fatal-ns)
        (logger/remove-ns-logger! other-ns)))))

(deftest ^:sequential delete-test
  (let [trace-ns (str (random-uuid))
        fatal-ns (str (random-uuid))
        log-levels {trace-ns :trace, fatal-ns :fatal}
        timeout-hours 2]
    (try
      (logger/set-ns-log-level! trace-ns :info)
      (testing "overriding multiple namespaces works"
        (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                              {:duration timeout-hours, :duration_unit :hours, :log_levels log-levels})
        (is (= :trace (logger/ns-log-level trace-ns)))
        (is (= :fatal (logger/ns-log-level fatal-ns))))

      (testing "only admins can delete"
        (mt/user-http-request :lucky :delete 403 "logger/adjustment")
        (is (= :trace (logger/ns-log-level trace-ns)))
        (is (= :fatal (logger/ns-log-level fatal-ns))))

      (testing "delete undoes the adjustments"
        (mt/user-http-request :crowberto :delete 204 "logger/adjustment")
        (is (= :info (logger/ns-log-level trace-ns)))
        (is (nil? (logger/exact-ns-logger fatal-ns))))

      (testing "second delete is OK"
        (mt/user-http-request :crowberto :delete 204 "logger/adjustment")
        (is (= :info (logger/ns-log-level trace-ns)))
        (is (nil? (logger/exact-ns-logger fatal-ns))))
      (finally
        (logger/remove-ns-logger! trace-ns)
        (logger/remove-ns-logger! fatal-ns)))))

(deftest ^:sequential invalid-adjustment-test
  (testing "invalid level"
    (is (= {:specific-errors
            {:log_levels
             {:my.namespace
              ["should be either \"trace\", \"debug\", \"info\", \"warn\", \"error\", \"fatal\" or \"off\", received: \"ok\""],
              :my.other.namespace
              ["should be either \"trace\", \"debug\", \"info\", \"warn\", \"error\", \"fatal\" or \"off\", received: \"catastophic\""]}}
            :errors
            {:_error
             "The format of the provided logging configuration is incorrect. Please follow the following JSON structure:
{
  \"namespace\": \"trace\" | \"debug\" | \"info\" | \"warn\" | \"error\" | \"fatal\" | \"off\"
}"}}
           (mt/user-http-request :crowberto :post 400 "logger/adjustment"
                                 {:duration 1, :duration_unit :hours, :log_levels {"my.namespace" :ok
                                                                                   "my.other.namespace" :catastophic}}))))
  (testing "invalid log_levels type"
    (are [value json-type] (= {:specific-errors {:log_levels [(str "invalid type, received: " json-type)]}
                               :errors {:_error (format "Log levels should be an object, %s received" json-type)}}
                              (mt/user-http-request :crowberto :post 400 "logger/adjustment"
                                                    {:duration 1, :duration_unit :hours, :log_levels value}))
      []    "array"
      4.2   "number"
      false "boolean"
      "ll"  "string"
      nil   "null")))

(deftest ^:synchronized analytic-events-test
  (snowplow-test/with-fake-snowplow-collector
    (testing "Logger adjustments trigger snowplow events"
      (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                            {:duration 10000
                             :duration_unit :milliseconds
                             :log_levels {"metabase.sync" :debug}})
      (mt/user-http-request :crowberto :delete 204 "logger/adjustment")
      (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                            {:duration 1
                             :duration_unit :hours
                             :log_levels {"metabase.sync" :debug}})
      (mt/user-http-request :crowberto :post 204 "logger/adjustment"
                            {:duration 1
                             :duration_unit :hours
                             :log_levels {}})
      (is (=? [{:data {"event" "log_adjustments_set", "event_detail" "10"}}
               {:data {"event" "log_adjustments_reset"}}
               {:data {"event" "log_adjustments_set", "event_detail" "3600"}}
               {:data {"event" "log_adjustments_reset"}}]
              (take-last 4 (snowplow-test/pop-event-data-and-user-id!)))))))
