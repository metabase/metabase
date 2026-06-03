(ns metabase.metabot.tracing-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.tracing :as mbt]
   [metabase.metabot.tracing.semconv :as semconv]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- by-name [spans]
  (into {} (map (juxt :name identity)) spans))

(deftest span-tree-test
  (testing "with-span records a parent/child tree, merges attrs, captures errors, and crosses threads"
    (mt/with-temporary-setting-values [metabot-trace-spans-enabled true]
      (let [spans (mbt/with-trace
                    (mbt/with-span {:name "root" :kind :server}
                      (mbt/with-span {:name "child" :attrs {"a" 1}}
                        (mbt/add-attrs! {"b" 2}))
                      (try
                        (mbt/with-span {:name "boom"}
                          (throw (ex-info "nope" {})))
                        (catch Exception _ nil))
                      ;; bound-fn captures the dynamic span context, so a span
                      ;; opened on another thread is still parented to root.
                      (let [f (bound-fn [] (mbt/with-span {:name "threaded"} :ok))
                            th (Thread. ^Runnable f)]
                        (.start th)
                        (.join th)))
                    (mbt/current-spans))
            m     (by-name spans)
            root  (get m "root")]
        (is (= 4 (count spans)))
        (is (nil? (:parent_span_id root)))
        (is (= :server (:kind root)))
        (testing "children are parented to root"
          (doseq [child-name ["child" "boom" "threaded"]]
            (is (= (:span_id root) (:parent_span_id (get m child-name)))
                child-name)))
        (testing "add-attrs! merges into the active span"
          (is (= {"a" 1 "b" 2} (:attributes (get m "child")))))
        (testing "a throwing body marks the span errored"
          (is (= :error (:status (get m "boom"))))
          (is (= "nope" (:status_message (get m "boom")))))
        (testing "every span has a non-negative duration"
          (is (every? (fn [s] (>= (:ended_at s) (:started_at s))) spans)))))))

(deftest record-timed-span-test
  (testing "record-timed-span! records an externally-timed span as a sibling of tool spans under the step"
    (mt/with-temporary-setting-values [metabot-trace-spans-enabled true]
      (let [spans (mbt/with-trace
                    (mbt/with-span {:name "metabot.step 0" :kind :internal}
                      ;; The streaming layer reports the API request timing; the loop
                      ;; records the `/completions` span from it after the reduce.
                      (mbt/record-timed-span! {:name              "/completions anthropic/x"
                                               :kind              :client
                                               :attrs             {"a" 1}
                                               :started-unix-nano 1000
                                               :duration-nanos    500})
                      ;; A tool span opened in the same reduce parents to the step too.
                      (mbt/with-span {:name "execute_tool search" :kind :internal}
                        :ok))
                    (mbt/current-spans))
            m     (by-name spans)
            step  (get m "metabot.step 0")
            chat  (get m "/completions anthropic/x")
            tool  (get m "execute_tool search")]
        (is (= 3 (count spans)))
        (testing "the completions span uses the reported timing, not wall-clock"
          (is (= 1000 (:started_at chat)))
          (is (= 500 (- (:ended_at chat) (:started_at chat))))
          (is (= {"a" 1} (:attributes chat))))
        (testing "completions and tool spans are siblings under the step"
          (is (= (:span_id step) (:parent_span_id chat)))
          (is (= (:span_id step) (:parent_span_id tool))))))))

(deftest record-timed-span-noop-test
  (testing "record-timed-span! is a no-op when tracing is disabled or timing is missing"
    (is (nil? (mbt/record-timed-span! {:name "/completions" :started-unix-nano 1 :duration-nanos 1})))
    (mt/with-temporary-setting-values [metabot-trace-spans-enabled true]
      (is (empty? (mbt/with-trace
                    (mbt/with-span {:name "root"}
                      ;; missing timing → nothing recorded for the completions span
                      (mbt/record-timed-span! {:name "/completions"}))
                    (filter #(= "/completions" (:name %)) (mbt/current-spans))))))))

(deftest disabled-setting-test
  (testing "no spans are collected when the setting is off"
    (mt/with-temporary-setting-values [metabot-trace-spans-enabled false]
      (mbt/with-trace
        (mbt/with-span {:name "root"}
          (is (nil? mbt/*trace*))
          (is (nil? (mbt/current-spans))))))))

(deftest persist-round-trip-test
  (testing "persist-spans! writes spans keyed to the turn; tool spans carry input but never output"
    (mt/with-temporary-setting-values [metabot-trace-spans-enabled true]
      (mt/with-temp [:model/User                {user-id :id}         {}
                     :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                     :model/MetabotMessage      {msg-id :id}          {:conversation_id conversation-id}]
        (mbt/with-trace
          (mbt/with-span {:name  "metabot.request"
                          :kind  :server
                          :attrs {semconv/conversation-id conversation-id}}
            (mbt/with-span {:name  "execute_tool search"
                            :kind  :internal
                            :attrs {semconv/gen-ai-tool-name "search"
                                    semconv/tool-input        {:q "orders"}}}
              :tool-output-not-recorded))
          (mbt/persist-spans! conversation-id msg-id))
        (let [rows     (t2/select :model/MetabotTraceSpan :conversation_id conversation-id
                                  {:order-by [[:started_at :asc] [:id :asc]]})
              by-name* (by-name rows)
              tool     (get by-name* "execute_tool search")]
          (is (= 2 (count rows)))
          (is (every? #(= msg-id (:message_id %)) rows))
          (testing "tool span captures the input arguments"
            (is (= {:q "orders"}
                   (get (:attributes tool) (keyword semconv/tool-input)))))
          (testing "no attribute key carries tool output"
            (is (not-any? (fn [k] (re-find #"output" (name k)))
                          (keys (:attributes tool))))))))))
