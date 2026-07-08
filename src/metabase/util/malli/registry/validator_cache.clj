(ns metabase.util.malli.registry.validator-cache
  "The cache is an atom with a map of the shape

    <hash> => <nano-time>

  for SUCCESSFUL validations (presence of an entry means that the validation was successful).

  When the map gets bigger than [[max-entries]], walk the values and find the oldest `nano-time` and evict that entry.

  I tried at least 20 different cache implementations and settled on this one and the current value of [[max-entries]]
  as the most performant -- significantly faster then [[clojure.core.memoize/lru]]

  -- Cam.")

(set! *warn-on-reflection* true)

(def ^:private max-entries 10)

(defn- oldest-key
  "Return the key that was recorded into the cache the earliest. The combination of `reduce-kv` and `volatile!` is used
  to iterate in an efficient way without allocations."
  [k->nano-time]
  (let [oldest-key (volatile! nil)]
    (reduce-kv (fn [oldest-nano-time k nano-time]
                 (if (< nano-time oldest-nano-time)
                   (do (vreset! oldest-key k)
                       nano-time)
                   oldest-nano-time))
               Long/MAX_VALUE k->nano-time)
    @oldest-key))

(defn- remove-oldest-entry [k->nano-time]
  (dissoc k->nano-time (oldest-key k->nano-time)))

(defn- prune-entries-if-over-max-size [k->nano-time max-entries]
  (if (<= (count k->nano-time) max-entries)
    k->nano-time
    (recur (remove-oldest-entry k->nano-time) max-entries)))

(defn- record-usage! [k->nano-time max-entries k]
  (-> k->nano-time
      (prune-entries-if-over-max-size max-entries)
      (assoc k (System/nanoTime))))

(defn memoized-validator
  "Create a LRU-memoized version of `validator` that caches the last [[max-entries]] successful validations."
  [validator]
  (let [k->nano-time (atom {})]
    (fn [value]
      (let [k (System/identityHashCode value)]
        (if (contains? @k->nano-time k)
          (do
            (swap! k->nano-time record-usage! max-entries k)
            true)
          (let [result (validator value)]
            (when result
              (swap! k->nano-time record-usage! max-entries k))
            result))))))
