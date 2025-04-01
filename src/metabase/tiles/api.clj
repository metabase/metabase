(ns metabase.tiles.api
  "`/api/tiles` endpoints."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.awt Color)
   (java.awt.image BufferedImage)
   (java.io ByteArrayOutputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- CONSTANTS ----------------------------------------------------

(def ^:private ^:const tile-size             256.0)
(def ^:private ^:const pixel-origin          (double (/ tile-size 2)))
(def ^:private ^:const pin-size              6)
(def ^:private ^:const pixels-per-lon-degree (double (/ tile-size 360)))
(def ^:private ^:const pixels-per-lon-radian (double (/ tile-size (* 2 Math/PI))))

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
  [^double x ^double y ^long zoom]
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
      (doseq [[^double lat ^double lon] points]
        (let [sin-y      (-> (Math/sin (degrees->radians lat))
                             (Math/max -0.9999)                           ; bound sin-y between -0.9999 and 0.9999 (why ?))
                             (Math/min 0.9999))
              point      {:x (+ pixel-origin
                                (* lon pixels-per-lon-degree))
                          :y (+ pixel-origin
                                (* 0.5
                                   (Math/log (/ (inc sin-y)
                                                (- 1 sin-y)))
                                   pixels-per-lon-radian
                                   -1.0))}         ; huh?
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
    (let [source-query (-> (:native query)
                           (set/rename-keys {:query :native})
                           (cond-> (:parameters query) (assoc :parameters (:parameters query))))]
      {:database (:database query)
       :type     :query
       :query    {:source-query source-query}})
    query))

;;; ---------------------------------------------------- ENDPOINTS ----------------------------------------------------

(defn- tiles-query
  "Transform a card's query into a query finding coordinates in a particular region.

  - transform native queries into nested mbql queries from that native query
  - add [:inside lat lon bounding-region coordings] filter
  - limit query results to `tile-coordinate-limit` number of results
  - only select lat and lon fields rather than entire query's fields"
  [query zoom x y lat-field-ref lon-field-ref]
  (let [query (mbql.normalize/normalize query)]
    (-> query
        native->source-query
        (update :query query-with-inside-filter
                lat-field-ref lon-field-ref
                x y zoom)
        (assoc-in [:query :fields] [lat-field-ref lon-field-ref])
        (assoc-in [:query :limit] tile-coordinate-limit))))

;;; TODO -- what if the field name contains a slash? Are we expected to URL-encode it? I don't think we have any code
;;; that handles that.
(mr/def :api.tiles/field-id-or-name
  [:string {:api/regex #"[^/]+"}])

(mr/def :api.tiles/route-params
  [:map
   [:zoom      ms/Int]
   [:x         ms/Int]
   [:y         ms/Int]
   [:lat-field :string]
   [:lon-field :string]])

(defn- result->points
  [{{:keys [rows cols]} :data} lat-field-ref lon-field-ref]
  (let [lat-key (qp.util/field-ref->key lat-field-ref)
        lon-key (qp.util/field-ref->key lon-field-ref)
        find-fn (fn [lat-or-lon-key]
                  (first (keep-indexed
                          (fn [idx col] (when (= (qp.util/field-ref->key (:field_ref col)) lat-or-lon-key) idx))
                          cols)))
        lat-idx (find-fn lat-key)
        lon-idx (find-fn lon-key)]
    (for [row rows]
      [(nth row lat-idx) (nth row lon-idx)])))

;; TODO - this should be async and stream results from the QP instead of requiring them all to be in memory at the same
;; time
(defn- tiles-response
  [result zoom points]
  (if (= (:status result) :completed)
    {:status  200
     :headers {"Content-Type" "image/png"}
     :body    (tile->byte-array (create-tile zoom points))}
    (throw (ex-info (tru "Query failed")
                      ;; `result` might be a `core.async` channel or something we're not expecting
                    (assoc (when (map? result) result) :status-code 400)))))

;; These endpoints provides an image with the appropriate pins rendered given a MBQL `query` (passed as a GET query
;; string param). We evaluate the query and find the set of lat/lon pairs which are relevant and then render the
;; appropriate ones. It's expected that to render a full map view several calls will be made to this endpoint in
;; parallel.
(api.macros/defendpoint :get "/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for an ad-hoc query."
  [{:keys [zoom x y lat-field lon-field]} :- :api.tiles/route-params
   {:keys [query]} :- [:map
                       [:query ms/JSONString]]]
  (let [query         (json/decode+kw query)
        lat-field     (mbql.normalize/normalize (json/decode+kw lat-field))
        lon-field     (mbql.normalize/normalize (json/decode+kw lon-field))
        updated-query (tiles-query query zoom x y lat-field lon-field)
        result        (qp/process-query
                       (qp/userland-query updated-query {:executed-by api/*current-user-id*
                                                         :context     :map-tiles}))
        points        (result->points result lat-field lon-field)]
    (tiles-response result zoom points)))

(defn process-tiles-query-for-card
  "Generates a single tile image for a dashcard and returns a Ring response that contains the data as a PNG"
  [card-id parameters zoom x y lat-field-ref lon-field-ref]
  (let [lat-field-ref (mbql.normalize/normalize lat-field-ref)
        lon-field-ref (mbql.normalize/normalize lon-field-ref)
        result
        (qp.card/process-query-for-card
         card-id
         :api
         {:parameters parameters
          :context    :map-tiles
          :make-run   (constantly
                       (fn [query info]
                         (-> query
                             (update :info merge info)
                             (tiles-query zoom x y lat-field-ref lon-field-ref)
                             qp/userland-query
                             qp/process-query)))})
        points (result->points result lat-field-ref lon-field-ref)]
    (tiles-response result zoom points)))

(defn process-tiles-query-for-dashcard
  "Generates a single tile image for a dashcard and returns a Ring response that contains the data as a PNG"
  [dashboard-id dashcard-id card-id parameters zoom x y lat-field-ref lon-field-ref]
  (let [lat-field-ref (mbql.normalize/normalize lat-field-ref)
        lon-field-ref (mbql.normalize/normalize lon-field-ref)
        result
        (qp.dashboard/process-query-for-dashcard
         :dashboard-id  dashboard-id
         :dashcard-id   dashcard-id
         :card-id       card-id
         :export-format :api
         :parameters    parameters
         :context       :map-tiles
         :make-run      (constantly
                         (fn [query info]
                           (-> query
                               (update :info merge info)
                               (tiles-query zoom x y lat-field-ref lon-field-ref)
                               qp/userland-query
                               qp/process-query))))
        points (result->points result lat-field-ref lon-field-ref)]
    (tiles-response result zoom points)))

(api.macros/defendpoint :get "/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for a saved Card."
  [{:keys [card-id zoom x y lat-field lon-field]}
   :- [:merge
       :api.tiles/route-params
       [:map
        [:card-id ms/PositiveInt]]]
   {:keys [parameters]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]]]
  (let [parameters (json/decode+kw parameters)
        lat-field  (json/decode+kw lat-field)
        lon-field  (json/decode+kw lon-field)]
    (process-tiles-query-for-card card-id parameters zoom x y lat-field lon-field)))

(api.macros/defendpoint :get "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for a dashcard."
  [{:keys [dashboard-id dashcard-id card-id zoom x y lat-field lon-field]}
   :- [:merge
       :api.tiles/route-params
       [:map
        [:dashboard-id ms/PositiveInt]
        [:dashcard-id ms/PositiveInt]
        [:card-id   ms/PositiveInt]]]
   {:keys [parameters]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]]]
  (let [parameters (json/decode+kw parameters)
        lat-field  (json/decode+kw lat-field)
        lon-field  (json/decode+kw lon-field)]
    (process-tiles-query-for-dashcard dashboard-id dashcard-id card-id parameters zoom x y lat-field lon-field)))
