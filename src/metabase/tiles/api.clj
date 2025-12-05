(ns metabase.tiles.api
  "`/api/tiles` endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   ;; TODO (Cam 10/10/25) -- update the tile API to use MBQL 5
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
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
(def ^:private ^:const pin-size-half         (/ pin-size 2))
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

(mu/defn- add-inside-filter :- ::lib.schema/query
  "Add an `INSIDE` filter to the given query to restrict results to a bounding box. The fields passed in can be either
  integer field ids or string field names. When a field name, the `base-type` will be set to `:type/Float`."
  [query     :- ::lib.schema/query
   lat-field :- ::lib.schema.metadata/column
   lon-field :- ::lib.schema.metadata/column
   x y zoom]
  (let [top-left      (x+y+zoom->lat-lon      x       y  zoom)
        bottom-right  (x+y+zoom->lat-lon (inc x) (inc y) zoom)
        inside-filter (lib/inside
                       lat-field
                       lon-field
                       (top-left :lat)
                       (top-left :lon)
                       (bottom-right :lat)
                       (bottom-right :lon))]
    (lib/filter query inside-filter)))

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
                          :y (mod (map-pixel :y) tile-size)}
              ;; cx/cy is needed to put center of a pin at the tile-pixel position
              cx   (- (tile-pixel :x) pin-size-half)
              cy   (- (tile-pixel :y) pin-size-half)]
          ;; now draw a "pin" at the given tile pixel location
          (.setColor graphics color-white)
          (.fillRect graphics cx cy pin-size pin-size)
          (.setColor graphics color-blue)
          (.fillRect graphics (inc cx) (inc cy) (- pin-size 2) (- pin-size 2))))
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

;;; ---------------------------------------------------- ENDPOINTS ----------------------------------------------------

;; TODO (Cam 9/30/25) -- we should update these endpoints to accept Field IDs and/or desired column aliases instead of
;; (or preferentially to) legacy refs
(mr/def ::legacy-ref
  "Form-encoded JSON-encoded legacy MBQL :field ref."
  [:schema
   {:decode/api (fn [field]
                  (when (string? field)
                    (let [deserialized (json/decode+kw field)]
                      (when (sequential? deserialized)
                        (mbql.normalize/normalize deserialized)))))}
   [:ref ::mbql.s/field]])

(mu/defn- resolve-field :- ::lib.schema.metadata/column
  [query      :- ::lib.schema/query
   legacy-ref :- ::legacy-ref]
  (lib/metadata query (lib/->pMBQL legacy-ref)))

(mu/defn- tiles-query :- ::lib.schema/query
  "Transform a card's query into a query finding coordinates in a particular region.

  - transform native queries into nested mbql queries from that native query
  - add [:inside lat lon bounding-region coordings] filter
  - limit query results to `tile-coordinate-limit` number of results
  - only select lat and lon fields rather than entire query's fields"
  [query                :- :map
   zoom
   x
   y
   lat-field-legacy-ref :- ::legacy-ref
   lon-field-legacy-ref :- ::legacy-ref]
  (let [query     (-> query
                      lib-be/normalize-query
                      lib/append-stage)
        lat-field (resolve-field query lat-field-legacy-ref)
        lon-field (resolve-field query lon-field-legacy-ref)]
    (-> query
        (add-inside-filter lat-field lon-field x y zoom)
        (lib/with-fields [lat-field lon-field])
        (lib/limit tile-coordinate-limit))))

(defn- result->points
  [{{:keys [rows cols]} :data, :as qp-response} lat-field-ref lon-field-ref]
  (when-not (= (:status qp-response) :completed)
    (throw (ex-info (format "Error running tiles query: %s" (:error qp-response))
                    (assoc qp-response :status-code 400))))
  (let [lat-id-or-name (second lat-field-ref)
        lon-id-or-name (second lon-field-ref)

        find-fn        (fn [id-or-name]
                         (or (first (keep-indexed
                                     (fn [idx col]
                                       (when (if (pos-int? id-or-name)
                                               (= (:id col) id-or-name)
                                               (= (:lib/deduplicated-name col) id-or-name))
                                         idx))
                                     cols))
                             (throw (ex-info (format "Failed to find matching column in query results for column %s" (pr-str id-or-name))
                                             {:id-or-name id-or-name, :cols cols, :status-code 500}))))
        lat-idx        (find-fn lat-id-or-name)
        lon-idx        (find-fn lon-id-or-name)]
    (for [row rows]
      [(nth row lat-idx) (nth row lon-idx)])))

;; TODO - this should be async and stream results from the QP instead of requiring them all to be in memory at the
;; same time
(defn- tiles-response
  [result zoom points]
  (if (= (:status result) :completed)
    {:status  200
     :headers {"Content-Type" "image/png"}
     :body    (tile->byte-array (create-tile zoom points))}
    (throw (ex-info (tru "Query failed")
                      ;; `result` might be a `core.async` channel or something we're not expecting
                    (assoc (when (map? result) result) :status-code 400)))))

(mr/def ::query
  "Form-encoded JSON-encoded MBQL query."
  [:schema
   {:decode/api (fn [s]
                  (when (string? s)
                    (let [deserialized (json/decode+kw s)]
                      (when (map? deserialized)
                        (lib-be/normalize-query deserialized)))))}
   [:ref ::lib.schema/query]])

;; These endpoints provides an image with the appropriate pins rendered given a MBQL `query` (passed as a GET query
;; string param). We evaluate the query and find the set of lat/lon pairs which are relevant and then render the
;; appropriate ones. It's expected that to render a full map view several calls will be made to this endpoint in
;; parallel.
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:zoom/:x/:y"
  "Generates a single tile image for an ad-hoc query."
  [{:keys [zoom x y]} :- [:map
                          [:zoom ms/Int]
                          [:x ms/Int]
                          [:y ms/Int]]
   {:keys     [query]
    lat-field :latField
    lon-field :lonField} :- [:map
                             [:query    ::query]
                             [:latField ::legacy-ref]
                             [:lonField ::legacy-ref]]]
  (let [updated-query (tiles-query query zoom x y lat-field lon-field)
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

(mr/def ::parameters
  "Form-encoded JSON-encoded array of parameter maps."
  [:schema
   {:decode/api (fn [s]
                  (when (string? s)
                    (json/decode+kw s)))}
   ::parameters.schema/parameters])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:card-id/:zoom/:x/:y"
  "Generates a single tile image for a saved Card."
  [{:keys [card-id zoom x y]}
   :- [:map
       [:card-id ::lib.schema.id/card]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters], lat-field :latField lon-field :lonField}
   :- [:map
       [:parameters {:optional true} ::parameters]
       [:latField ::legacy-ref]
       [:lonField ::legacy-ref]]]
  (process-tiles-query-for-card card-id parameters zoom x y lat-field lon-field))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
  "Generates a single tile image for a dashcard."
  [{:keys [dashboard-id dashcard-id card-id zoom x y], :as _route-params}
   :- [:map
       [:dashboard-id ::lib.schema.id/dashboard]
       [:dashcard-id ::lib.schema.id/dashcard]
       [:card-id ::lib.schema.id/card]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters] lat-field :latField, lon-field :lonField, :as _query-params}
   :- [:map
       [:parameters {:optional true} ::parameters]
       [:latField ::legacy-ref]
       [:lonField ::legacy-ref]]]
  (process-tiles-query-for-dashcard dashboard-id dashcard-id card-id parameters zoom x y lat-field lon-field))
