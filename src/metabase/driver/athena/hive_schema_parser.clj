(ns metabase.driver.athena.hive-schema-parser
  (:require [cheshire.core :as cheshire]
           [clojure.walk :as walk]))

(defn cool-parser
  ([schema l]
  (cool-parser schema l 0))
  ([schema l r]
   (let [x (+ r 1)]
  (cond
    (not (nil? (re-find #"^array<[a-z0-9]*>" schema)))
      (str "[]" (cool-parser (clojure.string/replace-first schema #"^array<[a-z0-9]*>" "") l r))
    (clojure.string/starts-with? schema "array<")
      (str "[" (cool-parser (clojure.string/replace-first schema #"array<" "") (conj l "]") x))
    (clojure.string/starts-with? schema "struct<")
      (str "{" (cool-parser (clojure.string/replace-first schema #"struct<" "") (conj l "}") x))
    (clojure.string/starts-with? schema "map<string,string>")
    (str "[{\"key\":\"string\",\"value\":\"string\"}]" (cool-parser (clojure.string/replace-first schema #"map<string,string>" "") l r))
    (clojure.string/starts-with? schema ":")
      (str ":" (cool-parser (clojure.string/replace-first schema #":" "") l r))
    (clojure.string/starts-with? schema ",")
      (str "," (cool-parser (clojure.string/replace-first schema #"," "") l r))
    (clojure.string/starts-with? schema ">")
      (str (peek l) (cool-parser (clojure.string/replace-first schema #">" "") (pop l) r))
    :else (let [name-or-type (re-find #"\w+" schema)]
            (if (= name-or-type nil) ""
                                     (str "\"" name-or-type "\""
                                          (cool-parser (clojure.string/replace-first schema name-or-type "") l r))))))))

(defn- schema->json [schema]
  (cool-parser schema []))


(defn- json->map [json]
  (->
    (cheshire/parse-string json)
    (walk/keywordize-keys)))

(defn hive-schema->map
  "Parse hive structs"
  [schema]
  (->
    (schema->json schema)
    (json->map)))
