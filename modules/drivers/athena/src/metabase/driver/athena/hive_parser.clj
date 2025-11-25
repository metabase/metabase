(ns metabase.driver.athena.hive-parser
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(def map-close
  "The closing brackets of a map type"
  "}]")

(defn- parse-to-json-string [s]
  (loop [schema s
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

      (str/starts-with? schema "map<")
      (recur (str/replace-first schema #"map<" "")
             (conj closes map-close)
             (str result "[{\"key\":"))

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
             (str result (if (= (peek closes) map-close)
                           ",\"value\":"
                           ",")))

      (str/starts-with? schema ">")
      (recur (str/replace-first schema #">" "")
             (pop closes)
             (str result (peek closes)))

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
      json/decode
      perf/keywordize-keys))
