(ns metabase.api.tiles
  (:require [clojure.core.match :refer [match]]
            [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver])
  (:import (java.util ArrayList
                      Collection)))


(def ^:const tile-size 256)
(def ^:const pixel-origin (float (/ tile-size 2)))
(def ^:const pixel-per-lon-degree (float (/ tile-size 360.0)))
(def ^:const pixel-per-lon-radian (float (/ tile-size (* 2 Math/PI))))

(defn- radians->degrees [rad]
  (/ rad (float (/ Math/PI 180))))

(defn- tile-lat-lon
  "Get the Latitude & Longitude of the upper left corner of a given tile"
  [x y zoom]
  (let [num-tiles   (bit-shift-left 1 zoom)
        corner-x    (float (/ (* x tile-size) num-tiles))
        corner-y    (float (/ (* y tile-size) num-tiles))
        lon         (float (/ (- corner-x pixel-origin) pixel-per-lon-degree))
        lat-radians (/ (- corner-y pixel-origin) (* pixel-per-lon-radian -1))
        lat         (radians->degrees (- (* 2 (Math/atan (Math/exp lat-radians)))
                                         (/ Math/PI 2)))]
    {:lat lat
     :lon lon}))


(defn- query-with-inside-filter
  "Add an 'Inside' filter to the given query to restrict results to a bounding box"
  [details lat-field-id lon-field-id x y zoom]
  (let [{top-lt-lat :lat top-lt-lon :lon} (tile-lat-lon x y zoom)
        {bot-rt-lat :lat bot-rt-lon :lon} (tile-lat-lon (+ x 1) (+ y 1) zoom)
        inside-filter ["INSIDE", lat-field-id, lon-field-id, top-lt-lat, top-lt-lon, bot-rt-lat, bot-rt-lon]]
    (update-in details [:filter]
      #(match %
        ["AND" & _]              (conj % inside-filter)
        [(_ :guard string?) & _] (conj ["AND"] % inside-filter)
        :else                    inside-filter))))


(defn- extract-points
  "Takes in a dataset query result object and pulls out the Latitude/Longitude pairs into nested `java.util.ArrayLists`.
   This is specific to the way we plan to feed data into `com.metabase.corvus.api.tiles.GoogleMapPinsOverlay`."
  [lat-col-idx lon-col-idx {{:keys [rows cols]} :data}]
  (if-not (> (count rows) 0)
    ;; if we have no rows then return an empty list of points
    (ArrayList. (ArrayList.))
    ;; otherwise we go over the data, pull out the lat/lon columns, and convert them to ArrayLists
    (ArrayList. ^Collection (map (fn [row]
                                   (ArrayList. ^Collection (vector (nth row lat-col-idx) (nth row lon-col-idx))))
                                 rows))))


(defendpoint GET "/:zoom/:x/:y/:lat-field/:lon-field/:lat-col-idx/:lon-col-idx/"
  "This endpoints provides an image with the appropriate pins rendered given a json query.
   We evaluate the query and find the set of lat/lon pairs which are relevant and then render the appropriate ones.
   It's expected that to render a full map view several calls will be made to this endpoint in parallel."
  [zoom x y lat-field lon-field lat-col-idx lon-col-idx query :as request]
  {zoom        String->Integer
   x           String->Integer
   y           String->Integer
   lat-field   String->Integer
   lon-field   String->Integer
   lat-col-idx String->Integer
   lon-col-idx String->Integer
   query       String->Dict}
  (let [updated-query (assoc query :query (query-with-inside-filter (:query query) lat-field lon-field x y zoom))
        result (driver/dataset-query updated-query {:executed_by *current-user-id*
                                                    :synchronously true})
        lat-lon-points (extract-points lat-col-idx lon-col-idx result)]
    ;; manual ring response here.  we simply create an inputstream from the byte[] of our image
    {:status  200
     :headers {"Content-Type" "image/png"}
     :body    (-> (com.metabase.corvus.api.tiles.GoogleMapPinsOverlay. zoom lat-lon-points)
                  (.toByteArray)
                  (java.io.ByteArrayInputStream.))}))


(define-routes)
