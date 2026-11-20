(ns dev.print-json-schema
  "Write the JSON Schema of registered Malli schemas as serialization writes them, for `./bin/mage print-json-schema`."
  (:require
   [metabase-enterprise.core.init]
   [metabase.core.init]
   [metabase.lib-be.json-schema :as lib-be.json-schema]
   [metabase.lib.schema :as lib.schema]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- load-namespace
  "Load the namespace that names the keyword `schema`, which registers it."
  [schema]
  (try
    (require (symbol (namespace schema)))
    (catch java.io.FileNotFoundException _)))

(defn json-schema
  "The JSON Schema of the Malli schema registered as the one keyword in `schemas`, or of a map with an entry for each of
  several, named by its keyword, with every id in them in its external form."
  [schemas]
  (run! load-namespace schemas)
  (lib-be.json-schema/make-schema
   [:schema {:registry lib.schema/external-registry}
    (if (next schemas)
      (into [:map] (map (fn [schema] [(u/qualified-name schema) schema])) schemas)
      (first schemas))]))

(defn write-schemas!
  "Write to `file` the one JSON Schema of the Malli schemas registered as the keywords `schemas`."
  [schemas file]
  (spit file (json/encode (json-schema schemas) {:pretty true})))

(defn write-schemas-cli!
  "Cold-JVM entry point for `clojure -X:dev:ee:ee-dev dev.print-json-schema/write-schemas-cli! :schemas '[:a/b]' :file '\"out.json\"'`."
  [{:keys [schemas file]}]
  (write-schemas! schemas (str file))
  (shutdown-agents))
