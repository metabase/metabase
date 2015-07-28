(ns metabase.middleware.format
  (:require [clojure.core.match :refer [match]]
            (cheshire factory
                      [generate :refer [add-encoder encode-str]])
            [medley.core :refer [filter-vals map-vals]]
            [metabase.middleware.log-api-call :refer [api-call?]]
            [metabase.models.interface :refer [api-serialize]]
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

(defn add-security-headers
  "Add HTTP headers to tell browsers not to cache API responses."
  [handler]
  (fn [request]
    (let [response (handler request)]
      (update response :headers merge (when (api-call? request)
                                        {"Cache-Control" "max-age=0, no-cache, must-revalidate, proxy-revalidate"
                                         "Expires"       "Tue, 03 Jul 2001 06:00:00 GMT" ; rando date in the past
                                         "Last-Modified" "{now} GMT"})))))

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
               ;; Convert typed maps such as metabase.models.database/DatabaseInstance to plain maps because empty, which is used internally by filter-vals,
               ;; will fail otherwise
               (into {} m)))

(defn- -format-response [obj]
  (cond
    (map? obj)  (->> (api-serialize obj)
                     remove-fns-and-delays
                     (map-vals -format-response)) ; recurse over all vals in the map
    (coll? obj) (map -format-response obj) ; recurse over all items in the collection
    :else       obj))
