(ns metabase.sql-tools.shadow-differences
  "Keeps the inputs on which the two parsers of a shadow SQL parser backend (`sqlglot-shadow`,
  `sqlglot-java-shadow`) did not agree in the app DB table `sql_parsing_shadow_difference`, so that each one can be
  reproduced.

  The table holds customer SQL, so it stays small: one row per distinct input (a repeat increments `seen_count`), and
  long text is truncated. Nothing is written unless a shadow backend is in use."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.db :as sql-tools.db]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def ^:private max-sql-length
  "The most characters of SQL a row keeps."
  65536)

(def ^:private max-json-length
  "The most characters of each JSON column (the arguments and each result) a row keeps."
  16384)

(defn- ->json
  "`x` as JSON of at most about `max-json-length` characters. JSON that is too long becomes a JSON object whose
  `truncated` key holds the start of it, so the column always holds valid JSON."
  [x]
  (let [s (try
            (json/encode x)
            (catch Exception _
              (json/encode (pr-str x))))]
    (if (< max-json-length (count s))
      (json/encode {:truncated (u/truncate s max-json-length)})
      s)))

(defn- truncate
  [s n]
  (some-> s (u/truncate n)))

(defn- canonical
  "`x` with every map and set in a fixed order, so that equal values print the same."
  [x]
  (walk/postwalk (fn [form]
                   (cond
                     (map? form) (into (sorted-map-by #(compare (pr-str %1) (pr-str %2))) form)
                     (set? form) (into (sorted-set-by #(compare (pr-str %1) (pr-str %2))) form)
                     :else       form))
                 x))

(defn- input-hash
  "SHA-256 of the input, with the arguments in [[canonical]] order."
  [{:keys [method dialect primary-backend shadow-backend sql args]}]
  (codecs/bytes->hex
   (buddy-hash/sha256 (pr-str [method dialect primary-backend shadow-backend sql (canonical args)]))))

(defn- unique-violation?
  "True when `e`, or an exception that caused it, is a unique constraint violation (SQL state class 23)."
  [^Throwable e]
  (some (fn [^Throwable t]
          (some-> (when (instance? SQLException t) (.getSQLState ^SQLException t))
                  (str/starts-with? "23")))
        (take-while some? (iterate ex-cause e))))

(defn record!
  "Keep `difference`, a map that [[metabase.sql-parsing.core/set-shadow-difference-recorder!]] describes."
  [{:keys [method dialect outcome primary-backend shadow-backend sql args primary shadow] :as difference}]
  (let [hash-value (input-hash difference)
        changes    {:outcome        (name outcome)
                    :primary_result (->json primary)
                    :shadow_result  (->json shadow)}]
    (when (zero? (sql-tools.db/shadow-difference-seen-again! hash-value changes))
      (let [row {:input_hash      hash-value
                 :method          (name method)
                 :dialect         (some-> dialect name)
                 :primary_backend (name primary-backend)
                 :shadow_backend  (name shadow-backend)
                 :sql             (truncate sql max-sql-length)
                 :arguments       (when (seq args)
                                    (->json args))}]
        (try
          (sql-tools.db/insert-shadow-difference! (merge changes row))
          (catch Exception e
            ;; another thread or instance inserted the same input first
            (when-not (unique-violation? e)
              (throw e))
            (sql-tools.db/shadow-difference-seen-again! hash-value changes)))))))

(sql-parsing/set-shadow-difference-recorder! #'record!)
