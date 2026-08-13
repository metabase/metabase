(ns metabase.channel.render.image-buffer
  "Pools the oversized `int[]` pixel arrays that back the ARGB [[java.awt.image.BufferedImage]]s chart rasterization
  renders into. The arrays are humongous allocations under G1 (several MB each) and subscriptions render in bursts,
  so reusing a few fixed-size arrays keeps them from piling up faster than GC can reclaim them.

  One oversized `int[]` can back an image of any `w` x `h` whose `w*h` fits it, because `createPackedRaster`
  re-interprets the flat array at the new scanline stride, and wrapping it in a [[BufferedImage]] is ~1 us. The pool
  is the same dirigiste `Pool` the GraalVM static-viz contexts use, with the same semantics: 0-3 arrays, each held
  exclusively from [[acquire]] to [[release]], idle arrays dropped after ~10 minutes."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.util.pool :as u.pool])
  (:import
   (io.aleph.dirigiste Pool)
   (java.awt Point)
   (java.awt.image BufferedImage ColorModel DataBufferInt Raster WritableRaster)))

(set! *warn-on-reflection* true)

(def ^:private array-pixels
  "Size in pixels (= ints) of every pooled array: ~2x the largest common dashboard render (1200 wide x up to ~1350
  tall), so it also fits 2x-supersampled variants. ~13 MB at 4 bytes/pixel."
  (* 1200 2700))

;; Standard non-premultiplied sRGB ARGB color model (a cached singleton); anything else makes the BufferedImage ctor
;; run a per-pixel coerceData pass over the whole raster.
(def ^:private ^ColorModel rgb-default (ColorModel/getRGBdefault))

(def ^:private ^"[I" argb-masks (int-array [0x00ff0000 0x0000ff00 0x000000ff (unchecked-int 0xff000000)]))

(def ^:private pool-key ::arrays)

(def ^:private ^Pool array-pool
  (u.pool/create-pool #(int-array array-pixels) (fn [_array]) {:max-size 3, :idle-minutes 10}))

(defn- wrap-array
  "A `w` x `h` ARGB [[BufferedImage]] over the first `w*h` ints of `backing`."
  ^BufferedImage [^"[I" backing ^long w ^long h]
  (let [buffer                 (DataBufferInt. backing (int (* w h)))
        ^WritableRaster raster (Raster/createPackedRaster buffer (int w) (int h) (int w) argb-masks (Point. 0 0))]
    (BufferedImage. rgb-default raster false nil)))

(defn acquire
  "Return a cleared `w` x `h` ARGB [[BufferedImage]]. When `w*h` fits the pooled array size, the image wraps a pooled
  `int[]` -- blocking until one is available -- and must be handed back with [[release]]. Larger images are freshly
  allocated and not pooled. The image is shared mutable state and must not escape the rasterization; clearing the
  used region on acquire is load-bearing (Batik composites with `SrcOver`, so stale pixels would bleed a previous
  render through)."
  ^BufferedImage [^long w ^long h]
  (if (> (* w h) (long array-pixels))
    (do
      (analytics/inc! :metabase-notification/image-buffer-unpooled)
      (BufferedImage. (int w) (int h) BufferedImage/TYPE_INT_ARGB))
    (let [^"[I" backing (.acquire array-pool pool-key)]
      (analytics/inc! :metabase-notification/image-buffer-pooled)
      (java.util.Arrays/fill backing 0 (int (* w h)) (int 0))
      (wrap-array backing w h))))

(defn release
  "Return the pooled array backing `img` (an image from [[acquire]]) to the pool; unpooled oversized images are just
  dropped for GC to reclaim. Safe with `nil`."
  [^BufferedImage img]
  (when img
    (let [^"[I" backing (.getData ^DataBufferInt (.getDataBuffer (.getRaster img)))]
      (when (= (alength backing) (long array-pixels))
        (.release array-pool pool-key backing)))))
