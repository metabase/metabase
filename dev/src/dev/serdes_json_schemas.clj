(ns dev.serdes-json-schemas
  "Write a JSON Schema for every serialized model as `<Model>.json`, from the `:schema` of its serialization spec."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.lib-be.json-schema :as lib-be.json-schema]
   [metabase.models.serialization :as serdes]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn json-schema
  "Return the JSON Schema of the serialized form of `model-name`, or nil when the model has no serialization schema."
  [model-name]
  (t2/resolve-model (keyword "model" model-name))
  (when-let [schema-key (:schema (serdes/make-spec model-name {}))]
    (merge {:$schema     "https://json-schema.org/draft/2020-12/schema"
            :title       model-name
            :description (-> schema-key mr/resolve-schema mc/properties :description)}
           (lib-be.json-schema/make-schema schema-key))))

(defn write-schemas!
  "Write `<Model>.json` into `dir` for every exported model that has a serialization schema, and return the models."
  [dir]
  (.mkdirs (io/file dir))
  (vec (for [model-name serdes.models/exported-models
             :let       [schema (json-schema model-name)]
             :when      schema]
         (do (spit (io/file dir (str model-name ".json")) (json/encode schema {:pretty true}))
             model-name))))

(defn write-schemas-cli!
  "Cold-JVM entry point for `clojure -X:dev:ee:ee-dev dev.serdes-json-schemas/write-schemas-cli! :dir '\"out\"'`."
  [{:keys [dir]}]
  (println (str/join " " (write-schemas! (str dir))))
  (shutdown-agents))
