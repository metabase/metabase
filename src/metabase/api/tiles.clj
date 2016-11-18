(ns metabase.api.tiles
  "`/api/tiles` endpoints."
  (:require [clojure.core.match :refer [match]]
            [clojure.java.io :as io]
            [cheshire.core :as json]
            [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [metabase.util.schema :as su])
  (:import java.awt.Color
           java.awt.image.BufferedImage
           (java.io ByteArrayOutputStream IOException)
           javax.imageio.ImageIO))

;;; # ------------------------------------------------------------ CONSTANTS ------------------------------------------------------------

(def ^:private ^:const tile-size             256.0)
(def ^:private ^:const pixel-origin          (float (/ tile-size 2)))
(def ^:private ^:const pin-size              6)
(def ^:private ^:const pixels-per-lon-degree (float (/ tile-size 360)))
(def ^:private ^:const pixels-per-lon-radian (float (/ tile-size (* 2 Math/PI))))

;;; # ------------------------------------------------------------ UTIL FNS ------------------------------------------------------------

(defn- degrees->radians ^double [^double degrees]
  (* degrees (/ Math/PI 180.0)))

(defn- radians->degrees ^double [^double radians]
  (/ radians (/ Math/PI 180.0)))


;;; # ------------------------------------------------------------ QUERY FNS ------------------------------------------------------------

(defn- x+y+zoom->lat-lon
  "Get the latitude & longitude of the upper left corner of a given tile."
  [^double x, ^double y, ^long zoom]
  (let [num-tiles   (bit-shift-left 1 zoom)
        corner-x    (/ (* x tile-size) num-tiles)
        corner-y    (/ (* y tile-size) num-tiles)
        lon         (/ (- corner-x pixel-origin) pixels-per-lon-degree)
        lat-radians (/ (- corner-y pixel-origin) (* pixels-per-lon-radian -1))
        lat         (radians->degrees (- (* 2 (Math/atan (Math/exp lat-radians)))
                                         (/ Math/PI 2)))]
    {:lat lat, :lon lon}))

(defn- query-with-inside-filter
  "Add an `INSIDE` filter to the given query to restrict results to a bounding box"
  [details lat-field-id lon-field-id x y zoom]
  (let [top-left      (x+y+zoom->lat-lon      x       y  zoom)
        bottom-right  (x+y+zoom->lat-lon (inc x) (inc y) zoom)
        inside-filter ["INSIDE" lat-field-id lon-field-id (top-left :lat) (top-left :lon) (bottom-right :lat) (bottom-right :lon)]]
    (update details :filter
      #(match %
         ["AND" & _]              (conj % inside-filter)
         [(_ :guard string?) & _] (conj ["AND"] % inside-filter)
         :else                    inside-filter))))


;;; # ------------------------------------------------------------ RENDERING ------------------------------------------------------------

(defn- ^BufferedImage create-tile [zoom points]
  (let [num-tiles (bit-shift-left 1 zoom)
        tile      (BufferedImage. tile-size tile-size (BufferedImage/TYPE_INT_ARGB))
        graphics  (.getGraphics tile)
        color-blue (new Color 76 157 230)
        color-white (Color/white)]
    (try
      (doseq [[^double lat, ^double lon] points]
        (let [sin-y      (-> (Math/sin (degrees->radians lat))
                             (Math/max -0.9999)                           ; bound sin-y between -0.9999 and 0.9999 (why ?))
                             (Math/min 0.9999))
              point      {:x (+ pixel-origin
                                (* lon pixels-per-lon-degree))
                          :y (+ pixel-origin
                                (* 0.5
                                   (Math/log (/ (+ 1 sin-y)
                                                (- 1 sin-y)))
                                   (* pixels-per-lon-radian -1.0)))}      ; huh?
              map-pixel  {:x (int (Math/floor (* (point :x) num-tiles)))
                          :y (int (Math/floor (* (point :y) num-tiles)))}
              tile-pixel {:x (mod (map-pixel :x) tile-size)
                          :y (mod (map-pixel :y) tile-size)}]
          ;; now draw a "pin" at the given tile pixel location
          (.setColor graphics color-white)
          (.fillRect graphics (tile-pixel :x) (tile-pixel :y) pin-size pin-size)
          (.setColor graphics color-blue)
          (.fillRect graphics (inc (tile-pixel :x)) (inc (tile-pixel :y)) (- pin-size 2) (- pin-size 2))))
      (catch Throwable e
        (.printStackTrace e))
      (finally
        (.dispose graphics)))
    tile))

(defn- tile->byte-array [^BufferedImage tile]
  (let [output-stream (ByteArrayOutputStream.)]
    (try
      (when-not (ImageIO/write tile "png" output-stream) ; returns `true` if successful -- see JavaDoc
        (throw (Exception. "No approprate image writer found!")))
      (.flush output-stream)
      (.toByteArray output-stream)
      (catch Throwable e
        (byte-array 0)) ; return empty byte array if we fail for some reason
      (finally
        (u/ignore-exceptions
          (.close output-stream))))))



;;; # ------------------------------------------------------------ ENDPOINT ------------------------------------------------------------

(defendpoint GET "/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/"
  "This endpoints provides an image with the appropriate pins rendered given a MBQL QUERY (passed as a GET query string param).
   We evaluate the query and find the set of lat/lon pairs which are relevant and then render the appropriate ones.
   It's expected that to render a full map view several calls will be made to this endpoint in parallel."
  [zoom x y lat-field-id lon-field-id lat-col-idx lon-col-idx query]
  {zoom         su/IntString
   x            su/IntString
   y            su/IntString
   lat-field-id su/IntGreaterThanZero
   lon-field-id su/IntGreaterThanZero
   lat-col-idx  su/IntString
   lon-col-idx  su/IntString
   query        su/JSONString}
  (let [zoom          (Integer/parseInt zoom)
        x             (Integer/parseInt x)
        y             (Integer/parseInt y)
        lat-col-idx   (Integer/parseInt lat-col-idx)
        lon-col-idx   (Integer/parseInt lon-col-idx)
        query         (json/parse-string query keyword)
        updated-query (update query :query (u/rpartial query-with-inside-filter lat-field-id lon-field-id x y zoom))
        result        (qp/dataset-query updated-query {:executed-by   *current-user-id*
                                                       :synchronously true})
        points        (for [row (-> result :data :rows)]
                        [(nth row lat-col-idx) (nth row lon-col-idx)])]
    ;; manual ring response here.  we simply create an inputstream from the byte[] of our image
    {:status  200
     :headers {"Content-Type" "image/png"}
     :body    (java.io.ByteArrayInputStream. (tile->byte-array (create-tile zoom points)))}))


(define-routes)
