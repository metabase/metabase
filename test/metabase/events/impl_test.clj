(ns metabase.events.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.impl :as events]
   [methodical.core :as methodical]))

(def ^:private ^:dynamic *method-calls* nil)

(derive ::test-topics :metabase/event)
(derive ::test-topic ::test-topics)

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
