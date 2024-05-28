(ns metabase.util.log-test
  (:require
    [clojure.test :refer [are deftest is]]
    [metabase.test.util.log :as tlog]
    [metabase.util.log :as log]))

(deftest basic-logp-test
  (is (= [[:warn nil "a message"]]
         (tlog/with-log-messages-for-level :warn
           (log/info "not this one")
           (log/warn "a message"))))
  (is (= [[:info nil "here's one"]
          [:warn nil "a message"]]
         (tlog/with-log-messages-for-level :info
           (log/info "here's one")
           (log/warn "a message"))))
  (is (= [[:info nil ":keyword 78"]]
         (tlog/with-log-messages-for-level :info
           (log/info :keyword 78)))))

(deftest logp-levels-test
  (let [important-message #{"fatal" "error" "warn" "info" "debug" "trace"}
        spam (fn []
               (log/fatal "fatal")
               (log/error "error")
               (log/warn  "warn")
               (log/info  "info")
               (log/debug "debug")
               (log/trace "trace"))
        logs [[:fatal nil "fatal"]
              [:error nil "error"]
              [:warn  nil "warn"]
              [:info  nil "info"]
              [:debug nil "debug"]
              [:trace nil "trace"]]]
    (are [prefix level] (= (->> logs
                                (filter (fn [[_ _ msg]] (contains? important-message msg)))
                                (take prefix))
                           (tlog/with-log-messages-for-level level (spam)))
         ;0 :off - this doesn't work in CLJ and perhaps should?
         1 :fatal
         2 :error
         3 :warn
         4 :info
         5 :debug
         6 :trace)))

(deftest logf-formatting-test
  (is (= [[:info nil "input: 8, 3; output: ignored"]]
         (tlog/with-log-messages-for-level :info
           (log/infof "input: %d, %d; %s: ignored" 8 3 "output")))))
