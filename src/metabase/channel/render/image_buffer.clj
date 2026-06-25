(ns metabase.channel.render.image-buffer
  "A small, thread-safe pool of reusable ARGB [[java.awt.image.BufferedImage]] buffers, held via
  [[java.lang.ref.SoftReference]] so the GC can reclaim idle ones under memory pressure."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.awt AlphaComposite)
   (java.awt.image BufferedImage)
   (java.lang.ref SoftReference)
   (java.util.concurrent ConcurrentHashMap)))

(set! *warn-on-reflection* true)

(defonce ^:private pool (ConcurrentHashMap.))

(mu/defn- cache-key :- [:tuple :int :int]
  "Pool key for a `w` x `h` buffer. `w`/`h` are coerced to `long` so the key is type-stable: `acquire` is called with
  longs but `release` reads ints off the image, and a Clojure vector key compares elements with Java `.equals`, where
  `(long 5)` != `(int 5)`."
  [w :- :int
   h :- :int]
  [(long w) (long h)])

(mu/defn- clear!
  "Reset every pixel of `img` to fully transparent so a reused buffer never shows the previous render's pixels."
  [img :- (ms/InstanceOfClass BufferedImage)]
  (let [g (.createGraphics ^BufferedImage img)]
    (try
      (.setComposite g (AlphaComposite/getInstance AlphaComposite/CLEAR))
      (.fillRect g 0 0 (.getWidth ^BufferedImage img) (.getHeight ^BufferedImage img))
      (finally
        (.dispose g)))))

(mu/defn acquire :- (ms/InstanceOfClass BufferedImage)
  "Return a cleared `TYPE_INT_ARGB` [[BufferedImage]] of exactly `w` x `h`, reusing the pooled buffer for that size if
  the GC hasn't reclaimed it. Pass the result to [[release]] when finished so it can be reused."
  [w :- :int
   h :- :int]
  ;; `remove` takes ownership: a concurrent render of the same size won't get the same buffer, it'll allocate its own.
  (let [ref (.remove ^ConcurrentHashMap pool (cache-key w h))
        img (some-> ^SoftReference ref .get)]
    (if img
      (do (clear! img) img)
      (BufferedImage. (int w) (int h) BufferedImage/TYPE_INT_ARGB))))

(mu/defn release
  "Return `img` to the pool so it can be reused, replacing any current idle buffer of its size. Safe to call with
  `nil`."
  [img :- [:maybe (ms/InstanceOfClass BufferedImage)]]
  (when img
    (.put ^ConcurrentHashMap pool
          (cache-key (.getWidth ^BufferedImage img) (.getHeight ^BufferedImage img))
          (SoftReference. img))))
