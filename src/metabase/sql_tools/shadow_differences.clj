(ns metabase.sql-tools.shadow-differences
  "Keeps the inputs on which the two parsers of a shadow SQL parser backend (`sqlglot-shadow`,
  `sqlglot-java-shadow`) did not agree in the app DB table `sql_parsing_shadow_difference`, so that each one can be
  reproduced.

  The table holds customer SQL, so it stays small: one row per distinct input (a repeat increments `seen_count`),
  long text is truncated, and at most [[max-rows]] rows are kept, the oldest removed first. Nothing is written
  unless a shadow backend is in use."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.db :as sql-tools.db]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def max-rows
  "The most rows the table keeps."
  1000)

(def ^:private max-sql-length
  "The most characters of SQL a row keeps."
  65536)

(def ^:private max-json-length
  "The most characters of each JSON column (the arguments and each result) a row keeps."
  16384)

(defn- ->json
  [x]
  (try
    (json/encode x)
    (catch Exception _
      (json/encode (pr-str x)))))

(defn- truncate
  [s n]
  (some-> s (u/truncate n)))

(defn- input-hash
  [{:keys [method dialect primary-backend shadow-backend sql args]}]
  (codecs/bytes->hex
   (buddy-hash/sha256 (pr-str [method dialect primary-backend shadow-backend sql args]))))

(defn record!
  "Keep `difference`, a map that [[metabase.sql-parsing.core/set-shadow-difference-recorder!]] describes."
  [{:keys [method dialect outcome primary-backend shadow-backend sql args primary shadow] :as difference}]
  (let [hash-value (input-hash difference)
        changes    {:outcome        (name outcome)
                    :primary_result (truncate (->json primary) max-json-length)
                    :shadow_result  (truncate (->json shadow) max-json-length)}]
    (when (zero? (sql-tools.db/shadow-difference-seen-again! hash-value changes))
      (let [id (sql-tools.db/insert-shadow-difference!
                (merge changes
                       {:input_hash      hash-value
                        :method          (name method)
                        :dialect         (some-> dialect name)
                        :primary_backend (name primary-backend)
                        :shadow_backend  (name shadow-backend)
                        :sql             (truncate sql max-sql-length)
                        :arguments       (when (seq args)
                                           (truncate (->json args) max-json-length))}))]
        (when (< max-rows id)
          (sql-tools.db/delete-shadow-differences-up-to! (- id max-rows)))))))

(sql-parsing/set-shadow-difference-recorder! #'record!)
