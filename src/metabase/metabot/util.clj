(ns metabase.metabot.util
  (:require
   [clojure.data.xml :as xml]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- safe-case-updater
  [f]
  #(cond-> % (or (string? %) (keyword? %)) f))

(def safe->kebab-case-en
  "Convert strings or keywords to kebab-case."
  (safe-case-updater u/->kebab-case-en))

(def safe->snake_case_en
  "Convert strings or keywords to snake_case"
  (safe-case-updater u/->snake_case_en))

(defn recursive-update-keys
  "Recursively convert map keys in `form` with `f`."
  [form f]
  (walk/walk #(cond-> % (coll? %) (recursive-update-keys f))
             #(cond-> % (map? %) (update-keys f))
             form))

(defn xml
  "Format hiccup-like data structure to an XML string"
  [& bits]
  (let [fmt (fn [v]
              (let [res ^String (xml/indent-str (xml/sexp-as-element v))]
                (cond-> res
                  ;; strip preamble
                  (str/starts-with? res "<?xml") (subs (inc (.indexOf res "\n"))))))]
    (->> (map fmt bits)
         (str/join "\n"))))

;;; MBQL utils (needed until we erradicate legacy from Metabot module)

(defn extract-sql-content
  "Extract SQL content from a dataset_query map.
  Handles both legacy format and lib/query format."
  [query]
  (or
   ;; Following should be ideally handled by lib functions. However we have test in place that checks this piece
   ;; is able to handle not-normalized mblq5 with e.g. string value for type. Lib functions throw on such input.
   ;;
   ;; Try lib/query format (with stages)
   (get-in query [:stages 0 :native])
   ;; Try legacy format
   (get-in query [:native :query])))
