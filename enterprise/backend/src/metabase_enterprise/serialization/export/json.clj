(ns metabase-enterprise.serialization.export.json
  "Streaming JSON writers used by the metadata-export pipeline. Writers consume reducible
  collections row-by-row so memory stays bounded regardless of result size."
  (:require
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn write-json-array!
  "Streams a reducible collection as a JSON array to `writer`. Each value is JSON-encoded
  directly with no transformation — apply per-row formatting via an `eduction` (or other
  transducer pipeline) before passing in.

  `run!` is required here because it dispatches through `reduce`, which consumes the
  `IReduceInit` returned by `t2/reducible-query` row-by-row without materializing.
  `doseq` cannot be used: it walks a seq, and producing a seq from the reducible
  would realize every row into memory — defeating the point of streaming."
  [^java.io.Writer writer reducible]
  (.write writer "[")
  (let [first? (volatile! true)]
    (run! (fn [row]
            (if @first?
              (vreset! first? false)
              (.write writer ","))
            (json/encode-to row writer {}))
          reducible))
  (.write writer "]"))

(defn write-json-object!
  "Writes a JSON object whose values are JSON arrays to `writer`. `entries` is a reducible
  of `[entry-name objects]` pairs; `objects` is itself a reducible (typically an `eduction`)
  of already-formatted values to encode.

  `run!` is used over the entries — `doseq` would walk a seq and realize the underlying
  reducible, defeating streaming."
  [^java.io.Writer writer entries]
  (.write writer "{")
  (let [first? (volatile! true)]
    (run! (fn [[entry-name objects]]
            (if @first? (vreset! first? false) (.write writer ","))
            (.write writer (str "\"" entry-name "\":"))
            (write-json-array! writer objects))
          entries))
  (.write writer "}"))
