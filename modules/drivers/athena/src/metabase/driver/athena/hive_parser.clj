(ns metabase.driver.athena.hive-parser
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

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
             (conj closes [:array "]"])
             (str result "["))

      (str/starts-with? schema "map<string,string>")
      (recur (str/replace-first schema #"map<string,string>" "")
             closes
             (str result "[{\"key\":\"string\",\"value\":\"string\"}]"))

      (str/starts-with? schema "map<")
      (recur (str/replace-first schema #"map<" "")
             (conj closes [:map-key "}]"])
             (str result "[{\"key\":"))

      (str/starts-with? schema "struct<")
      (recur (str/replace-first schema #"struct<" "")
             (conj closes [:struct "}"])
             (str result "{"))

      (str/starts-with? schema ":")
      (recur (str/replace-first schema #":\s*" "")
             closes
             (str result ":"))

      (str/starts-with? schema ",")
      (let [current-context (first (peek closes))]
        (if (= current-context :map-key)
          (recur (str/replace-first schema #",\s*" "")
                 (conj (pop closes) [:map-value (second (peek closes))])
                 (str result ",\"value\":"))
          (recur (str/replace-first schema #",\s*" "")
                 closes
                 (str result ","))))

      (str/starts-with? schema ">")
      (recur (str/replace-first schema #">" "")
             (pop closes)
             (str result (second (peek closes))))

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
