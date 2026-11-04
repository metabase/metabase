(ns metabase.lib-be.json-schema
  "Create JSON Schema for MBQL 5 queries and other serialized representations from their Malli schemas."
  (:require
   [metabase.lib.schema :as schema]
   [metabase.util.json :as json-util]
   [metabase.util.malli.json-schema :as mu.json-schema]))

(defn make-schema
  "Generate the JSON Schema of a Malli schema, by default the external query one, for validators to check documents."
  ([]
   (make-schema ::schema/external-query))
  ([schema]
   (mu.json-schema/dispatch-on-tag (mu.json-schema/transform schema))))

(defn write-schema
  "Print JSON Schema for MBQL5 queries, or write to a file if given."
  [{:keys [file]}]
  (let [json (json-util/encode (make-schema) {:pretty true})]
    (spit (or file "/dev/stdout") json)))

(comment (write-schema {:file "schema.json"}))
