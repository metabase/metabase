(ns metabase.middleware.format
  (:require [clojure.core.match :refer [match]]
            cheshire.factory
            [medley.core :refer [filter-vals map-vals]]
            [metabase.util :as util]))

(declare -format-response)

;; # SHADY HACK
;; Tell the JSON middleware to use a date format that includes milliseconds
(intern 'cheshire.factory 'default-date-format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

;; # FORMAT RESPONSE MIDDLEWARE
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

(defn- clob? [obj]
  (= (type obj) org.h2.jdbc.JdbcClob))

(defn- -format-response [obj]
  (cond
    (map? obj)  (->> (remove-fns-and-delays obj)   ; recurse over all vals in the map
                     (map-vals -format-response))
    (coll? obj) (map -format-response obj)        ; recurse over all items in the collection
    (clob? obj) (util/jdbc-clob->str obj)
    :else       obj))
