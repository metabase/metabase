(ns metabase-enterprise.serialization.export
  "Orchestrates the metadata export pipeline: walks [[sections]], runs each
  section's `serdes/metadata-query`, formats rows via `serdes/metadata-query-format`,
  and streams the result as a JSON object whose keys are the section names.
  Sections whose `:enabled?` predicate returns false for `opts` are skipped."
  (:require
   [metabase-enterprise.serialization.schema :as schema]
   [metabase.models.serialization :as serdes]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter Writer)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(def ^:private sections
  "Sections emitted by the metadata export, in response order."
  [{:name "databases" :model :model/Database :enabled? :with-databases}
   {:name "tables"    :model :model/Table    :enabled? :with-tables}
   {:name "fields"    :model :model/Field    :enabled? :with-fields}])

(defn- write-json-array!
  "Streams a reducible collection as a JSON array to `writer`. `run!` is required —
  it dispatches through `reduce`, which consumes the `IReduceInit` returned by
  `t2/reducible-query` row-by-row without materializing."
  [^Writer writer reducible]
  (.write writer "[")
  (let [first? (volatile! true)]
    (run! (fn [row]
            (if @first?
              (vreset! first? false)
              (.write writer ","))
            (json/encode-to row writer {}))
          reducible))
  (.write writer "]"))

(defn- write-json-object!
  "Writes a JSON object whose values are JSON arrays. `entries` is a reducible of
  `[entry-name reducible-rows]` pairs."
  [^Writer writer entries]
  (.write writer "{")
  (let [first? (volatile! true)]
    (run! (fn [[entry-name objects]]
            (if @first? (vreset! first? false) (.write writer ","))
            (.write writer (str "\"" entry-name "\":"))
            (write-json-array! writer objects))
          entries))
  (.write writer "}"))

(mu/defn export-metadata!
  "Streams the metadata export to `os` as a JSON object. Walks [[sections]] and
  includes each section only when its `:enabled?` predicate is truthy for `opts`.

  Warehouses with large schemas can produce gigabytes of metadata, so rows are
  pulled from reducible queries and streamed directly to the writer — memory
  stays bounded regardless of schema size."
  [^OutputStream os
   opts :- ::schema/export-metadata-options]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (write-json-object!
     writer
     (eduction
      (filter (fn [{:keys [enabled?]}] (enabled? opts)))
      (map (fn [{:keys [name model]}]
             [name (eduction
                    (map #(serdes/metadata-query-format model %))
                    (serdes/metadata-query model opts))]))
      sections))
    (.flush writer)))
