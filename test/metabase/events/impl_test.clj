(ns metabase.events.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.hierarchy :as events.hierarchy]
   [metabase.events.impl :as events]
   [metabase.test.fixtures :as fixtures]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *method-calls* nil)

(events.hierarchy/derive! ::test-topics :metabase/event)
(events.hierarchy/derive! ::test-topic ::test-topics)

(methodical/defmethod events/publish-event! ::test-topics
  [_topic event]
  (when *method-calls*
    (swap! *method-calls* assoc ::test-topics event))
  ;; should get ignored
  (assoc event ::test-topics true))

(methodical/defmethod events/publish-event! ::test-topic
  [_topic event]
  (when *method-calls*
    (swap! *method-calls* assoc ::test-topic event))
  ;; should get ignored
  (assoc event ::test-topic true))

(deftest publish-event-test!
  (binding [*method-calls* (atom {})]
    (testing "we should get back our originally posted object no matter what happens"
      (is (= {:some :object}
             (events/publish-event! ::test-topic {:some :object}))))
    (testing "Our method should have been called"
      (is (= {:metabase.events.impl-test/test-topic  {:some :object}
              :metabase.events.impl-test/test-topics {:some :object}}
             @*method-calls*)))))

(events.hierarchy/derive! ::throwing-topics :metabase/event)
(events.hierarchy/derive! ::throwing-topic ::throwing-topics)

(defn- record-call-and-maybe-throw!
  "Listener body for the throwing topics: records the call, then throws when `listener` is in the event's `::throw`
  set, or throws the Throwable mapped to `listener` in the event's `::throwables` map."
  [listener event]
  (swap! *method-calls* assoc listener event)
  (when-let [throwable (get (::throwables event) listener)]
    (throw throwable))
  (when (contains? (::throw event) listener)
    (throw (ex-info (str "boom " listener) {:listener listener}))))

(methodical/defmethod events/publish-event! ::throwing-topics
  [_topic event]
  (record-call-and-maybe-throw! ::throwing-topics event))

(methodical/defmethod events/publish-event! ::throwing-topic
  [_topic event]
  (record-call-and-maybe-throw! ::throwing-topic event))

(defn- publish-and-catch!
  "Publish `event` to `::throwing-topic`; return the thrown exception, or nil."
  [event]
  (try
    (events/publish-event! ::throwing-topic event)
    nil
    (catch Throwable e
      e)))

(deftest every-listener-runs-when-another-throws-test
  ;; ::throwing-topic is the topic, so its listener runs first. Each listener throws alone, then both throw.
  (doseq [[throwers first-thrower] [[#{::throwing-topic} ::throwing-topic]
                                    [#{::throwing-topics} ::throwing-topics]
                                    [#{::throwing-topic ::throwing-topics} ::throwing-topic]]]
    (testing (str "listeners " throwers " throw")
      (binding [*method-calls* (atom {})]
        (let [event {::throw throwers}
              e     (publish-and-catch! event)
              cause ^Throwable (ex-cause e)]
          (testing "every listener ran"
            (is (= {::throwing-topic event, ::throwing-topics event}
                   @*method-calls*)))
          (testing "publish-event! throws the first error as the cause, with the others as suppressed"
            (is (= {:topic ::throwing-topic, :event event} (ex-data e)))
            (is (= {:listener first-thrower} (ex-data cause)))
            (is (= (disj throwers first-thrower)
                   (into #{} (map (comp :listener ex-data)) (.getSuppressed ^Throwable e))))))))))

(deftest listeners-that-throw-one-exception-test
  (testing "when two listeners throw the same exception object, it is the cause, and not also suppressed"
    (binding [*method-calls* (atom {})]
      (let [failure (ex-info "shared failure" {})
            e       (publish-and-catch! {::throwables {::throwing-topic failure, ::throwing-topics failure}})]
        (is (identical? failure (ex-cause e)))
        (is (empty? (.getSuppressed ^Throwable e)))))))

(deftest publish-changes-no-throwable-of-a-listener-test
  ;; A listener can throw one object on each publish, for example the cached exception of a failed `delay`. Its
  ;; suppressed list must not grow by the throwables of the other listeners on each publish.
  (doseq [[kind shared event] [["an Exception that is the cause"
                                (ex-info "cached failure" {})
                                (fn [shared] {::throwables {::throwing-topic shared}, ::throw #{::throwing-topics}})]
                               ["an Error after an Exception"
                                (AssertionError. "cached error")
                                (fn [shared] {::throwables {::throwing-topics shared}, ::throw #{::throwing-topic}})]
                               ["an InterruptedException after an Exception"
                                (InterruptedException. "cached interrupt")
                                (fn [shared] {::throwables {::throwing-topics shared}, ::throw #{::throwing-topic}})]]]
    (testing (str "a listener throws one object of " kind " on two publishes")
      (dotimes [_ 2]
        (binding [*method-calls* (atom {})]
          (is (identical? shared (ex-cause (publish-and-catch! (event shared)))))
          ;; clears the interrupt flag that an InterruptedException sets
          (Thread/interrupted)))
      (is (= []
             (map ex-message (.getSuppressed ^Throwable shared)))))))

(deftest first-error-stops-the-listeners-inside-a-transaction-test
  ;; Inside a transaction, the first error stops the later listeners, even when the caller catches it.
  (binding [*method-calls* (atom {})]
    (let [event {::throw #{::throwing-topic}}
          e     (t2/with-transaction [_conn]
                  (publish-and-catch! event))]
      (testing "the more specific listener runs first and throws, so the other listener does not run"
        (is (= {::throwing-topic event}
               @*method-calls*)))
      (testing "publish-event! throws the error of the listener"
        (is (= {:listener ::throwing-topic}
               (ex-data (ex-cause e))))))))

(deftest first-exception-is-kept-when-a-later-listener-throws-an-error-test
  (binding [*method-calls* (atom {})]
    (let [event {::throw      #{::throwing-topic}
                 ::throwables {::throwing-topics (AssertionError. "error ::throwing-topics")}}
          e     ^Throwable (publish-and-catch! event)]
      (testing "the Error of the later listener is the cause"
        (is (instance? AssertionError (ex-cause e))))
      (testing "the exception of the first listener is suppressed"
        (is (= [{:listener ::throwing-topic}]
               (map ex-data (.getSuppressed e))))))))

(deftest interrupted-listener-stops-the-later-listeners-test
  (binding [*method-calls* (atom {})]
    (let [event        {::throwables {::throwing-topic (InterruptedException. "interrupted ::throwing-topic")}}
          e            (publish-and-catch! event)
          ;; also clears the flag, so the test leaves the thread uninterrupted
          interrupted? (Thread/interrupted)]
      (testing "the less specific listener does not run"
        (is (= #{::throwing-topic}
               (set (keys @*method-calls*)))))
      (testing "the InterruptedException is the cause"
        (is (instance? InterruptedException (ex-cause e))))
      (testing "the interrupt flag of the thread is set again"
        (is (true? interrupted?))))))
