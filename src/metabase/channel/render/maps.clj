(ns metabase.channel.render.maps
  "Render static pin and grid maps (basemap tiles + drawn markers/cells) to PNG bytes, entirely on the JVM
  (Java2D), for use in email/Slack subscriptions. Unlike choropleth maps this bypasses the GraalJS
  static-viz bundle. The Web Mercator projection is shared with [[metabase.tiles.api]] (which already
  draws pin tiles for the live app); the new part is fetching + stitching the OSM basemap under the
  overlay."
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.web-mercator :as mercator])
  (:import
   (java.awt Color RenderingHints)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(def ^:private ^:const default-tile-url "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")

;; The teardrop pin used by the live app's "markers" pin type (app/assets/img/pin.png), 28x32 anchored at
;; its tip (15,24) — so the bottom point sits on the coordinate. Loaded once from the classpath.
(def ^:private ^:const pin-icon-anchor-x 15)
(def ^:private ^:const pin-icon-anchor-y 24)
(def ^:private pin-marker-icon
  (delay (some-> (io/resource "frontend_client/app/assets/img/pin.png") ImageIO/read)))

(def ^:private default-render-options
  "Defaults for the output-image `opts` accepted by [[render-pin-map]] and [[render-grid-map]], all in px.
  The output image is sized to the data's bounding box (+ `:padding` on each side) at the best integer
  zoom, clamped to the min/max bounds — so the data fills the frame rather than floating in a fixed,
  mostly-empty window. `:max-zoom` caps the auto-fit zoom so a single/tight cluster isn't street-level."
  {:max-width  1200
   :max-height 800
   :min-width  400
   :min-height 300
   :padding    48
   :max-zoom   14})

;;; ------------------------------------------------ projection ------------------------------------------------

(defn- world-px-bounds
  "Project `coords` (a seq of `[lat lon]`) to global pixel coordinates at `zoom` and return the bounding
  box of the result."
  [coords ^long zoom]
  (let [pxs (mapv (fn [[lat lon]] (mercator/latlon->world-px lat lon zoom)) coords)
        xs  (map first pxs)
        ys  (map second pxs)]
    {:min-x (double (apply min xs))
     :max-x (double (apply max xs))
     :min-y (double (apply min ys))
     :max-y (double (apply max ys))}))

(defn- choose-zoom
  "Largest integer zoom (<= `:max-zoom`) at which `coords`' bounding box (plus padding on both sides)
  still fits within the maximum output dimensions."
  [coords {:keys [max-width max-height padding max-zoom]}]
  (let [max-w (- max-width (* 2 padding))
        max-h (- max-height (* 2 padding))]
    (loop [z max-zoom]
      (if (<= z 1)
        1
        (let [{:keys [min-x max-x min-y max-y]} (world-px-bounds coords z)]
          (if (and (<= (- max-x min-x) max-w)
                   (<= (- max-y min-y) max-h))
            z
            (recur (dec z))))))))

;;; ------------------------------------------------ basemap tiles ------------------------------------------------

(defn- expand-tile-url [template ^long z ^long x ^long y]
  (-> template
      (str/replace "{s}" "a")
      (str/replace "{z}" (str z))
      (str/replace "{x}" (str x))
      (str/replace "{y}" (str y))))

(def ^:private tile-cache-ttl-ms
  "How long fetched basemap tiles stay cached. Tile contents change rarely; caching keeps repeated renders
  from hammering the tile server — important for OSM's usage policy."
  (u/hours->ms 1))

(def ^:private fetch-tile*
  ;; Throws on any failure (non-200, undecodable image) so that only successful fetches are cached —
  ;; otherwise a transient failure would leave a blank strip in every render until the TTL expires.
  (memoize/ttl
   (fn [template ^long z ^long x ^long y]
     (let [url  (expand-tile-url template z x y)
           resp (http/get url {:as                 :byte-array
                               :socket-timeout     5000
                               :connection-timeout 5000
                               :throw-exceptions   false
                               ;; OSM rejects requests without a valid User-Agent.
                               :headers            {"User-Agent" "Metabase static map renderer"}})]
       (when-not (= 200 (:status resp))
         (throw (ex-info (format "Tile fetch failed with status %d" (:status resp))
                         {:url url :status (:status resp)})))
       (or (ImageIO/read (ByteArrayInputStream. ^bytes (:body resp)))
           (throw (ex-info "Tile response is not a decodable image" {:url url})))))
   :ttl/threshold tile-cache-ttl-ms))

(defn- fetch-tile
  "Fetch one basemap tile, caching successes for [[tile-cache-ttl-ms]]. Returns nil on failure, so the
  render skips the tile rather than aborting; failures are logged and not cached."
  [template z x y]
  (try
    (fetch-tile* template z x y)
    (catch Throwable e
      (log/warn e "Failed to fetch map tile")
      nil)))

;;; ------------------------------------------------ color (HCL) ------------------------------------------------
;;; Grid maps colour cells on a linear green->red scale interpolated in HCL space, matching the live app
;;; (LeafletGridHeatMap uses d3.scaleLinear(...).interpolate(d3.interpolateHcl)). Hand-rolled because the
;;; JDK has no Lab/LCh support, and interpolating in sRGB instead diverges visibly (muddy brown mid-ramp).

(def ^:private grid-low-color  "success — low metric values" (Color. 0x3B 0x6B 0x3B))
(def ^:private grid-high-color "error — high metric values"  (Color. 0xDC 0x54 0x54))

(defn- srgb->linear ^double [^double c]
  (if (<= c 0.04045)
    (/ c 12.92)
    (Math/pow (/ (+ c 0.055) 1.055) 2.4)))

(defn- linear->srgb ^double [^double c]
  (if (<= c 0.0031308)
    (* c 12.92)
    (- (* 1.055 (Math/pow c (/ 1.0 2.4))) 0.055)))

;; The standard CIE Lab transfer function and its inverse.
(def ^:private ^:const lab-epsilon 0.008856)
(def ^:private ^:const lab-kappa   7.787)
(def ^:private ^:const lab-offset  (/ 16.0 116.0))

(defn- lab-f ^double [^double t]
  (if (> t lab-epsilon)
    (Math/cbrt t)
    (+ (* lab-kappa t) lab-offset)))

(defn- lab-f-inverse ^double [^double t]
  (let [t3 (* t t t)]
    (if (> t3 lab-epsilon)
      t3
      (/ (- t lab-offset) lab-kappa))))

(defn- color->lch [^Color c]
  (let [r  (srgb->linear (/ (.getRed c) 255.0))
        g  (srgb->linear (/ (.getGreen c) 255.0))
        b  (srgb->linear (/ (.getBlue c) 255.0))
        x  (/ (+ (* 0.4124 r) (* 0.3576 g) (* 0.1805 b)) 0.95047)
        y  (+ (* 0.2126 r) (* 0.7152 g) (* 0.0722 b))
        z  (/ (+ (* 0.0193 r) (* 0.1192 g) (* 0.9505 b)) 1.08883)
        fx (lab-f x)
        fy (lab-f y)
        fz (lab-f z)
        l  (- (* 116.0 fy) 16.0)
        a  (* 500.0 (- fx fy))
        bb (* 200.0 (- fy fz))]
    [l (Math/hypot a bb) (Math/toDegrees (Math/atan2 bb a))]))

(defn- channel-255
  "Clamp a 0-1 sRGB channel value and scale it to 0-255."
  ^long [^double v]
  (-> v (Math/max 0.0) (Math/min 1.0) (* 255.0) Math/round))

(defn- rgb-color ^Color [^double r ^double g ^double b]
  (Color. (int (channel-255 r)) (int (channel-255 g)) (int (channel-255 b))))

(defn- lch->color ^Color [[^double l ^double c ^double h]]
  (let [hr (Math/toRadians h)
        a  (* c (Math/cos hr))
        bb (* c (Math/sin hr))
        fy (/ (+ l 16.0) 116.0)
        fx (+ fy (/ a 500.0))
        fz (- fy (/ bb 200.0))
        x  (* 0.95047 (lab-f-inverse fx))
        y  (lab-f-inverse fy)
        z  (* 1.08883 (lab-f-inverse fz))
        r  (linear->srgb (+ (*  3.2406 x) (* -1.5372 y) (* -0.4986 z)))
        g  (linear->srgb (+ (* -0.9689 x) (*  1.8758 y) (*  0.0415 z)))
        b  (linear->srgb (+ (*  0.0557 x) (* -0.2040 y) (*  1.0570 z)))]
    (rgb-color r g b)))

(let [[l0 c0 h0] (color->lch grid-low-color)
      [l1 c1 h1] (color->lch grid-high-color)
      ;; interpolate hue along the shortest path
      dh         (let [d (- h1 h0)]
                   (cond
                     (> d 180)  (- d 360)
                     (< d -180) (+ d 360)
                     :else      d))]
  (defn- grid-color
    "Colour for a grid cell with metric value `m`, given the metric `mn`/`mx` range. Linear green->red in HCL."
    ^Color [^double m ^double mn ^double mx]
    (let [t (if (== mn mx)
              0.5
              (-> (/ (- m mn) (- mx mn))
                  (Math/max 0.0)
                  (Math/min 1.0)))]
      (lch->color [(+ l0 (* t (- l1 l0)))
                   (+ c0 (* t (- c1 c0)))
                   (+ h0 (* t dh))]))))

;;; ------------------------------------------------ render ------------------------------------------------

(defn- clamp
  "Clamp `v` between `lo` and `hi` and round to the nearest whole number."
  ^long [^double v ^double lo ^double hi]
  (-> v (Math/max lo) (Math/min hi) Math/round))

(defn- axis-window
  "Fit one axis of the output window to the data: given the data's projected extent `[lo hi]` along that
  axis, return `[size origin]` — the window size (data extent plus `padding` on both sides, clamped
  between `min-size` and `max-size`) and the world-px of the window's near edge, centering the data
  within the (possibly clamped) window."
  [lo hi min-size max-size padding]
  (let [size (clamp (+ (- hi lo) (* 2 padding)) min-size max-size)]
    [size (- (/ (+ lo hi) 2.0) (/ size 2.0))]))

(defn- do-render-map
  "Render a basemap covering the lat/lon extent of `coords` (a seq of `[lat lon]`), then call
  `(draw-fn graphics project)` to draw the overlay, where `project` is `(fn [lat lon] -> [px py])` in image
  space. Returns PNG `byte[]`, or nil if the render fails. `opts`: `:zoom` (override auto-fit), `:tile-url`
  (template), plus the output-sizing keys in [[default-render-options]]."
  [coords opts draw-fn]
  (let [{:keys [zoom tile-url min-width min-height
                max-width max-height padding] :as opts} (merge default-render-options opts)
        template (or tile-url default-tile-url)
        z        (or zoom (choose-zoom coords opts))
        {:keys [min-x max-x min-y max-y]} (world-px-bounds coords z)
        [w ox]   (axis-window min-x max-x min-width max-width padding)
        [h oy]   (axis-window min-y max-y min-height max-height padding)
        img      (BufferedImage. w h BufferedImage/TYPE_INT_RGB)
        g        (.createGraphics img)
        project  (fn [lat lon] (let [[wx wy] (mercator/latlon->world-px lat lon z)] [(- wx ox) (- wy oy)]))]
    (try
      (.setColor g Color/WHITE)
      (.fillRect g 0 0 w h)
      (.setRenderingHint g RenderingHints/KEY_ANTIALIASING RenderingHints/VALUE_ANTIALIAS_ON)
      ;; basemap: draw every tile overlapping the window at its pixel offset
      (let [tx0 (long (Math/floor (/ ox mercator/tile-size)))
            ty0 (long (Math/floor (/ oy mercator/tile-size)))
            tx1 (long (Math/floor (/ (+ ox w) mercator/tile-size)))
            ty1 (long (Math/floor (/ (+ oy h) mercator/tile-size)))]
        (doseq [tx    (range tx0 (inc tx1))
                ty    (range ty0 (inc ty1))
                :let  [^BufferedImage tile (fetch-tile template z tx ty)]
                :when tile]
          (.drawImage g tile (int (- (* tx mercator/tile-size) ox)) (int (- (* ty mercator/tile-size) oy)) nil)))
      (draw-fn g project)
      ;; attribution (OSM requires it)
      (.setColor g (Color. 90 90 90))
      (.drawString g "© OpenStreetMap contributors" (int (- w 210)) (int (- h 8)))
      (let [out (ByteArrayOutputStream.)]
        (ImageIO/write img "png" out)
        (.toByteArray out))
      ;; Return nil on failure so the caller can degrade to a table rather than email a blank/partial map.
      (catch Throwable e
        (log/warn e "Failed to render map")
        nil)
      (finally
        (.dispose g)))))

(defn- draw-dot [^java.awt.Graphics2D g ^double mx ^double my]
  (let [r 5]
    (.setColor g Color/WHITE)
    (.fillOval g (int (- mx r 1)) (int (- my r 1)) (+ (* 2 r) 2) (+ (* 2 r) 2))
    (.setColor g (Color. 76 157 230))
    (.fillOval g (int (- mx r)) (int (- my r)) (* 2 r) (* 2 r))))

(defn render-pin-map
  "Render `points` (a seq of `[lat lon]`) onto a basemap as a PNG `byte[]`. `opts` may include `:zoom`
  (override auto-fit), `:tile-url` (template, defaults to OSM), the output-sizing keys in
  [[default-render-options]], and `:pin-type` — `\"markers\"` (default) draws the teardrop pin icon like
  the live app; anything else (e.g. `\"tiles\"`, for dense data) draws a small dot. Returns nil if the
  render fails."
  [points & [{:keys [pin-type] :as opts}]]
  (do-render-map
   points opts
   (fn [^java.awt.Graphics2D g project]
     (let [icon  @pin-marker-icon
           dots? (or (= pin-type "tiles") (nil? icon))]
       (doseq [[lat lon] points
               :let      [[mx my] (project lat lon)]]
         (if dots?
           (draw-dot g (double mx) (double my))
           ;; place the pin so its tip (anchor) sits on the coordinate
           (.drawImage g ^BufferedImage icon
                       (int (- mx pin-icon-anchor-x)) (int (- my pin-icon-anchor-y)) nil)))))))

(defn- with-alpha
  "`color` with its alpha channel set to `alpha` (0-255)."
  ^Color [^Color color ^long alpha]
  (Color. (.getRed color) (.getGreen color) (.getBlue color) (int alpha)))

(defn render-grid-map
  "Render binned grid `cells` onto a basemap as a PNG `byte[]`. Each cell is a map with `:lat`/`:lon` (the
  cell's lower bound), `:lat-bin`/`:lon-bin` (bin widths in degrees), and `:metric` (value driving colour).
  Cells are coloured on a linear green->red HCL scale across the metric range. `opts` as for pin maps.
  Returns nil if the render fails."
  [cells & [opts]]
  (let [metrics (keep :metric cells)
        [mn mx] (if (seq metrics)
                  [(double (apply min metrics)) (double (apply max metrics))]
                  [0.0 0.0])
        ;; auto-fit to every cell corner so the whole grid is visible
        corners (mapcat (fn [{:keys [lat lon lat-bin lon-bin]}]
                          [[lat lon] [(+ lat lat-bin) (+ lon lon-bin)]])
                        cells)]
    (do-render-map
     corners opts
     (fn [^java.awt.Graphics2D g project]
       ;; north edge (lat+bin) is the top (smaller y); west edge (lon) is the left (smaller x)
       (doseq [{:keys [lat lon lat-bin lon-bin metric]} cells
               :let [[x0 y0] (project (+ lat lat-bin) lon)
                     [x1 y1] (project lat (+ lon lon-bin))
                     x       (int (Math/round (double (min x0 x1))))
                     y       (int (Math/round (double (min y0 y1))))
                     w       (max 1 (int (Math/round (Math/abs (- (double x1) (double x0))))))
                     h       (max 1 (int (Math/round (Math/abs (- (double y1) (double y0))))))]]
         ;; semi-transparent so the basemap shows through, like the live grid overlay
         (.setColor g (with-alpha (grid-color (double (or metric mn)) mn mx) 170))
         (.fillRect g x y w h))))))
