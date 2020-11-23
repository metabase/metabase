(ns metabase.events-test
  (:require [clojure.core.async :as async]
            [clojure.test :refer :all]
            [metabase.events :as events]))

(def ^:private testing-topic ::event-test-topic)

(def ^:private testing-sub-channel (async/chan))

(#'events/subscribe-to-topic! testing-topic testing-sub-channel)

(deftest publish-event-test!
  (testing "we should get back our originally posted object no matter what happens"
    (is (= {:some :object}
           (events/publish-event! testing-topic {:some :object}))))

  (testing "when we receive a message it should be wrapped with {:topic `topic` :item `message body`}"
    (let [timeout    (async/timeout 100)
          [val port] (async/alts!! [testing-sub-channel timeout])]
      (when (= port timeout)
        (throw (ex-info "Timed out!" {})))
      (is (= {:topic testing-topic
              :item  {:some :object}}
             val)))))
