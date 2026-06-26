(ns metabase.channel.render.image-buffer
  "A small pool of reusable, fixed-size `int[]` pixel arrays that back the ARGB [[java.awt.image.BufferedImage]]s chart
  rasterization renders into, shared across all rendering threads.

  Why: rasterizing a chart (SVG via Batik) paints into a `width * height * 4` byte buffer -- 3-6 MB at dashboard
  sizes.  Under the default G1 GC any object over half a region (~1 MB at a 2 MB region) is \"humongous\": allocated
  into dedicated regions a young GC can't reclaim. Subscriptions render in bursts, so without reuse these pile up
  faster than mixed/full GCs reclaim the regions and the JVM OOMs on region exhaustion while most of the heap is free.

  What we reuse and why this shape: the only expensive, humongous part of a `BufferedImage` is its backing `int[]`.
  Constructing the wrapper objects (`DataBufferInt` + raster + the *cached* `ColorModel/getRGBdefault`) around an
  existing array is ~1 us (verified) -- and critically, one oversized `int[]` can back an image of ANY `w` x `h` whose
  `w*h` fits it, because `createPackedRaster` re-interprets the flat array at the new scanline stride. So we don't
  need a per-size cache: we pool a few `int[]`s of one fixed size big enough to cover the vast majority of renders,
  and on each [[acquire]] wrap a throwaway correctly-sized image around one. A render that needs *more* pixels than
  the fixed size just gets a fresh standard `BufferedImage` (the original behavior) -- a rare one-off, not pooled. We
  pool the arrays, not the images, to keep the minimum in memory.

  Reuse is safe because Batik PNG-encodes the buffer eagerly and returns only a `byte[]`; the image never escapes. The
  one load-bearing rule is clearing the used region on acquire (Batik composites with `SrcOver` and skips its
  background fill when the background is nil, so stale pixels would bleed a previous render through).

  Concurrency: the idle arrays live in a `ConcurrentLinkedDeque`, so every operation is lock-free and thread-safe on
  its own; there is no cross-operation invariant to protect. [[acquire]] never blocks and never refuses. Retention is
  bounded to `:max-arrays` idle arrays (a best-effort check on [[release]] -- occasionally keeping one extra under a
  race is harmless, it is only a retention cap). A daemon thread periodically clears idle arrays so memory drains to
  zero when rendering stops.

  Pools are plain maps built by [[->pool]]; the core fns take one. The no-arg arities target the process-wide
  [[default-pool]], which is built lazily on first use (so AOT compilation, which loads every namespace, doesn't
  allocate it or spawn its sweeper thread). Only the default pool has a sweeper; tests build isolated, sweeper-free
  pools with [[->pool]]."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.awt Point)
   (java.awt.image BufferedImage ColorModel DataBufferInt Raster WritableRaster)
   (java.util.concurrent ConcurrentLinkedDeque Executors ScheduledExecutorService ThreadFactory TimeUnit)
   (java.util.concurrent.atomic LongAdder)))

(set! *warn-on-reflection* true)

(def ^:private default-array-pixels
  "Fixed size (in pixels = ints) of every pooled array. ~2x the size that covers the vast majority of dashboard renders
  (1200 wide x up to ~1350 tall ~= 1.6M px), so it also fits 2x-supersampled variants. A render needing more pixels
  falls back to a fresh standard image. At 4 bytes/pixel a pooled array is ~13 MB."
  (* 1200 2700))

(def ^:private default-max-arrays
  "Max idle pooled arrays retained. Bounded by render concurrency (a few Jetty/notification threads), not request rate."
  6)

(def ^:private default-idle-ttl-ms
  "How often the daemon drops idle arrays; if nothing was rendered in the interval, the pool drains to zero."
  60000)

;; Standard non-premultiplied sRGB ARGB color model -- a cached singleton. Using this (rather than constructing a
;; DirectColorModel) keeps wrapping cheap: a premultiplied/mismatched color model makes the BufferedImage ctor run a
;; full-raster per-pixel `coerceData` conversion (~7 ms), whereas getRGBdefault matches the raster (no-op).
(def ^:private ^ColorModel rgb-default (ColorModel/getRGBdefault))
(def ^:private ^"[I" argb-masks (int-array [0x00ff0000 0x0000ff00 0x000000ff (unchecked-int 0xff000000)]))

(declare default-pool)

(defn ->pool
  "Construct a fresh, independent pool: a plain map of its idle-array store, counters, and config. With no args uses
  production sizing. Tests pass their own to isolate from the [[default-pool]] (and get no sweeper).

  `:idle` is a `ConcurrentLinkedDeque` of idle `int[]`, each of length `:array-pixels`. `:hits`/`:misses`/`:one-offs`
  are counters (a \"one-off\" is a render too large for the fixed array, handed a fresh standard image)."
  ([] (->pool {}))
  ([{:keys [array-pixels max-arrays idle-ttl-ms]
     :or   {array-pixels default-array-pixels max-arrays default-max-arrays idle-ttl-ms default-idle-ttl-ms}}]
   {:idle         (ConcurrentLinkedDeque.)
    :hits         (LongAdder.)
    :misses       (LongAdder.)
    :one-offs     (LongAdder.)
    :last-logged  (atom {:hits 0 :misses 0})
    :array-pixels array-pixels
    :max-arrays   max-arrays
    :idle-ttl-ms  idle-ttl-ms}))

(defn- wrap-array
  "Wrap an existing `int[]` (length >= w*h) as a `w` x `h` ARGB [[BufferedImage]]. Throwaway wrapper (~1 us); only
  `backing` carries the humongous cost."
  ^BufferedImage [^"[I" backing ^long w ^long h]
  (let [db (DataBufferInt. backing (int (* w h)))
        ^WritableRaster raster (Raster/createPackedRaster db (int w) (int h) (int w) argb-masks (Point. 0 0))]
    (BufferedImage. rgb-default raster false nil)))

(defn- cleared-array
  "An `int[]` of `array-pixels` length with its first `need` ints zeroed (the region this render will use). Reuses one
  from `idle` if available (a hit), else allocates (a miss). Clearing is load-bearing -- see ns docstring."
  ^"[I" [pool ^long need]
  (let [^"[I" backing (if-let [^"[I" reused (.pollFirst ^ConcurrentLinkedDeque (:idle pool))]
                        (do (.increment ^LongAdder (:hits pool)) reused)
                        (do (.increment ^LongAdder (:misses pool)) (int-array (long (:array-pixels pool)))))]
    (java.util.Arrays/fill backing 0 (int need) (int 0))
    backing))

(defn acquire
  "Return a cleared `w` x `h` ARGB [[BufferedImage]]. If `w*h` fits the pool's fixed array size, reuses a pooled `int[]`
  (or allocates a fixed-size one if none is idle); otherwise returns a fresh standard `BufferedImage` (a one-off, not
  pooled). NEVER blocks or refuses. With no pool arg, uses the [[default-pool]].

  Pass the result to [[release]] when done. The image is shared mutable state -- it must not escape the rasterization
  (Batik PNG-encodes it before returning, which is what makes reuse safe)."
  (^BufferedImage [w h] (acquire (default-pool) w h))
  (^BufferedImage [pool ^long w ^long h]
   (if (> (* w h) (long (:array-pixels pool)))
     (do (.increment ^LongAdder (:one-offs pool))                 ; too large: fresh standard image, not pooled
         (BufferedImage. (int w) (int h) BufferedImage/TYPE_INT_ARGB))
     (wrap-array (cleared-array pool (* w h)) w h))))

(defn- backing-of
  "The backing `int[]` of an image produced by [[acquire]]."
  ^"[I" [^BufferedImage img]
  (.getData ^DataBufferInt (.getDataBuffer (.getRaster img))))

(defn release
  "Return `img`'s backing array to `pool` for reuse, unless the pool already holds `:max-arrays` idle arrays, or the
  array is a one-off (a different size than the pooled arrays) -- in either case it is simply dropped (GC reclaims it).
  Safe with `nil`; never throws. With no pool arg, uses the [[default-pool]]."
  ([img] (release (default-pool) img))
  ([pool img]
   (when img
     (let [^"[I" backing (backing-of img)
           ^ConcurrentLinkedDeque idle (:idle pool)]
       (when (and (= (alength backing) (long (:array-pixels pool)))
                  (< (.size idle) (long (:max-arrays pool))))
         (.addFirst idle backing))))))

(defn stats
  "Snapshot of a pool's counters `{:hits n :misses n :one-offs n :idle n}`. With no arg, the [[default-pool]]."
  ([] (stats (default-pool)))
  ([pool]
   {:hits     (.sum ^LongAdder (:hits pool))
    :misses   (.sum ^LongAdder (:misses pool))
    :one-offs (.sum ^LongAdder (:one-offs pool))
    :idle     (.size ^ConcurrentLinkedDeque (:idle pool))}))

(defn sweep!
  "Drop the pool's idle arrays so memory is reclaimed when rendering stops. The daemon calls this periodically: if
  rendering is active, acquire/release repopulate within microseconds; if idle, the pool stays empty. With no arg, the
  [[default-pool]]."
  ([] (sweep! (default-pool)))
  ([pool] (.clear ^ConcurrentLinkedDeque (:idle pool))))

;; --- stats logging (cumulative + interval; periodic, NOT per-send -- a per-send rate is dominated by cold-start) ---

(defn- rate-str [hits misses one-offs]
  (let [total (+ hits misses)]
    (format "%d/%d hits (%.1f%%), %d allocs, %d one-offs"
            hits total (if (pos? total) (* 100.0 (/ hits (double total))) 0.0) misses one-offs)))

(defn log-stats!
  "Log `pool` reuse: the hit rate since this pool's previous call and the cumulative rate, plus idle/one-off counts.
  No-op for the interval line when nothing was rendered since the last call. With no arg, the [[default-pool]]."
  ([] (log-stats! (default-pool)))
  ([pool]
   (let [now  (stats pool)
         prev @(:last-logged pool)
         dh   (- (:hits now) (:hits prev))
         dm   (- (:misses now) (:misses prev))]
     (reset! (:last-logged pool) {:hits (:hits now) :misses (:misses now)})
     (when (pos? (+ dh dm))
       (log/infof "Image buffer reuse (interval): %s; (lifetime): %s; idle arrays: %d"
                  (rate-str dh dm 0)
                  (rate-str (:hits now) (:misses now) (:one-offs now))
                  (:idle now))))))

;; --- the default pool, built lazily on first use, with its one sweeper daemon ------------------------------------

(defn- start-sweeper!
  "Start the daemon that every `:idle-ttl-ms` sweeps `pool` and logs reuse, so the pool drains to zero when rendering
  stops. No Quartz needed -- a process-local timer on a daemon thread (so it never blocks shutdown)."
  [pool]
  (let [exec (Executors/newScheduledThreadPool
              1 (reify ThreadFactory
                  (newThread [_ r]
                    (doto (Thread. ^Runnable r "image-buffer-maintenance") (.setDaemon true)))))]
    (.scheduleWithFixedDelay ^ScheduledExecutorService exec
                             (fn [] (try (sweep! pool) (log-stats! pool)
                                         (catch Throwable e (log/warn e "Error in image-buffer maintenance"))))
                             (long (:idle-ttl-ms pool)) (long (:idle-ttl-ms pool)) TimeUnit/MILLISECONDS)))

;; A delay so nothing runs at namespace load (AOT-safe). Realized exactly once on first use, which is also when -- and
;; the only place where -- the single sweeper daemon is started.
(defonce ^:private the-pool
  (delay (doto (->pool) start-sweeper!)))

(defn- default-pool
  "THE process-wide pool, built (and its sweeper started) on first call."
  []
  @the-pool)
