(ns metabase.channel.render.js.pool-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.pool :as js.pool])
  (:import
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(deftest generate-pool-entry-serializes-context-creation-test
  (testing "no two static-viz context creations run concurrently (#GHY-4077)"
    (let [in-flight      (atom 0)
          max-in-flight  (atom 0)
          fake-context   (Object.)]
      (with-redefs [js.pool/create-static-viz-context
                    (fn []
                      (let [n (swap! in-flight inc)]
                        (swap! max-in-flight max n)
                        (Thread/sleep 50)
                        (swap! in-flight dec)
                        fake-context))]
        (let [entries (->> (repeatedly 4 #(future (#'js.pool/generate-pool-entry)))
                           doall
                           (mapv deref))]
          (is (= 1 @max-in-flight))
          (testing "every entry is a [context expiry-timestamp] tuple"
            (doseq [[ctx expiry-ts] entries]
              (is (identical? fake-context ctx))
              (is (int? expiry-ts)))))))))

(deftest expiry-timestamp-jitter-test
  (testing "expiry is ~10 minutes out with ±3 minutes of jitter"
    (let [now      (System/nanoTime)
          expiries (repeatedly 100 #(#'js.pool/expiry-timestamp))]
      (doseq [expiry expiries
              :let   [delta (- expiry now)]]
        (is (<= (.toNanos TimeUnit/MINUTES 7) delta (.toNanos TimeUnit/MINUTES 14)))))))
