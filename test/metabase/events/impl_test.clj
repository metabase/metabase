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
  set."
  [listener event]
  (swap! *method-calls* assoc listener event)
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
  ;; Make each listener the thrower in turn: the thrower runs first in one case and last in the other.
  (doseq [thrower [::throwing-topic ::throwing-topics]]
    (testing (str "listener " thrower " throws")
      (binding [*method-calls* (atom {})]
        (let [event {::throw #{thrower}}
              e     (publish-and-catch! event)
              cause (ex-cause e)]
          (testing "every listener ran"
            (is (= {::throwing-topic  event
                    ::throwing-topics event}
                   @*method-calls*)))
          (testing "publish-event! throws the error of the listener"
            (is (= {:topic ::throwing-topic, :event event}
                   (ex-data e)))
            (is (= {:listener thrower}
                   (ex-data cause)))
            (is (empty? (.getSuppressed ^Throwable cause))))))))
  (testing "both listeners throw"
    (binding [*method-calls* (atom {})]
      (let [event {::throw #{::throwing-topic ::throwing-topics}}
            e     (publish-and-catch! event)
            cause ^Throwable (ex-cause e)]
        (testing "every listener ran"
          (is (= {::throwing-topic  event
                  ::throwing-topics event}
                 @*method-calls*)))
        (testing "publish-event! throws one error, with the other as suppressed"
          (is (= 1 (count (.getSuppressed cause))))
          (is (= #{::throwing-topic ::throwing-topics}
                 (into #{}
                       (map (comp :listener ex-data))
                       (cons cause (.getSuppressed cause))))))))))

(deftest first-error-stops-the-listeners-inside-a-transaction-test
  ;; The transaction rolls back after the error, so a later listener must not act on rows that never commit.
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
