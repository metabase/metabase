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
   (java.util.concurrent ConcurrentHashMap ConcurrentLinkedQueue)
   (java.util.function Function)))

(set! *warn-on-reflection* true)

;; [width height] -> ConcurrentLinkedQueue<SoftReference<BufferedImage>>: any number of idle buffers per size.
(defonce ^:private pool (ConcurrentHashMap.))

(def ^:private new-queue
  (reify Function (apply [_ _] (ConcurrentLinkedQueue.))))

(mu/defn- queue-for :- (ms/InstanceOfClass ConcurrentLinkedQueue)
  "The queue of idle buffers for `w` x `h`, creating it on first use.

  `w`/`h` are coerced to `long` so the key is type-stable: `acquire` is called with longs but `release` reads ints
  off the image, and a Clojure vector key compares elements with Java `.equals`, where `(.equals (long 5) (int 5))`
  is false."
  [w :- :int
   h :- :int]
  (.computeIfAbsent ^ConcurrentHashMap pool [(long w) (long h)] new-queue))

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
  "Return a cleared `TYPE_INT_ARGB` [[BufferedImage]] of exactly `w` x `h`, reusing an idle pooled buffer of that size
  when one is available. Pass the result to [[release]] when finished so it can be reused.

  Polls soft refs until it finds one whose buffer the GC hasn't reclaimed, discarding the cleared ones."
  [w :- :int
   h :- :int]
  (let [q   (queue-for w h)
        img (loop []
              (when-let [ref (.poll ^ConcurrentLinkedQueue q)]
                (or (.get ^SoftReference ref) (recur))))]
    (if img
      (do (clear! img) img)
      (BufferedImage. (int w) (int h) BufferedImage/TYPE_INT_ARGB))))

(mu/defn release
  "Return `img` to the pool so it can be reused."
  [img :- (ms/InstanceOfClass BufferedImage)]
  (.offer ^ConcurrentLinkedQueue (queue-for (.getWidth ^BufferedImage img) (.getHeight ^BufferedImage img))
          (SoftReference. img)))
