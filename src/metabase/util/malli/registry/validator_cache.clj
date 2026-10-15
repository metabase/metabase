(ns metabase.util.malli.registry.validator-cache
  "The cache is an AtomicLongArray with entries of the form:

    <32-bit hashcode><32-bit tick counter>

  for SUCCESSFUL validations (presence of an entry means that the validation was successful). The array has the size
  of [[max-entries]], and when the array gets full, the entry with oldest tick counter is overwritten.

  I tried at least 20 different cache implementations and settled on this one and the current value of [[max-entries]]
  as the most performant -- significantly faster then [[clojure.core.memoize/lru]]

  -- Cam.

  I hacked together a 21st implementation that uses bit packing. It is yet faster, zero allocs, no boxing. It also
  works on the premise that max-entries stays low (10 at the time of writing), so the linear scan is good enough.
  Additionally, it's not safe from data races (no CAS or locking is used) but in the worst case we'll perform a
  redundant recomputation, but the data will be consistent at all times.

  -- Sashko."
  (:import
   (java.util.concurrent.atomic AtomicLongArray AtomicLong)))

(set! *warn-on-reflection* true)

(def ^:private ^:const uint-bitmask 0xFFFFFFFF)
(def ^:private max-entries 10)

(defn- write-entry!
  "Pack `key-hash` and `tick` into a long and write into `state`. The write is racy, but we don't sweat about it here."
  [^AtomicLongArray state, ^long index, ^long key-hash, ^long tick]
  (.set state index (bit-or (bit-shift-left key-hash 32)
                            (bit-and tick uint-bitmask))))

(defn- clear-state!
  "We can't let state be filled with just zeroes because hash 0 corresponds to `(System/identityHashCode nil)`, so the
  cache entry will falsely match."
  [^AtomicLongArray state]
  (dotimes [i (.length state)]
    (write-entry! state i (System/identityHashCode ::sentinel) 0)))

(defn- seek-key-or-index-to-evict
  "Look for `needle-hash` in `state` entries. If such hash is found, update the entry with the latest `tick` and return
  `:success`. If the hash is not found, return the index of an oldest entry that can be overwritten by a new entry.
  `needle-hash` should already be trimmed to 32 bits."
  [^AtomicLongArray state, ^long needle-hash, ^long tick]
  (loop [i (dec (.length state)) ;; Walking back to front, doesn't matter
         oldest-tick Long/MAX_VALUE
         ;; Set uninitialized entry index to 0 as a catch-all, but that should never happen.
         oldest-entry-index 0]
    (if (< i 0)
      oldest-entry-index
      (let [entry (.get state i)
            ;; Unpack key hash and tick from the entry
            entry-hash (bit-and (bit-shift-right entry 32) uint-bitmask)
            entry-tick (bit-and entry uint-bitmask)]
        (if (= entry-hash needle-hash)
          (do (write-entry! state i entry-hash tick)
              :success)
          (recur (dec i)
                 (min oldest-tick entry-tick)
                 ;; Empty slots have tick=0, which will be older than any real tick.
                 (if (< entry-tick oldest-tick) i oldest-entry-index)))))))

(defn memoized-validator
  "Create a LRU-memoized version of `validator` that caches the last [[max-entries]] successful validations."
  [validator]
  (let [state (doto (AtomicLongArray. (int max-entries)) clear-state!)
        ;; Tick is a monotonic counter used to tell older entries from newer ones.
        tick-counter (AtomicLong. 0)]
    (fn [value]
      (let [k (bit-and (System/identityHashCode value) uint-bitmask)
            tick (bit-and (.incrementAndGet tick-counter) uint-bitmask)
            ;; Handle special case of tick overflowing and wrapping around. Should happen approximately never, but
            ;; let's be rigorous and flush the state in this case.
            tick (if (= tick 0)
                   (do (clear-state! state)
                       (bit-and (.incrementAndGet tick-counter) uint-bitmask))
                   tick)
            search-result (seek-key-or-index-to-evict state k tick)]
        (if (identical? search-result :success)
          true
          (let [result (validator value)]
            (when result
              (write-entry! state search-result k tick))
            result))))))
