(ns metabase.api.tiles
  "`/api/tiles` endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.awt Color)
   (java.awt.image BufferedImage)
   (java.io ByteArrayOutputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- CONSTANTS ----------------------------------------------------

(def ^:private ^:const tile-size             256.0)
(def ^:private ^:const pixel-origin          (float (/ tile-size 2)))
(def ^:private ^:const pin-size              6)
(def ^:private ^:const pixels-per-lon-degree (float (/ tile-size 360)))
(def ^:private ^:const pixels-per-lon-radian (float (/ tile-size (* 2 Math/PI))))
(def ^:private ^:const tile-coordinate-limit
  "Limit for number of pins to query for per tile."
  2000)


;;; ---------------------------------------------------- UTIL FNS ----------------------------------------------------

(defn- degrees->radians ^double [^double degrees]
  (* degrees (/ Math/PI 180.0)))

(defn- radians->degrees ^double [^double radians]
  (/ radians (/ Math/PI 180.0)))


;;; --------------------------------------------------- QUERY FNS ----------------------------------------------------

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
  "Add an `INSIDE` filter to the given query to restrict results to a bounding box. The fields passed in can be either
  integer field ids or string field names. When a field name, the `base-type` will be set to `:type/Float`."
  [details lat-field lon-field x y zoom]
  (let [top-left      (x+y+zoom->lat-lon      x       y  zoom)
        bottom-right  (x+y+zoom->lat-lon (inc x) (inc y) zoom)
        inside-filter [:inside
                       lat-field
                       lon-field
                       (top-left :lat)
                       (top-left :lon)
                       (bottom-right :lat)
                       (bottom-right :lon)]]
    (update details :filter mbql.u/combine-filter-clauses inside-filter)))


;;; --------------------------------------------------- RENDERING ----------------------------------------------------

(defn- create-tile ^BufferedImage [zoom points]
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

(defn- tile->byte-array ^bytes [^BufferedImage tile]
  (let [output-stream (ByteArrayOutputStream.)]
    (try
      (when-not (ImageIO/write tile "png" output-stream) ; returns `true` if successful -- see JavaDoc
        (throw (Exception. (tru "No appropriate image writer found!"))))
      (.flush output-stream)
      (.toByteArray output-stream)
      (catch Throwable _e
        (byte-array 0)) ; return empty byte array if we fail for some reason
      (finally
        (u/ignore-exceptions
          (.close output-stream))))))

(defn- native->source-query
  "Adjust native queries to be an mbql from a source query so we can add the filter clause."
  [query]
  (if (contains? query :native)
    (let [native (set/rename-keys (:native query) {:query :native})]
      {:database (:database query)
       :type     :query
       :query    {:source-query native}})
    query))


;;; ---------------------------------------------------- ENDPOINT ----------------------------------------------------

(defn- int-or-string
  "Parse a string into an integer if it can be otherwise return the string. Intended to determine whether something is a
  field id or a field name."
  [x]
  (if (re-matches #"\d+" x)
    (Integer/parseInt x)
    x))

(defn- field-ref
  "Makes a field reference for `id-or-name`. If id, the type information can be determined, if a string, must be
  provided. Since we deal exclusively with lat/long fields, assumed to be a float."
  [id-or-name]
  (let [id-or-name' (int-or-string id-or-name)]
    [:field id-or-name' (when (string? id-or-name') {:base-type :type/Float})]))

(defn- query->tiles-query
  "Transform a card's query into a query finding coordinates in a particular region.

  - transform native queries into nested mbql queries from that native query
  - add [:inside lat lon bounding-region coordings] filter
  - limit query results to `tile-coordinate-limit` number of results
  - only select lat and lon fields rather than entire query's fields"
  [query {:keys [zoom x y lat-field lon-field]}]
  (-> query
      native->source-query
      (update :query query-with-inside-filter
              lat-field lon-field
              x y zoom)
      (assoc-in [:query :fields] [lat-field lon-field])
      (assoc-in [:query :limit] tile-coordinate-limit)))

;; TODO - this can be reworked to be `defendpoint-async` instead
;;
;; TODO - this should reduce results from the QP in a streaming fashion instead of requiring them all to be in memory
;; at the same time
(api/defendpoint GET "/:zoom/:x/:y/:lat-field/:lon-field"
  "This endpoints provides an image with the appropriate pins rendered given a MBQL `query` (passed as a GET query
  string param). We evaluate the query and find the set of lat/lon pairs which are relevant and then render the
  appropriate ones. It's expected that to render a full map view several calls will be made to this endpoint in
  parallel."
  [zoom x y lat-field lon-field query]
  {zoom        ms/Int
   x           ms/Int
   y           ms/Int
   lat-field   :string
   lon-field   :string
   query       ms/JSONString}
  (let [lat-field-ref (field-ref lat-field)
        lon-field-ref (field-ref lon-field)

        query
        (mbql.normalize/normalize (json/parse-string query keyword))

        updated-query (query->tiles-query query {:zoom zoom :x x :y y
                                                 :lat-field lat-field-ref
                                                 :lon-field lon-field-ref})

        {:keys [status], {:keys [rows cols]} :data, :as result}
        (qp/process-query
         (qp/userland-query updated-query {:executed-by api/*current-user-id*
                                           :context     :map-tiles}))

        lat-key (qp.util/field-ref->key lat-field-ref)
        lon-key (qp.util/field-ref->key lon-field-ref)
        find-fn (fn [lat-or-lon-key]
                  (first (keep-indexed
                          (fn [idx col] (when (= (qp.util/field-ref->key (:field_ref col)) lat-or-lon-key) idx))
                          cols)))
        lat-idx (find-fn lat-key)
        lon-idx (find-fn lon-key)
        points  (for [row rows]
                  [(nth row lat-idx) (nth row lon-idx)])]
    (if (= status :completed)
      {:status  200
       :headers {"Content-Type" "image/png"}
       :body    (tile->byte-array (create-tile zoom points))}
      (throw (ex-info (tru "Query failed")
                      ;; `result` might be a `core.async` channel or something we're not expecting
                      (assoc (when (map? result) result) :status-code 400))))))

(api/define-routes)
