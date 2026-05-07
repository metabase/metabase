(ns metabase-enterprise.serialization.metadata-file-import.parsers
  "File-extension-based format dispatcher for the metadata file importer.
  Detects format from the path's lowercased suffix (`.json` / `.yaml` / `.yml`)
  and delegates to the matching per-format parser. Manages the file lifecycle
  (FileInputStream + UTF-8 InputStreamReader) so per-format parsers only see
  a `Reader`."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.metadata-file-import.parsers.json :as json]
   [metabase-enterprise.serialization.metadata-file-import.parsers.yaml :as yaml]
   [metabase.util :as u])
  (:import
   (java.io File FileInputStream InputStreamReader)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- detect-format
  "Return `:json`, `:yaml`, or throw. Extension match is case-insensitive."
  [^File file]
  (let [name  (.getName file)
        lower (u/lower-case-en name)]
    (cond
      (str/ends-with? lower ".json") :json
      (str/ends-with? lower ".yaml") :yaml
      (str/ends-with? lower ".yml")  :yaml
      :else (throw (ex-info (format "Unknown file format for %s — expected one of .json / .yaml / .yml"
                                    (pr-str name))
                            {:kind :unknown_format, :file name})))))

(defn stream-array-batches!
  "Stream `file`'s named array (string or keyword `array-key`) through `process-batch!`.
  Format is auto-detected from the extension. Caller's responsibility to ensure the
  file exists and is readable; opening errors propagate."
  [^File file array-key batch-size process-batch!]
  (let [parser-fn (case (detect-format file)
                    :json json/stream-array-batches!
                    :yaml yaml/stream-array-batches!)]
    (with-open [is     (FileInputStream. file)
                reader (InputStreamReader. is StandardCharsets/UTF_8)]
      (parser-fn reader array-key batch-size process-batch!))))

(defn stream-keyed-arrays!
  "Single-pass walk of `file`'s top-level object/mapping, dispatching arrays to
  per-key handlers. `handlers` is a map of keyword → fn-of-batch (each batch
  is a vector of `[line-num row]` tuples, up to `batch-size`). Format is
  auto-detected from the extension; arrays for keys not in `handlers` are
  skipped without materialization. Replaces the N-file-passes pattern of
  calling `stream-array-batches!` once per known key."
  [^File file batch-size handlers]
  (let [parser-fn (case (detect-format file)
                    :json json/stream-keyed-arrays!
                    :yaml yaml/stream-keyed-arrays!)]
    (with-open [is     (FileInputStream. file)
                reader (InputStreamReader. is StandardCharsets/UTF_8)]
      (parser-fn reader batch-size handlers))))
