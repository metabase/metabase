(ns metabase.api.tiles
  (:require [clojure.data.json :as json]
            [clojure.tools.logging :as log]
            [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]))


(def tile-size 256)
(def pixel-origin (float (/ tile-size 2)))
(def pixel-per-lon-degree (float (/ tile-size 360.0)))
(def pixel-per-lon-radian (float (/ tile-size (* 2 (java.lang.Math/PI)))))

(defn- radians-to-degrees [rad]
  (float (/ rad (float (/ (java.lang.Math/PI) 180)))))

(defn- tile-lat-lon
  "Get the Latitude & Longitude of the upper left corner of a given tile"
  [x y zoom]
  (let [num-tiles (bit-shift-left 1 zoom)
        corner-x (float (/ (* x tile-size) num-tiles))
        corner-y (float (/ (* y tile-size) num-tiles))
        lon (float (/ (- corner-x pixel-origin) pixel-per-lon-degree))
        lat-radians (/ (- corner-y pixel-origin) (* pixel-per-lon-radian -1))
        lat (radians-to-degrees (- (* 2 (java.lang.Math/atan (java.lang.Math/exp lat-radians)))
                                   (/ (java.lang.Math/PI) 2)))]
    {:lat lat
     :lon lon}))


(defn- query-with-inside-filter
  "Add an 'Inside' filter to the given query to restrict results to a bounding box"
  [details lat-field-id lon-field-id x y zoom]
  (let [{top-lt-lat :lat top-lt-lon :lon} (tile-lat-lon x y zoom)
        {bot-rt-lat :lat bot-rt-lon :lon} (tile-lat-lon (+ x 1) (+ y 1) zoom)
        inside-filter ["INSIDE", lat-field-id, lon-field-id, top-lt-lat, top-lt-lon, bot-rt-lat, bot-rt-lon]]
    (if (or (not (:filter details))
            (not (get (:filter details) 0)))
      ;; there is no valid 'filter' clause right now, so just apply ours as the only filter
      (assoc details :filter inside-filter)
      ;; nested if.  maybe there's a better way?
      (if (= "AND" (get (:filter details) 0))
        ;; there are multiple existing filters already, so just append ours to the end of the list
        (assoc details :filter (conj (:filter details) inside-filter))
        ;; final scenario.  looks like there is a single existing filter, so create the AND syntax and combine them
        (assoc details :filter (conj ["AND"] (:filter details) inside-filter))))))


(defn- extract-points
  "Takes in a dataset query result object and pulls out the Latitude/Longitude pairs into nested `java.util.ArrayLists`.
   This is specific to the way we plan to feed data into `com.metabase.corvus.api.tiles.GoogleMapPinsOverlay`."
  [{{:keys [rows cols]} :data}]
  (if-not (> (count rows) 0)
    ;; if we have no rows then return an empty list of points
    (java.util.ArrayList. [])
    ;; otherwise we go over the data, pull out the lat/lon columns, and convert them to ArrayLists
    (let [find-col-idx (fn [special-type]
                         (->> (map-indexed (fn [idx itm] (when (= special-type (:special_type itm)) idx)) cols)
                              (filter identity)
                              (first)))
          lat-col-idx (find-col-idx "latitude")
          lon-col-idx (find-col-idx "longitude")]
      (->> (map (fn [row] (java.util.ArrayList. [(nth row lat-col-idx) (nth row lon-col-idx)])) rows)
           (java.util.ArrayList.)))))


;; This endpoints provides an image with the appropriate pins rendered given a json query
;; We evaluate the query and find the set of lat/lon pairs which are relevant and then render the appropriate ones
;; It's expected that to render a full map view several calls will be made to this endpoint in parallel
(defendpoint GET "/:zoom/:x/:y/:lat-field/:lon-field/:lat-col-idx/:lon-col-idx/"
  [zoom x y lat-field lon-field lat-col-idx lon-col-idx query :as request]
  {zoom String->Integer
   x String->Integer
   y String->Integer
   lat-field String->Integer
   lon-field String->Integer
   lat-col-idx String->Integer
   lon-col-idx String->Integer
   query String->Dict}
  ;; TODO - tried to use `query String->Dict` above, but got errors with json parsing for some reason
  (let [updated-query (assoc query :query (query-with-inside-filter (:query query) lat-field lon-field x y zoom))
        result (driver/dataset-query updated-query {:executed_by *current-user-id*
                                                    :synchronously true})
        lat-lon-points (extract-points result)]
    ;; manual ring response here.  we simply create an inputstream from the byte[] of our image
    {:status  200
     :headers {"Content-Type" "image/png"}
     :body    (java.io.ByteArrayInputStream.
                (.toByteArray
                  (com.metabase.corvus.api.tiles.GoogleMapPinsOverlay. zoom lat-lon-points)))}))


(define-routes)
