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
  "Advance `parser` from start-of-input through a top-level JSON object to the
  array valued at `target-key` (parser has just consumed the START_ARRAY
  token). Throws `:bad_shape` if the document doesn't begin with an object or
  the value at `target-key` isn't an array; throws `:missing_key` if the key
  is absent."
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

(defn- consume-array-as-batches!
  "After START_ARRAY has been consumed, walk array items into batches of
  `[line-num row]` tuples (up to `batch-size`), calling `process-batch!` per
  batch. Returns when END_ARRAY is consumed."
  [^JsonParser parser array-key batch-size process-batch!]
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
                        {:kind :bad_shape, :key array-key}))))))

(defn stream-array-batches!
  "Walk `reader` to the array at top-level `array-key` (string or keyword), then
  invoke `(process-batch! batch)` for each successive batch of `[line-num row]`
  tuples (up to `batch-size` per batch). `line-num` is 1-indexed and continues
  across batch boundaries. Items are parsed into Clojure maps with keyword keys.
  Caller manages the lifecycle of `reader`."
  [^Reader reader array-key batch-size process-batch!]
  (with-open [parser (.createParser (.getFactory object-mapper) reader)]
    (advance-to-array! parser (name array-key))
    (consume-array-as-batches! parser array-key batch-size process-batch!)))

(defn stream-keyed-arrays!
  "Walk `reader` once over a top-level JSON object. For each top-level field
  name matching a key in `handlers` (a map of keyword → fn-of-batch), invoke
  the handler for each successive batch of `[line-num row]` tuples (up to
  `batch-size`). Other top-level keys are skipped. `line-num` is 1-indexed
  per array and continues across batch boundaries within an array.

  Throws `:bad_shape` if the document doesn't begin with an object or if a
  known key's value isn't an array. Missing keys (in `handlers` but not in
  the document) are silently OK."
  [^Reader reader batch-size handlers]
  (with-open [parser (.createParser (.getFactory object-mapper) reader)]
    (let [t (.nextToken parser)]
      (when-not (= t JsonToken/START_OBJECT)
        (throw (ex-info "Expected JSON document to begin with an object"
                        {:kind :bad_shape}))))
    (loop []
      (let [t (.nextToken parser)]
        (cond
          (or (nil? t) (= t JsonToken/END_OBJECT))
          nil

          (= t JsonToken/FIELD_NAME)
          (let [field-name (.getCurrentName parser)
                handler-fn (get handlers (keyword field-name))]
            (if handler-fn
              (let [vt (.nextToken parser)]
                (when-not (= vt JsonToken/START_ARRAY)
                  (throw (ex-info (format "Value of %s must be an array" (pr-str field-name))
                                  {:kind :bad_shape, :key field-name})))
                (consume-array-as-batches! parser field-name batch-size handler-fn)
                (recur))
              (do (.nextToken parser)
                  (.skipChildren parser)
                  (recur))))

          :else (recur))))))
