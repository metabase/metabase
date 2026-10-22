(ns metabase.mq.publish-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.publish :as publish]))

(set! *warn-on-reflection* true)

(deftest run-with-buffer-validates-serializability-before-routing-test
  (let [routed (atom [])]
    (with-redefs-fn {#'publish/publish-collected! (fn [ch msgs] (swap! routed conj [ch msgs]))}
      (fn []
        (testing "serializable messages collected in the body are routed on success"
          (reset! routed [])
          (publish/run-with-buffer :queue/x "err"
                                   (fn [b] (publish/put b {:a 1}) (publish/put b {:b 2})))
          (is (= [[:queue/x [{:a 1} {:b 2}]]] @routed)))

        (testing "an unserializable message throws at the call site and nothing is routed"
          (reset! routed [])
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not JSON-serializable"
                                (publish/run-with-buffer :queue/x "err"
                                                         (fn [b] (publish/put b {:ok 1})
                                                           (publish/put b {:bad (fn [])})))))
          (is (= [] @routed)
              "validation precedes routing, so a bad batch never reaches the outbox/transport"))))))
