(ns metabase.driver.hive-parser
  (:require [clojure.walk :as walk]
            [cheshire.core :refer [parse-string]]))

(defn- parse-to-json-string [s]
  (loop  [schema s
          closes []
          result ""]
    (cond
      (not (nil? (re-find #"^array<[a-z0-9]*>" schema)))
      (recur (clojure.string/replace-first schema #"^array<[a-z0-9]*>" "")
             closes
             (str result "[]"))

      (clojure.string/starts-with? schema "array<")
      (recur (clojure.string/replace-first schema #"array<" "")
             (conj closes "]")
             (str result "["))

      (clojure.string/starts-with? schema "map<string,string>")
      (recur (clojure.string/replace-first schema #"map<string,string>" "")
             closes
             (str result "[{\"key\":\"string\",\"value\":\"string\"}]"))

      (clojure.string/starts-with? schema "struct<")
      (recur (clojure.string/replace-first schema #"struct<" "")
             (conj closes "}")
             (str result "{"))

      (clojure.string/starts-with? schema ":")
      (recur (clojure.string/replace-first schema #":\s*" "")
             closes
             (str result ":"))

      (clojure.string/starts-with? schema ",")
      (recur (clojure.string/replace-first schema #",\s*" "")
             closes
             (str result ","))

      (clojure.string/starts-with? schema ">")
      (recur (clojure.string/replace-first schema #">" "")
             (pop closes)
             (str result (peek closes))) ; Preciso saber se é } ou ]

      :else (let [name-or-type (re-find #"\w+" schema)]
              (if (= name-or-type nil)
                result
                (recur (clojure.string/replace-first schema name-or-type "")
                       closes
                       (str result "\"" name-or-type "\"")))))))

(defn hive-schema->map
  "Parse hive structs"
  [schema]
  (->
   schema
   (parse-to-json-string)
   (parse-string)
   (walk/keywordize-keys)))