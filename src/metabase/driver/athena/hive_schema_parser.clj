(ns metabase.driver.athena.hive-schema-parser
  (require [cheshire.core :as cheshire]
           [clojure.walk :as walk]))

(defn- schema->json [schema]
  (->
    (clojure.string/replace schema #"array<\w+>" "[]")
    (clojure.string/replace #"struct|<|>" {"struct" "" "<" "{" ">" "}"})
    (clojure.string/replace #"\w+" #(str "\"" %1 "\""))))


(defn- json->map [json]
  (->
    (cheshire/parse-string json)
    (walk/keywordize-keys)))

(defn hive-schema->map [schema]
  (->
    (schema->json schema)
    (json->map)))
