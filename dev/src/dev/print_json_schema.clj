(ns dev.print-json-schema
  "Write the JSON Schema of a registered Malli schema, for `./bin/mage print-json-schema`."
  (:require
   [metabase-enterprise.core.init]
   [metabase.core.init]
   [metabase.lib-be.json-schema :as lib-be.json-schema]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn write-schema!
  "Write the JSON Schema of the Malli schema registered as the keyword `schema` to `file`."
  [schema file]
  (spit file (json/encode (lib-be.json-schema/make-schema schema) {:pretty true})))

(defn write-schema-cli!
  "Cold-JVM entry point for `clojure -X:dev:ee:ee-dev dev.print-json-schema/write-schema-cli! :schema :a/b :file '\"out.json\"'`."
  [{:keys [schema file]}]
  (write-schema! schema (str file))
  (shutdown-agents))
