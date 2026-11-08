(ns metabase.sql-parsing.case-files
  "Read SQL parsing test cases. A case file is `{:cases [...]}` and each case carries its `:sql`, the `:dialect` to read
  it with, and what the function under test is expected to answer."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn cases
  "The cases in `test_cases/<file-name>.edn`, the file holding the cases for one function under test."
  [file-name]
  (let [path (str "metabase/sql_parsing/test_cases/" file-name ".edn")
        edn  (edn/read-string (slurp (or (io/resource path)
                                         (throw (ex-info (str "No case file at " path) {:path path})))))]
    (:cases edn)))

(defn file-cases
  "The cases in the `.edn` or `.json` file at `path`, which can be outside this repository."
  [path]
  (let [text (slurp (io/file path))]
    (:cases (if (str/ends-with? (u/lower-case-en path) ".json")
              (json/decode+kw text)
              (edn/read-string text)))))

(defn built
  "The case's SQL: written out, or built from `:build` when the point of the case is SQL too long to write. Each
  item is formatted with its index three times and then the index plus one."
  [{:keys [sql build]}]
  (or sql
      (let [{:keys [prefix item count extra separator suffix]} build
            items (cond-> (mapv #(format item % % % (inc %)) (range count))
                    extra (conj extra))]
        (str prefix (str/join (or separator ", ") items) suffix))))

(defn expand
  "`cases`, with a case that lists `:dialects` or `:sqls` made into one case for each dialect and SQL."
  [cases]
  (for [{:keys [dialects sqls] :as case} cases
        dialect (if (contains? case :dialects) dialects [(:dialect case)])
        sql     (or sqls [(built case)])]
    (-> case
        (dissoc :dialects :sqls :build)
        (assoc :dialect dialect :sql sql))))

(defn expanded-cases
  "The cases in `test_cases/<file-name>.edn`, expanded with [[expand]]."
  [file-name]
  (expand (cases file-name)))
