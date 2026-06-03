(ns metabase.channel.render.maps
  "Proof-of-concept: render a static pin map (basemap tiles + drawn markers) to PNG bytes, entirely on the
  JVM (Java2D), for use in email/Slack subscriptions. Unlike choropleth maps this bypasses the GraalJS
  static-viz bundle. The Web Mercator projection here mirrors [[metabase.tiles.api]] (which already draws
  pin tiles for the live app); the new part is fetching + stitching the OSM basemap under the pins."
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.log :as log])
  (:import
   (java.awt Color RenderingHints)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(def ^:private ^:const tile-size 256)
(def ^:private ^:const default-tile-url "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")

;; The teardrop pin used by the live app's "markers" pin type (app/assets/img/pin.png), 28x32 anchored at
;; its tip (15,24) — so the bottom point sits on the coordinate. Loaded once from the classpath.
(def ^:private ^:const pin-icon-anchor-x 15)
(def ^:private ^:const pin-icon-anchor-y 24)
(def ^:private pin-marker-icon
  (delay (some-> (io/resource "frontend_client/app/assets/img/pin.png") ImageIO/read)))

;; The output image is sized to the data's bounding box (+ padding) at the best integer zoom, clamped to
;; these bounds — so the data fills the frame rather than floating in a fixed, mostly-empty window.
(def ^:dynamic *map-max-width* "Maximum output PNG width in px." 1200)
(def ^:dynamic *map-max-height* "Maximum output PNG height in px." 800)
(def ^:dynamic *map-min-width* "Minimum output PNG width in px." 400)
(def ^:dynamic *map-min-height* "Minimum output PNG height in px." 300)
(def ^:dynamic *map-padding* "Margin in px between the data and the image edge." 48)
(def ^:dynamic *map-max-zoom* "Cap on auto-fit zoom, so a single/tight cluster isn't street-level." 14)

;;; ------------------------------------------------ projection ------------------------------------------------

(defn- latlon->world-px
  "Web Mercator: project lat/lon to global pixel coordinates (origin top-left) at `zoom`. Matches the math
  in [[metabase.tiles.api]]."
  [^double lat ^double lon ^long zoom]
  (let [world   (double (* tile-size (bit-shift-left 1 zoom)))
        x       (* world (/ (+ lon 180.0) 360.0))
        sin-lat (-> (Math/sin (Math/toRadians lat)) (Math/max -0.9999) (Math/min 0.9999))
        y       (* world (- 0.5 (/ (Math/log (/ (+ 1.0 sin-lat) (- 1.0 sin-lat))) (* 4.0 Math/PI))))]
    [x y]))

(defn- choose-zoom
  "Largest integer zoom (<= *map-max-zoom*) at which `coords`' bounding box (plus padding on both sides)
  still fits within the maximum output dimensions."
  [coords]
  (let [max-w (- *map-max-width* (* 2 *map-padding*))
        max-h (- *map-max-height* (* 2 *map-padding*))]
    (loop [z *map-max-zoom*]
      (if (<= z 1)
        1
        (let [pxs (mapv (fn [[lat lon]] (latlon->world-px lat lon z)) coords)
              xs  (map first pxs)
              ys  (map second pxs)
              w   (- (double (apply max xs)) (double (apply min xs)))
              h   (- (double (apply max ys)) (double (apply min ys)))]
          (if (and (<= w max-w) (<= h max-h))
            z
            (recur (dec z))))))))

;;; ------------------------------------------------ basemap tiles ------------------------------------------------

(defn- expand-tile-url [template ^long z ^long x ^long y]
  (-> template
      (str/replace "{s}" "a")
      (str/replace "{z}" (str z))
      (str/replace "{x}" (str x))
      (str/replace "{y}" (str y))))

(def ^:private fetch-tile
  ;; Cache fetched basemap tiles with a short TTL (tile contents change rarely; this keeps repeated renders
  ;; from hammering the tile server — important for OSM's usage policy).
  (memoize/ttl
   (fn [template ^long z ^long x ^long y]
     (let [url  (expand-tile-url template z x y)
           resp (http/get url {:as                 :byte-array
                               :socket-timeout     5000
                               :connection-timeout 5000
                               :throw-exceptions   false
                               ;; OSM rejects requests without a valid User-Agent.
                               :headers            {"User-Agent" "Metabase static map renderer"}})]
       (when (= 200 (:status resp))
         (ImageIO/read (ByteArrayInputStream. ^bytes (:body resp))))))
   :ttl/threshold (* 60 60 1000)))

;;; ------------------------------------------------ color (HCL) ------------------------------------------------
;;; Grid maps colour cells on a linear green->red scale interpolated in HCL space, matching the live app
;;; (LeafletGridHeatMap uses d3.scaleLinear(...).interpolate(d3.interpolateHcl)).

(def ^:private grid-low-color  "success — low metric values" (Color. 0x3B 0x6B 0x3B))
(def ^:private grid-high-color "error — high metric values"  (Color. 0xDC 0x54 0x54))

(defn- srgb->linear ^double [^double c]
  (if (<= c 0.04045) (/ c 12.92) (Math/pow (/ (+ c 0.055) 1.055) 2.4)))

(defn- linear->srgb ^double [^double c]
  (if (<= c 0.0031308) (* c 12.92) (- (* 1.055 (Math/pow c (/ 1.0 2.4))) 0.055)))

(defn- color->lch [^Color c]
  (let [r  (srgb->linear (/ (.getRed c) 255.0))
        g  (srgb->linear (/ (.getGreen c) 255.0))
        b  (srgb->linear (/ (.getBlue c) 255.0))
        x  (/ (+ (* 0.4124 r) (* 0.3576 g) (* 0.1805 b)) 0.95047)
        y  (+ (* 0.2126 r) (* 0.7152 g) (* 0.0722 b))
        z  (/ (+ (* 0.0193 r) (* 0.1192 g) (* 0.9505 b)) 1.08883)
        f  (fn ^double [^double t] (if (> t 0.008856) (Math/cbrt t) (+ (* 7.787 t) (/ 16.0 116.0))))
        fx (f x) fy (f y) fz (f z)
        l  (- (* 116.0 fy) 16.0)
        a  (* 500.0 (- fx fy))
        bb (* 200.0 (- fy fz))]
    [l (Math/hypot a bb) (Math/toDegrees (Math/atan2 bb a))]))

(defn- lch->color ^Color [[^double l ^double c ^double h]]
  (let [hr (Math/toRadians h)
        a  (* c (Math/cos hr))
        bb (* c (Math/sin hr))
        fy (/ (+ l 16.0) 116.0)
        fx (+ fy (/ a 500.0))
        fz (- fy (/ bb 200.0))
        g  (fn ^double [^double t] (let [t3 (* t t t)] (if (> t3 0.008856) t3 (/ (- t (/ 16.0 116.0)) 7.787))))
        x  (* 0.95047 (g fx))
        y  (g fy)
        z  (* 1.08883 (g fz))
        r  (linear->srgb (+ (* 3.2406 x) (* -1.5372 y) (* -0.4986 z)))
        gr (linear->srgb (+ (* -0.9689 x) (* 1.8758 y) (* 0.0415 z)))
        b  (linear->srgb (+ (* 0.0557 x) (* -0.2040 y) (* 1.0570 z)))
        clamp (fn ^long [^double v] (long (Math/round (* 255.0 (-> v (Math/max 0.0) (Math/min 1.0))))))]
    (Color. (clamp r) (clamp gr) (clamp b))))

(let [[l0 c0 h0] (color->lch grid-low-color)
      [l1 c1 h1] (color->lch grid-high-color)
      ;; interpolate hue along the shortest path
      dh (let [d (- h1 h0)] (cond (> d 180) (- d 360) (< d -180) (+ d 360) :else d))]
  (defn- grid-color
    "Colour for a grid cell with metric value `m`, given the metric `mn`/`mx` range. Linear green->red in HCL."
    ^Color [^double m ^double mn ^double mx]
    (let [t (if (== mn mx) 0.5 (-> (/ (- m mn) (- mx mn)) (Math/max 0.0) (Math/min 1.0)))]
      (lch->color [(+ l0 (* t (- l1 l0))) (+ c0 (* t (- c1 c0))) (+ h0 (* t dh))]))))

;;; ------------------------------------------------ render ------------------------------------------------

(defn- do-render-map
  "Render a basemap covering the lat/lon extent of `coords` (a seq of `[lat lon]`), then call
  `(draw-fn graphics project)` to draw the overlay, where `project` is `(fn [lat lon] -> [px py])` in image
  space. Returns PNG `byte[]`. `opts`: `:zoom` (override auto-fit), `:tile-url` (template)."
  ^bytes [coords {:keys [zoom tile-url]} draw-fn]
  (let [template (or tile-url default-tile-url)
        z        (or zoom (choose-zoom coords))
        pxs      (mapv (fn [[lat lon]] (latlon->world-px lat lon z)) coords)
        xs       (map first pxs)
        ys       (map second pxs)
        min-x    (double (apply min xs))
        max-x    (double (apply max xs))
        min-y    (double (apply min ys))
        max-y    (double (apply max ys))
        ;; size the image to the data's bounding box + padding (clamped), so the data fills the frame
        clamp    (fn ^long [v lo hi] (long (Math/round ^double (-> (double v) (Math/max (double lo)) (Math/min (double hi))))))
        w        (clamp (+ (- max-x min-x) (* 2 *map-padding*)) *map-min-width* *map-max-width*)
        h        (clamp (+ (- max-y min-y) (* 2 *map-padding*)) *map-min-height* *map-max-height*)
        ;; center the data's bounding box within the (possibly clamped) window
        ox       (- (/ (+ min-x max-x) 2.0) (/ w 2.0))   ; world-px of the window's top-left corner
        oy       (- (/ (+ min-y max-y) 2.0) (/ h 2.0))
        img      (BufferedImage. w h BufferedImage/TYPE_INT_RGB)
        g        (.createGraphics img)
        project  (fn [lat lon] (let [[wx wy] (latlon->world-px lat lon z)] [(- wx ox) (- wy oy)]))]
    (try
      (.setColor g Color/WHITE)
      (.fillRect g 0 0 w h)
      (.setRenderingHint g RenderingHints/KEY_ANTIALIASING RenderingHints/VALUE_ANTIALIAS_ON)
      ;; basemap: draw every tile overlapping the window at its pixel offset
      (let [tx0 (long (Math/floor (/ ox tile-size)))
            ty0 (long (Math/floor (/ oy tile-size)))
            tx1 (long (Math/floor (/ (+ ox w) tile-size)))
            ty1 (long (Math/floor (/ (+ oy h) tile-size)))]
        (doseq [tx (range tx0 (inc tx1))
                ty (range ty0 (inc ty1))]
          (when-let [^BufferedImage tile (fetch-tile template z tx ty)]
            (.drawImage g tile (int (- (* tx tile-size) ox)) (int (- (* ty tile-size) oy)) nil))))
      (draw-fn g project)
      ;; attribution (OSM requires it)
      (.setColor g (Color. 90 90 90))
      (.drawString g "© OpenStreetMap contributors" (int (- w 210)) (int (- h 8)))
      (catch Throwable e
        (log/warn e "Failed to render map"))
      (finally
        (.dispose g)))
    (let [out (ByteArrayOutputStream.)]
      (ImageIO/write img "png" out)
      (.toByteArray out))))

(defn- draw-dot [^java.awt.Graphics2D g ^double mx ^double my]
  (let [r 5]
    (.setColor g Color/WHITE)
    (.fillOval g (int (- mx r 1)) (int (- my r 1)) (+ (* 2 r) 2) (+ (* 2 r) 2))
    (.setColor g (Color. 76 157 230))
    (.fillOval g (int (- mx r)) (int (- my r)) (* 2 r) (* 2 r))))

(defn render-pin-map
  "Render `points` (a seq of `[lat lon]`) onto a basemap as a PNG `byte[]`. `opts` may include `:zoom`
  (override auto-fit), `:tile-url` (template, defaults to OSM), and `:pin-type` — `\"markers\"` (default)
  draws the teardrop pin icon like the live app; anything else (e.g. `\"tiles\"`, for dense data) draws a
  small dot."
  ^bytes [points & [{:keys [pin-type] :as opts}]]
  (do-render-map
   points opts
   (fn [^java.awt.Graphics2D g project]
     (let [icon  @pin-marker-icon
           dots? (or (= pin-type "tiles") (nil? icon))]
       (doseq [[lat lon] points]
         (let [[mx my] (project lat lon)]
           (if dots?
             (draw-dot g (double mx) (double my))
             ;; place the pin so its tip (anchor) sits on the coordinate
             (.drawImage g ^BufferedImage icon
                         (int (- mx pin-icon-anchor-x)) (int (- my pin-icon-anchor-y)) nil))))))))

(defn render-grid-map
  "Render binned grid `cells` onto a basemap as a PNG `byte[]`. Each cell is a map with `:lat`/`:lon` (the
  cell's lower bound), `:lat-bin`/`:lon-bin` (bin widths in degrees), and `:metric` (value driving colour).
  Cells are coloured on a linear green->red HCL scale across the metric range. `opts` as for pin maps."
  ^bytes [cells & [opts]]
  (let [metrics (keep :metric cells)
        mn      (double (if (seq metrics) (apply min metrics) 0.0))
        mx      (double (if (seq metrics) (apply max metrics) 0.0))
        ;; auto-fit to every cell corner so the whole grid is visible
        corners (mapcat (fn [{:keys [lat lon lat-bin lon-bin]}]
                          [[lat lon] [(+ lat lat-bin) (+ lon lon-bin)]])
                        cells)]
    (do-render-map
     corners opts
     (fn [^java.awt.Graphics2D g project]
       (doseq [{:keys [lat lon lat-bin lon-bin metric]} cells]
         ;; north edge (lat+bin) is the top (smaller y); west edge (lon) is the left (smaller x)
         (let [[x0 y0] (project (+ lat lat-bin) lon)
               [x1 y1] (project lat (+ lon lon-bin))
               x       (int (Math/round (double (min x0 x1))))
               y       (int (Math/round (double (min y0 y1))))
               w       (max 1 (int (Math/round (Math/abs (- (double x1) (double x0))))))
               h       (max 1 (int (Math/round (Math/abs (- (double y1) (double y0))))))
               c       (grid-color (double (or metric mn)) mn mx)]
           ;; semi-transparent so the basemap shows through, like the live grid overlay
           (.setColor g (Color. (.getRed c) (.getGreen c) (.getBlue c) 170))
           (.fillRect g x y w h)))))))
