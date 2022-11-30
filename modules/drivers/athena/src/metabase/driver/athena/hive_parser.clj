(ns metabase.driver.athena.hive-parser
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.walk :as walk]))

(set! *warn-on-reflection* true)

(defn- parse-to-json-string [s]
  (loop  [schema s
          closes []
          result ""]
    (cond
      (not (nil? (re-find #"^array<[a-z0-9]*>" schema)))
      (recur (str/replace-first schema #"^array<[a-z0-9]*>" "")
             closes
             (str result "[]"))

      (str/starts-with? schema "array<")
      (recur (str/replace-first schema #"array<" "")
             (conj closes "]")
             (str result "["))

      (str/starts-with? schema "map<string,string>")
      (recur (str/replace-first schema #"map<string,string>" "")
             closes
             (str result "[{\"key\":\"string\",\"value\":\"string\"}]"))

      (str/starts-with? schema "struct<")
      (recur (str/replace-first schema #"struct<" "")
             (conj closes "}")
             (str result "{"))

      (str/starts-with? schema ":")
      (recur (str/replace-first schema #":\s*" "")
             closes
             (str result ":"))

      (str/starts-with? schema ",")
      (recur (str/replace-first schema #",\s*" "")
             closes
             (str result ","))

      (str/starts-with? schema ">")
      (recur (str/replace-first schema #">" "")
             (pop closes)
             (str result (peek closes))) ; Preciso saber se é } ou ]

      :else (let [name-or-type (re-find #"\w+" schema)]
              (if (= name-or-type nil)
                result
                (recur (str/replace-first schema name-or-type "")
                       closes
                       (str result "\"" name-or-type "\"")))))))

(defn hive-schema->map
  "Parse hive structs"
  [schema]
  (-> schema
      parse-to-json-string
      json/parse-string
      walk/keywordize-keys))
