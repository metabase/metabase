(ns metabase-enterprise.serialization.metadata-file-import.parsers.json
  "Streaming JSON parser for the metadata file importer. Walks a top-level JSON
  object, advances to a named array, and emits its items in batches via a
  callback. Memory bounded by the in-flight item plus the current batch buffer."
  (:require
   [metabase.util.performance :as perf])
  (:import
   (com.fasterxml.jackson.core JsonParser JsonToken)
   (com.fasterxml.jackson.databind ObjectMapper)
   (java.io Reader)
   (java.util LinkedHashMap)))

(set! *warn-on-reflection* true)

(def ^:private ^ObjectMapper object-mapper (ObjectMapper.))

(defn- advance-to-array!
  "Advance `parser` from start-of-input through a top-level JSON object until we
  enter the array valued at `target-key` (parser has just consumed the
  START_ARRAY token). Throws `:bad_shape` if the document doesn't begin with an
  object or the value at `target-key` isn't an array; throws `:missing_key` if
  the key is absent."
  [^JsonParser parser ^String target-key]
  (let [t (.nextToken parser)]
    (when-not (= t JsonToken/START_OBJECT)
      (throw (ex-info "Expected JSON document to begin with an object"
                      {:kind :bad_shape, :target-key target-key}))))
  (loop []
    (let [t (.nextToken parser)]
      (cond
        (or (nil? t) (= t JsonToken/END_OBJECT))
        (throw (ex-info (format "Key %s not found in top-level object" (pr-str target-key))
                        {:kind :missing_key, :key target-key}))

        (= t JsonToken/FIELD_NAME)
        (if (= target-key (.getCurrentName parser))
          (let [vt (.nextToken parser)]
            (when-not (= vt JsonToken/START_ARRAY)
              (throw (ex-info (format "Value of %s must be an array" (pr-str target-key))
                              {:kind :bad_shape, :key target-key}))))
          (do (.nextToken parser) (.skipChildren parser) (recur)))

        :else (recur)))))

(defn stream-array-batches!
  "Walk `reader` to the array at top-level `array-key` (string or keyword), then
  invoke `(process-batch! batch)` for each successive batch of `[line-num row]`
  tuples (up to `batch-size` per batch). `line-num` is 1-indexed and continues
  across batch boundaries. Items are parsed into Clojure maps with keyword keys.
  Caller manages the lifecycle of `reader`."
  [^Reader reader array-key batch-size process-batch!]
  (with-open [parser (.createParser (.getFactory object-mapper) reader)]
    (advance-to-array! parser (name array-key))
    (loop [batch    (transient [])
           line-num 0]
      (let [t (.nextToken parser)]
        (cond
          (= t JsonToken/END_ARRAY)
          (when (pos? (count batch))
            (process-batch! (persistent! batch)))

          (= t JsonToken/START_OBJECT)
          ;; LinkedHashMap fails (map? x), so coerce before keywordize-keys.
          (let [raw        (.readValueAs parser LinkedHashMap)
                item       (perf/keywordize-keys (into {} raw))
                ln         (inc line-num)
                next-batch (conj! batch [ln item])]
            (if (>= (count next-batch) batch-size)
              (do (process-batch! (persistent! next-batch))
                  (recur (transient []) ln))
              (recur next-batch ln)))

          (nil? t)
          (throw (ex-info (format "Unexpected end-of-input in array %s" (pr-str array-key))
                          {:kind :bad_shape, :key array-key}))

          :else
          (throw (ex-info (format "Unexpected token %s in array %s"
                                  (some-> t .asString) (pr-str array-key))
                          {:kind :bad_shape, :key array-key})))))))
