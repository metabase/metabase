(ns metabase-enterprise.serialization.metadata-file-import.parsers
  "Streaming JSON parser for the metadata file importer. Walks a top-level JSON
  object, advances to a named array, and emits its items in batches via a
  callback. Memory bounded by the in-flight item plus the current batch buffer."
  (:require
   [metabase.util.performance :as perf])
  (:import
   (com.fasterxml.jackson.core JsonParser JsonToken)
   (com.fasterxml.jackson.databind ObjectMapper)
   (java.io File FileInputStream InputStreamReader Reader)
   (java.nio.charset StandardCharsets)
   (java.util LinkedHashMap)))

(set! *warn-on-reflection* true)

(def ^:private ^ObjectMapper object-mapper (ObjectMapper.))

(defn- advance-to-array!
  "Advance `parser` from start-of-input through a top-level JSON object to the
  array valued at `target-key` (parser has just consumed the START_ARRAY
  token). Throws `:bad-shape` if the document doesn't begin with an object or
  the value at `target-key` isn't an array; throws `:missing-key` if the key
  is absent."
  [^JsonParser parser ^String target-key]
  (let [t (.nextToken parser)]
    (when-not (= t JsonToken/START_OBJECT)
      (throw (ex-info "Expected JSON document to begin with an object"
                      {:kind :bad-shape, :target-key target-key}))))
  (loop []
    (let [t (.nextToken parser)]
      (cond
        (or (nil? t) (= t JsonToken/END_OBJECT))
        (throw (ex-info (format "Key %s not found in top-level object" (pr-str target-key))
                        {:kind :missing-key, :key target-key}))

        (= t JsonToken/FIELD_NAME)
        (if (= target-key (.getCurrentName parser))
          (let [vt (.nextToken parser)]
            (when-not (= vt JsonToken/START_ARRAY)
              (throw (ex-info (format "Value of %s must be an array" (pr-str target-key))
                              {:kind :bad-shape, :key target-key}))))
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
                        {:kind :bad-shape, :key array-key}))

        :else
        (throw (ex-info (format "Unexpected token %s in array %s"
                                (some-> t .asString) (pr-str array-key))
                        {:kind :bad-shape, :key array-key}))))))

(defn- open-parser
  ^JsonParser [^Reader reader]
  (.createParser (.getFactory object-mapper) reader))

(defn stream-array-batches!
  "Stream `file`'s top-level named array (string or keyword `array-key`) through
  `process-batch!`. Each batch is a vector of `[line-num row]` tuples (up to
  `batch-size`); `line-num` is 1-indexed and continues across batch boundaries.
  Items are parsed into Clojure maps with keyword keys. Caller's responsibility
  to ensure the file exists and is readable; opening errors propagate."
  [^File file array-key batch-size process-batch!]
  (with-open [is     (FileInputStream. file)
              reader (InputStreamReader. is StandardCharsets/UTF_8)
              parser (open-parser reader)]
    (advance-to-array! parser (name array-key))
    (consume-array-as-batches! parser array-key batch-size process-batch!)))

(defn stream-keyed-arrays!
  "Single-pass walk of `file`'s top-level JSON object, dispatching arrays to
  per-key handlers. `handlers` is a map of keyword → fn-of-batch (each batch is
  a vector of `[line-num row]` tuples, up to `batch-size`). Arrays for keys not
  in `handlers` are skipped without materialization.

  Throws `:bad-shape` if the document doesn't begin with an object or if a
  known key's value isn't an array. Missing keys are silently OK."
  [^File file batch-size handlers]
  (with-open [is     (FileInputStream. file)
              reader (InputStreamReader. is StandardCharsets/UTF_8)
              parser (open-parser reader)]
    (let [t (.nextToken parser)]
      (when-not (= t JsonToken/START_OBJECT)
        (throw (ex-info "Expected JSON document to begin with an object"
                        {:kind :bad-shape}))))
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
                                  {:kind :bad-shape, :key field-name})))
                (consume-array-as-batches! parser field-name batch-size handler-fn)
                (recur))
              (do (.nextToken parser)
                  (.skipChildren parser)
                  (recur))))

          :else (recur))))))
