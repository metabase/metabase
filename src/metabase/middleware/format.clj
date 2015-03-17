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

(add-encoder org.h2.jdbc.JdbcClob (fn [clob ^com.fasterxml.jackson.core.JsonGenerator json-generator]  ; stringify JDBC Clobs
                                    (.writeString json-generator (util/jdbc-clob->str clob))))
(add-encoder org.postgresql.util.PGobject encode-str)                                                 ; stringify Postgres binary objects (e.g. PostGIS geometries)


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
