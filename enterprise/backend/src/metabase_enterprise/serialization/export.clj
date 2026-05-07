(ns metabase-enterprise.serialization.export
  "Orchestrates the metadata-export pipeline: walks [[sections]], runs each
  section's `export-query`, formats rows via `format-entity`, and streams the
  result as a JSON object whose keys are the section names. Sections whose
  `:enabled?` predicate returns false for `opts` are skipped."
  (:require
   [metabase-enterprise.serialization.export.format :as export.format]
   [metabase-enterprise.serialization.export.json :as export.json]
   [metabase-enterprise.serialization.export.query :as export.query]
   [metabase-enterprise.serialization.schema :as schema]
   [metabase.util.malli :as mu])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(def sections
  "Sections emitted by the metadata export, in response order."
  [{:name "databases" :model :model/Database :enabled? :with-databases}
   {:name "tables"    :model :model/Table    :enabled? :with-tables}
   {:name "fields"    :model :model/Field    :enabled? :with-fields}])

(mu/defn export!
  "Streams the metadata export to `os` as a JSON object. Walks [[sections]] and
  includes each section only when its `:enabled?` predicate is truthy for `opts`.

  Warehouses with large schemas can produce gigabytes of metadata, so rows are
  pulled from reducible queries and streamed directly to the writer — memory
  stays bounded regardless of schema size."
  [^OutputStream os
   opts :- ::schema/export-options]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (export.json/write-json-object!
     writer
     (eduction
      (filter (fn [{:keys [enabled?]}] (enabled? opts)))
      (map (fn [{:keys [name model]}]
             [name (eduction
                    (map #(export.format/format-entity model %))
                    (export.query/export-query model opts))]))
      sections))
    (.flush writer)))
