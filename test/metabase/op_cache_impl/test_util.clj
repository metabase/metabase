(ns metabase.op-cache-impl.test-util
  (:require
   [java-time.api :as t]
   [metabase.op-cache-impl.storage :as storage]))

(defn in-memory-storage
  "A [[storage/Storage]] backed by atoms, for tests. Coordinates callers within a single process only."
  []
  (let [entries (atom {})   ; k -> {:value <any>, :written-at <instant>}
        claims  (atom {})]  ; k -> <instant> claimed at
    (reify storage/Storage
      (read-entry [_ k]
        (get @entries k))
      (write-entry! [_ k value]
        (swap! entries assoc k {:value value, :written-at (t/instant)})
        (swap! claims dissoc k)
        nil)
      (delete-entry! [_ k]
        (swap! entries dissoc k)
        (swap! claims dissoc k)
        nil)
      (try-claim! [_ k claim-ttl-ms]
        (let [now (t/instant)
              won (volatile! false)]
          (swap! claims (fn [claims]
                          (let [claimed-at (get claims k)]
                            (if (or (nil? claimed-at)
                                    (t/before? claimed-at (t/minus now (t/millis claim-ttl-ms))))
                              (do (vreset! won true)
                                  (assoc claims k now))
                              (do (vreset! won false)
                                  claims)))))
          @won))
      (release-claim! [_ k]
        (swap! claims dissoc k)
        nil))))
