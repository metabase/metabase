(ns dev.print-json-schema
  "Write the JSON Schema of registered Malli schemas as serialization writes them, for `./bin/mage print-json-schema`."
  (:require
   [clojure.string :as str]
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

(def ^:private definitions-path "#/definitions/")

(defn- refs
  "The names of the definitions the JSON Schema `body` refers to."
  [body]
  (into #{}
        (keep #(when (and (map? %) (string? (:$ref %)))
                 (subs (:$ref %) (count definitions-path))))
        (tree-seq coll? seq body)))

(defn- used-definitions
  "The definitions of the JSON Schema `schema` that it refers to, directly or through other definitions."
  [{:keys [definitions] :as schema}]
  (loop [used {}, todo (refs (dissoc schema :definitions))]
    (if-let [definition (first todo)]
      (recur (assoc used definition (get definitions definition))
             (into (disj todo definition) (remove used) (refs (get definitions definition))))
      used)))

(defn- external-schema
  "The JSON Schema of the Malli schema registered as the keyword `schema`, with every id in it in its external form and
  only the definitions it uses."
  [schema]
  (let [json-schema (lib-be.json-schema/make-schema [:schema {:registry lib.schema/external-registry} schema])]
    (assoc json-schema :definitions (used-definitions json-schema))))

(defn- merge-definitions
  "Merge the definitions of `json-schemas`, which must agree on what each name stands for."
  [json-schemas]
  (let [bodies    (apply merge-with into (for [json-schema       json-schemas
                                               [definition body] (:definitions json-schema)]
                                           {definition #{body}}))
        conflicts (sort (keep (fn [[definition bodies]] (when (next bodies) definition)) bodies))]
    (when (seq conflicts)
      (throw (ex-info (str "These definitions differ between the schemas, so one of them is missing a rebinding: "
                           (str/join ", " conflicts))
                      {:definitions conflicts})))
    (into (sorted-map) (update-vals bodies first))))

(defn json-schema
  "One JSON Schema for the Malli schemas registered as the keywords `schemas`, as serialization writes them: the schema
  itself for one keyword, and for several an object with a property for each, named by its keyword."
  [schemas]
  (run! load-namespace schemas)
  (let [json-schemas (map external-schema schemas)
        roots        (map #(dissoc % :definitions) json-schemas)]
    (assoc (if (next roots)
             {:type "object" :properties (zipmap (map u/qualified-name schemas) roots)}
             (first roots))
           :definitions (merge-definitions json-schemas))))

(defn write-schemas!
  "Write to `file` the one JSON Schema of the Malli schemas registered as the keywords `schemas`."
  [schemas file]
  (spit file (json/encode (json-schema schemas) {:pretty true})))

(defn write-schemas-cli!
  "Cold-JVM entry point for `clojure -X:dev:ee:ee-dev dev.print-json-schema/write-schemas-cli! :schemas '[:a/b]' :file '\"out.json\"'`."
  [{:keys [schemas file]}]
  (write-schemas! schemas (str file))
  (shutdown-agents))
