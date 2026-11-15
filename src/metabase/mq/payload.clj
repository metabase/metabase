(ns metabase.mq.payload
  "Canonical wire encoding for queue messages.

  A batch of messages is [[encode]]d to a JSON string once, at the publish boundary
  ([[metabase.mq.transport/publish!]]), and [[decode]]d once, at the delivery boundary
  ([[metabase.mq.impl/deliver!]]). In between, backends move the opaque string around and
  never look inside it — so storage is purely a backend concern and message shape is
  identical regardless of which backend delivered it.

  Messages must be JSON-serializable. Decoding keywordizes map keys, but values pass through
  JSON's type system: keyword/symbol values become strings, sets become vectors, dates become
  strings, etc."
  (:require
   [metabase.util.json :as json])
  (:import
   (java.time.temporal Temporal)
   (java.util Date UUID)))

(set! *warn-on-reflection* true)

(defn- json-safe-scalar?
  "True for leaf values that JSON round-trips to something meaningful."
  [v]
  (or (nil? v)
      (string? v)
      (boolean? v)
      (number? v)
      (keyword? v)
      (symbol? v)
      (char? v)
      (instance? UUID v)
      (instance? Date v)
      (instance? Temporal v)))

(defn- check-value!
  "Walks `v`, throwing if it (or anything nested in it) is not JSON-serializable to a meaningful value.
  `path` is the location within the message, carried for a helpful error."
  [path v]
  (cond
    (map? v)
    (doseq [[k mv] v]
      (when-not (or (keyword? k) (string? k) (symbol? k))
        (throw (ex-info (str "Queue message has a map key that is not JSON-serializable at " (pr-str path)
                             ": keys must be a keyword, string, or symbol, got " (some-> k class .getName))
                        {:path path :key-class (some-> k class)})))
      (check-value! (conj path k) mv))

    (or (sequential? v) (set? v))
    (dorun (map-indexed (fn [i e] (check-value! (conj path i) e)) v))

    (json-safe-scalar? v) nil

    :else
    (throw (ex-info (str "Queue message contains a value that is not JSON-serializable at " (pr-str path)
                         ": " (some-> v class .getName))
                    {:path path :value-class (some-> v class)}))))

(defn check-serializable!
  "Throws if `message` contains a value that would not JSON-round-trip to something
  meaningful. Called at publish time so such mistakes fail at the
  call site, rather than being silently corrupted on the wire and becoming undeliverable."
  [message]
  (check-value! [] message))

(defn encode
  "Serializes a vector of messages to a JSON string for storage/transport."
  ^String [messages]
  (json/encode messages))

(defn decode
  "Deserializes a JSON string produced by [[encode]] back into a vector of messages,
  keywordizing map keys."
  [payload]
  (json/decode+kw payload))
