(ns metabase.pulse.render.sparkline
  (:require [java-time :as t]
            [metabase.pulse.render
             [common :as common]
             [image-bundle :as image-bundle]
             [style :as style]]
            [metabase.types :as types]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]]
            [schema.core :as s])
  (:import [java.awt BasicStroke Color RenderingHints]
           java.awt.image.BufferedImage
           java.io.ByteArrayOutputStream
           [java.time LocalDate LocalDateTime LocalTime OffsetTime]
           java.time.temporal.Temporal
           javax.imageio.ImageIO))

(def ^:private ^:const dot-radius 6)
(def ^:private ^:const thickness  3)
(def ^:private ^:const pad        8)
(def ^:private ^:const width      524)
(def ^:private ^:const height     524)

(defn- color-awt [^String color]
  (Color/decode color))

(defn- alpha-awt [^Color color, alpha]
  (Color. (.getRed color)
          (.getGreen color)
          (.getBlue color)
          (int (* alpha 255))))

(defn- render-sparkline-to-png
  "Takes two arrays of numbers between 0 and 1 and plots them as a sparkline"
  [xs ys]
  (with-open [os (ByteArrayOutputStream.)]
    (let [image (BufferedImage. (+ width (* 2 pad)) (+ height (* 2 pad)) BufferedImage/TYPE_INT_ARGB)
          xt    (map #(+ pad (* width %)) xs)
          yt    (map #(+ pad (- height (* height %))) ys)]
      (doto (.createGraphics image)
        (.setRenderingHints (RenderingHints. RenderingHints/KEY_ANTIALIASING RenderingHints/VALUE_ANTIALIAS_ON))
        (.setColor (alpha-awt (color-awt (style/primary-color)) 0.2))
        (.setStroke (BasicStroke. thickness BasicStroke/CAP_ROUND BasicStroke/JOIN_ROUND))
        (.drawPolyline (int-array (count xt) xt)
                       (int-array (count yt) yt)
                       (count xt))
        (.setColor (color-awt (style/primary-color)))
        (.fillOval (- (last xt) dot-radius)
                   (- (last yt) dot-radius)
                   (* 2 dot-radius)
                   (* 2 dot-radius))
        (.setColor Color/white)
        (.setStroke (BasicStroke. 2))
        (.drawOval (- (last xt) dot-radius)
                   (- (last yt) dot-radius)
                   (* 2 dot-radius)
                   (* 2 dot-radius)))
      ;; returns `true` if successful -- see JavaDoc
      (when-not (ImageIO/write image "png" os)
        (throw (Exception. (tru "No appropriate image writer found!"))))
      (.toByteArray os))))

(defn- format-val-fn [timezone-id cols x-axis-rowfn]
  (if (types/temporal-field? (x-axis-rowfn cols))
    (fn f [x]
      (cond
        (string? x)                 (f (u.date/parse x timezone-id))
        (instance? LocalDate x)     (f (t/local-date-time x (t/local-time 0)))
        (instance? LocalTime x)     (f (t/local-date-time (t/local-date "1970-01-01") x))
        (instance? LocalDateTime x) (f (t/offset-date-time x (t/zone-offset 0)))
        (instance? OffsetTime x)    (f (t/offset-date-time (t/local-date "1970-01-01") x (t/zone-offset x)))
        (instance? Temporal x)      (java-time/to-millis-from-epoch x)
        :else                       x))
    identity))

(defn sparkline-image-bundle
  "Render a sparkline chart to an image bundle."
  [render-type timezone-id card {:keys [rows cols] :as data}]
  ;; `x-axis-rowfn` and `y-axis-rowfn` are functions that get whatever is at the corresponding index
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        format-val     (format-val-fn timezone-id cols x-axis-rowfn)
        x-axis-values  (let [x-axis-values (map (comp format-val x-axis-rowfn) rows)
                             xmin          (apply min x-axis-values)
                             xmax          (apply max x-axis-values)
                             xrange        (- xmax xmin)]
                         (for [v x-axis-values]
                           (/ (double (- v xmin))
                              xrange)))
        ;; `(max 1 ...)` so we don't divide by zero
        ;; cast to double to avoid "Non-terminating decimal expansion" errors
        y-axis-values  (let [y-axis-values (map y-axis-rowfn rows)
                             ymin          (apply min y-axis-values)
                             ymax          (apply max y-axis-values)
                             yrange        (max 1 (- ymax ymin))]
                         (for [v y-axis-values]
                           (/ (double (- v ymin)) yrange)))]
    (image-bundle/make-image-bundle render-type (render-sparkline-to-png x-axis-values y-axis-values))))


(s/defn sparkline-rows
  "Get sorted rows from query results, with nils removed, appropriate for rendering as a sparkline."
  [timezone-id :- (s/maybe s/Str) card {:keys [rows cols], :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        format-val     (format-val-fn timezone-id cols x-axis-rowfn)]
    (common/non-nil-rows
     x-axis-rowfn
     y-axis-rowfn
     (if (> (format-val (x-axis-rowfn (first rows)))
            (format-val (x-axis-rowfn (last rows))))
       (reverse rows)
       rows))))
