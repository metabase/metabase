(ns metabase.mq.payload-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.payload :as payload])
  (:import
   (java.time Instant)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(deftest check-serializable!-accepts-json-round-trippable-values-test
  (testing "values that JSON round-trips (some lossily but meaningfully) are accepted"
    (doseq [msg [{}
                 {:a 1 :b "two" :c true :d nil}
                 {:nested {:x [1 2 3] :y #{:a :b}}}
                 {:kw :some/keyword :sym 'a-sym}           ; keywords/symbols -> strings
                 {:when (Instant/now) :id (UUID/randomUUID)} ; dates/UUIDs -> strings
                 {:ratio 1/3 :big 9999999999999999999N :dec 1.5M}
                 [{:a 1} {:b 2}]
                 {"string-key" 1}]]
      (is (nil? (payload/check-serializable! msg))
          (str "should accept " (pr-str msg))))))

(deftest check-serializable!-rejects-opaque-values-test
  (testing "values JSON encoding would silently turn into .toString() junk are rejected loudly"
    (are [msg] (thrown-with-msg? clojure.lang.ExceptionInfo #"not JSON-serializable"
                                 (payload/check-serializable! msg))
      {:f (fn [])}                 ; a function
      {:a (atom 1)}                ; an atom (IDeref)
      {:o (Object.)}               ; an arbitrary object
      {:nested {:deep [1 {:x (fn [])}]}} ; nested inside a collection
      {[1 2] "vector-key"})))      ; a non-string/keyword/symbol map key

(deftest check-serializable!-error-points-at-the-offending-path-test
  (testing "the thrown error carries the path and class of the offending value for diagnosis"
    (let [e (try (payload/check-serializable! {:outer {:inner [:ok (fn [])]}}) nil
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (some? e))
      (is (= [:outer :inner 1] (:path (ex-data e)))
          "the path locates the bad value within the message")
      (is (isa? (:value-class (ex-data e)) clojure.lang.IFn)
          "the class of the offending value is reported"))))
