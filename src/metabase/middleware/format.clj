(ns metabase.middleware.format
  (:require [clojure.core.match :refer [match]]
            (cheshire factory
                      [generate :refer [add-encoder encode-str]])
            [medley.core :refer [filter-vals map-vals]]
            [metabase.util :as util]))

(declare -format-response)

;; ## SHADY HACK
;; Tell the JSON middleware to use a date format that includes milliseconds
(intern 'cheshire.factory 'default-date-format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")


;; ## Custom JSON encoders

;; stringify JDBC clobs
(add-encoder org.h2.jdbc.JdbcClob (fn [clob ^com.fasterxml.jackson.core.JsonGenerator json-generator]
                                    (.writeString json-generator (util/jdbc-clob->str clob))))

;; stringify Postgres binary objects (e.g. PostGIS geometries)
(add-encoder org.postgresql.util.PGobject encode-str)

;; Do the same for PG arrays
(add-encoder org.postgresql.jdbc4.Jdbc4Array encode-str)

;; Encode BSON IDs like strings
(add-encoder org.bson.types.ObjectId encode-str)

;; serialize sql dates (i.e., QueryProcessor results) like YYYY-MM-DD instead of as a full-blown timestamp
(add-encoder java.sql.Date (fn [^java.sql.Date date ^com.fasterxml.jackson.core.JsonGenerator json-generator]
                             (.writeString json-generator (.toString date))))


;; ## FORMAT RESPONSE MIDDLEWARE
(defn format-response
  "Middleware that recurses over Clojure object before it gets converted to JSON and makes adjustments neccessary so the formatter doesn't barf.
   e.g. functions and delays are stripped and H2 Clobs are converted to strings."
  [handler]
  (fn [request]
    (-format-response (handler request))))

(defn- remove-fns-and-delays
  "Remove values that are fns or delays from map M."
  [m]
  (filter-vals #(not (or (delay? %)
                         (fn? %)))
               m))

(defn- -format-response [obj]
  (cond
    (map? obj)  (->> (remove-fns-and-delays obj)   ; recurse over all vals in the map
                     (map-vals -format-response))
    (coll? obj) (map -format-response obj)        ; recurse over all items in the collection
    :else       obj))
