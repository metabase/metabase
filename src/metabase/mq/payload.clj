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
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn encode
  "Serializes a vector of messages to a JSON string for storage/transport."
  ^String [messages]
  (json/encode messages))

(defn decode
  "Deserializes a JSON string produced by [[encode]] back into a vector of messages,
  keywordizing map keys."
  [payload]
  (json/decode+kw payload))
