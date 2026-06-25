(ns metabase.channel.render.image-buffer
  "A process-wide, size-keyed recycler of ARGB [[java.awt.image.BufferedImage]] buffers, shared across all rendering
  threads and both rasterizing render paths.

  This exists to cut *allocation pressure*, NOT to constrain a scarce resource. The job is to avoid the churn of
  allocating-and-discarding a multi-MB buffer on every render by handing back a recently-returned one of the same size.
  It is therefore an OVERFLOWING recycler, not a bounded resource pool: [[acquire]] never blocks and never refuses --
  an empty pool always allocates a fresh buffer, so there is no limit on how many buffers are live at once. (The
  genuinely scarce resource here, the static-viz JS engines, is already constrained by its own bounded pool upstream;
  buffers are cheap to allocate, so blocking a render to wait for one would be a pure throughput regression.)

  The caps below govern RETENTION only: on check-in ([[release]]) idle buffers are kept up to `:per-size-cap` per size
  and `:global-cap` total, and any surplus is simply dropped (GC reclaims it). So the caps bound *resident idle
  memory*, not concurrency. A daemon thread additionally evicts buffers idle past `:idle-ttl-ms`, walking each size's
  deque from its oldest end until it reaches a still-fresh entry, so the recycler drains to zero when rendering stops
  and holds memory only while actively rendering.

  Why this and not the alternatives: a *chart* (SVG/Batik, [[metabase.channel.render.js.svg/render-svg]]) or *table*
  (HTML/CSSBox, [[metabase.channel.render.png/render-html-to-png]]) rasterizes into a `width * height * 4` byte buffer
  -- 3-6 MB at dashboard sizes. Under the default G1 GC any object over half a region (~1 MB at a 2 MB region) is
  \"humongous\": allocated into dedicated regions a young GC can't reclaim. Subscriptions render in bursts, so without
  recycling these pile up faster than mixed/full GCs reclaim the regions and the JVM OOMs on region exhaustion while
  most of the heap is free. We hold STRONG references (not SoftReference, which clears only at the OOM edge -- that
  would relocate the pressure, not remove it) and evict explicitly, so memory tracks activity. Instrumentation of real
  email and Slack sends showed renders fan across many Jetty threads (so the recycler must be *shared*, not
  thread-local, or it stays cold) and only a handful of distinct sizes recur (~6 retained per size reaches ~60% reuse).

  Reuse is safe because both rasterizers PNG-encode the buffer eagerly and synchronously and return only a `byte[]`;
  the `BufferedImage` never escapes, so a reused buffer cannot corrupt already-returned bytes. The one load-bearing
  rule is [[clear!]]-on-acquire (Batik composites with `SrcOver` and skips its background fill when the background is
  nil, so stale pixels would bleed through).

  A pool is just a plain map built by [[->pool]] (its own buffer map, its own counters, its own config); the core
  functions take one as their first argument. Prod uses the [[default-pool]] via the no-pool arities; it is built (and
  its sweeper started) lazily on first use, not at namespace load, so AOT compilation doesn't spawn the daemon. Tests
  construct an isolated pool with [[->pool]] so they can assert on its counters/contents without the singleton's
  residue or its background sweeper."
  (:require
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.awt.image BufferedImage DataBufferInt)
   (java.util ArrayDeque Deque)
   (java.util.concurrent ConcurrentHashMap Executors ScheduledExecutorService ThreadFactory TimeUnit)
   (java.util.concurrent.atomic LongAdder)
   (java.util.function Function)))

(set! *warn-on-reflection* true)

(def ^:private default-per-size-cap
  "Retention limit: max idle buffers KEPT per distinct size on check-in (not a limit on live/checked-out buffers --
  acquire never refuses). ~6 is the knee of the measured hit-rate curve (4-8); past it adds little reuse for more
  resident memory."
  6)

(def ^:private default-global-cap
  "Retention limit: max idle buffers kept across all sizes -- a backstop so an unusual spread of sizes can't grow
  resident idle memory without bound. Again a retention cap, not an admission/concurrency cap."
  24)

(def ^:private default-idle-ttl-ms
  "Buffers not reused within this long are dropped by [[sweep!]] so the recycler drains to zero on an idle instance."
  60000)

(defn ->pool
  "Construct a fresh, independent pool: a plain map of its own buffer store, counters, and config. With no args uses the
  production caps/TTL. Tests pass their own to isolate from the [[default-pool]] (a constructed pool shares no state
  with it and has no background sweeper attached).

  Shape: `:buffers` maps [w h] (longs) -> ArrayDeque of {:img BufferedImage :last-used-ms long}, holding STRONG
  references (NOT SoftReference: soft refs only clear at the edge of OOM, the failure mode we're avoiding). Each
  per-size ArrayDeque is guarded by synchronizing on itself; the outer map is a ConcurrentHashMap. `:hits`/`:misses`
  are this pool's own reuse counters."
  ([] (->pool {}))
  ([{:keys [per-size-cap global-cap idle-ttl-ms]
     :or   {per-size-cap default-per-size-cap
            global-cap   default-global-cap
            idle-ttl-ms  default-idle-ttl-ms}}]
   {:buffers      (ConcurrentHashMap.)
    :hits         (LongAdder.)
    :misses       (LongAdder.)
    ;; cumulative hits/misses as of this pool's last [[log-stats!]] call, so the periodic log can report the interval
    ;; since the previous one. Per-pool (not a namespace global) so multiple pools don't clobber each other's baseline.
    :last-logged  (atom {:hits 0 :misses 0})
    :per-size-cap per-size-cap
    :global-cap   global-cap
    :idle-ttl-ms  idle-ttl-ms}))

;; THE pool prod renders use, returned by the [[default-pool]] accessor. It is lazily built (and its sweeper started)
;; on first use, NOT at namespace load -- so AOT compilation, which loads every namespace, doesn't spawn the daemon
;; thread or allocate the pool at build time. The public no-pool arities call [[default-pool]].
(declare default-pool)

(def ^:private new-deque
  (reify Function (apply [_ _] (ArrayDeque.))))

(defn- deque-for ^Deque [pool ^long w ^long h]
  ;; Key coerced to longs so it is type-stable: acquire is called with longs but release reads ints off the image,
  ;; and a Clojure vector key compares elements with Java .equals, where (.equals (long 5) (int 5)) is false.
  (.computeIfAbsent ^ConcurrentHashMap (:buffers pool) [w h] new-deque))

(defn- idle-total
  "Number of idle buffers held across all sizes. Derived by summing deque sizes rather than tracked in a separate
  counter -- a parallel counter is drift-prone (it would diverge from the deques on a partial failure), and with only a
  handful of distinct sizes this scan is cheap."
  ^long [pool]
  (reduce (fn [^long acc ^Deque d] (+ acc (long (locking d (.size d)))))
          0
          (.values ^ConcurrentHashMap (:buffers pool))))

(defn- idle-by-size
  "Map of `[w h]` -> number of idle buffers currently pooled for that size. Sizes with no idle buffers are omitted."
  [pool]
  (into {}
        (keep (fn [^java.util.Map$Entry e]
                (let [^Deque d (.getValue e)
                      n (locking d (.size d))]
                  (when (pos? n) [(vec (.getKey e)) n]))))
        (.entrySet ^ConcurrentHashMap (:buffers pool))))

(mu/defn- clear!
  "Reset every pixel of `img` to fully transparent so a reused buffer never shows the previous render's pixels.
  Load-bearing for correctness, not just hygiene (see ns docstring). Zeroes the backing `int[]` directly -- a
  full-raster wipe needing no `Graphics2D` allocation."
  [img :- (ms/InstanceOfClass BufferedImage)]
  (let [buf (.getDataBuffer (.getRaster ^BufferedImage img))]
    (java.util.Arrays/fill (.getData ^DataBufferInt buf) (int 0))))

(defn acquire
  "Return a cleared `TYPE_INT_ARGB` [[BufferedImage]] of exactly `w` x `h`, reusing an idle pooled buffer of that size
  when one is available, otherwise allocating a fresh one. NEVER blocks and never refuses -- an empty pool just yields a
  new buffer (this is a recycler, not a capacity-limited resource pool). With no pool arg, uses the [[default-pool]].

  Pass the result to [[release]] when finished. The buffer is shared mutable state -- it must not escape the
  rasterization (both render paths PNG-encode it before returning, which is what makes reuse safe)."
  (^BufferedImage [w h] (acquire (default-pool) w h))
  (^BufferedImage [pool ^long w ^long h]
   (let [^Deque d (deque-for pool w h)
         stamped  (locking d (.pollFirst d))]
     (if stamped
       (do (.increment ^LongAdder (:hits pool))
           (doto ^BufferedImage (:img stamped) clear!))
       (do (.increment ^LongAdder (:misses pool))
           (BufferedImage. (int w) (int h) BufferedImage/TYPE_INT_ARGB))))))

(defn release
  "Check `img` back in so it can be recycled, IF doing so keeps idle retention under the pool's per-size and global caps;
  otherwise drop it on the floor (overflow -- GC reclaims it, eagerly once `-XX:G1HeapRegionSize` is large enough that
  the raster isn't humongous). Retaining excess is never an error -- we recycle what we keep and discard the rest.
  Safe to call with `nil`. Never throws for pool-state reasons. With no pool arg, uses the [[default-pool]]."
  ([img] (release (default-pool) img))
  ([pool img]
   (when img
     (let [^BufferedImage img img
           ^Deque d (deque-for pool (.getWidth img) (.getHeight img))
           ;; Read the global total OUTSIDE d's lock: idle-total locks every deque, so checking it while already
           ;; holding one could deadlock against a concurrent release of a different size. A small race here (very
           ;; occasionally retaining one buffer over the cap) is harmless.
           under-global? (< (idle-total pool) (long (:global-cap pool)))]
       (locking d
         (when (and under-global? (< (.size d) (long (:per-size-cap pool))))
           (.addFirst d {:img img :last-used-ms (System/currentTimeMillis)})))))))

(defn sweep!
  "Evict buffers in `pool` idle since before `now-ms` minus the pool's TTL, and remove emptied size-keys, so the
  recycler drains to zero when rendering stops. Each size's deque is newest-first, so we walk it from the oldest (tail)
  end dropping stale entries and stop at the first still-fresh one (everything ahead of it is newer). `now-ms` is
  injectable so tests can fast-forward past the TTL. With no pool arg, sweeps the [[default-pool]] at the real clock."
  ([] (sweep! (default-pool) (System/currentTimeMillis)))
  ([pool] (sweep! pool (System/currentTimeMillis)))
  ([pool now-ms]
   (let [cutoff (- (long now-ms) (long (:idle-ttl-ms pool)))]
     (doseq [^java.util.Map$Entry e (vec (.entrySet ^ConcurrentHashMap (:buffers pool)))]
       (let [^Deque d (.getValue e)]
         (locking d
           ;; Deques hold newest-first (addFirst); drop from the tail (oldest) while stale.
           (while (when-let [stamped (.peekLast d)]
                    (< (long (:last-used-ms stamped)) cutoff))
             (.pollLast d))
           (when (.isEmpty d)
             (.remove ^ConcurrentHashMap (:buffers pool) (.getKey e)))))))))

(defn stats
  "Snapshot of a pool's reuse counters `{:hits n :misses n :idle n :by-size {[w h] n}}`. With no arg, the
  [[default-pool]]. `:by-size` shows which sizes are holding idle buffers -- useful both for prod observability and for
  asserting pool contents in tests."
  ([] (stats (default-pool)))
  ([pool]
   (let [by-size (idle-by-size pool)]
     {:hits    (.sum ^LongAdder (:hits pool))
      :misses  (.sum ^LongAdder (:misses pool))
      :idle    (reduce + 0 (vals by-size))
      :by-size by-size})))

;; --- stats logging (cumulative + interval; periodic, NOT per-send -- a per-send rate is dominated by cold-start) ---

(defn- rate-str [hits misses]
  (let [total (+ hits misses)]
    (format "%d/%d hits (%.1f%%), %d allocs"
            hits total (if (pos? total) (* 100.0 (/ hits (double total))) 0.0) misses)))

(defn log-stats!
  "Log `pool` reuse: the hit rate since this pool's previous [[log-stats!]] call and the cumulative lifetime rate, plus
  idle count. The interval baseline is kept per-pool. No-op for the interval line when nothing was rendered since the
  last call, to avoid noise on idle instances. With no arg, the [[default-pool]]."
  ([] (log-stats! (default-pool)))
  ([pool]
   (let [now  (stats pool)
         prev @(:last-logged pool)
         dh   (- (:hits now) (:hits prev))
         dm   (- (:misses now) (:misses prev))]
     (reset! (:last-logged pool) {:hits (:hits now) :misses (:misses now)})
     (when (pos? (+ dh dm))
       (log/infof "Image buffer reuse (interval): %s; (lifetime): %s; idle buffers: %d"
                  (rate-str dh dm)
                  (rate-str (:hits now) (:misses now))
                  (:idle now))))))

(defn- start-sweeper!
  "Start the daemon thread that maintains `pool`: every `:idle-ttl-ms` it prunes idle buffers and logs reuse, so the
  recycler drains to zero when rendering stops. The task closes over `pool` and feeds that one instance to both
  [[sweep!]] and [[log-stats!]] (so they can never disagree about which pool they're acting on). We don't need Quartz
  here (no clustering/persistence/misfire handling) -- just a process-local timer. Returns the
  [[ScheduledExecutorService]] (daemon, so it never blocks shutdown)."
  ^ScheduledExecutorService [pool]
  (let [exec (Executors/newScheduledThreadPool
              1
              (reify ThreadFactory
                (newThread [_ r]
                  (doto (Thread. ^Runnable r "image-buffer-maintenance")
                    (.setDaemon true)))))]
    (.scheduleWithFixedDelay exec
                             ^Runnable (fn []
                                         (try (sweep! pool) (log-stats! pool)
                                              (catch Throwable e
                                                (log/warn e "Error in image-buffer maintenance"))))
                             (long (:idle-ttl-ms pool)) (long (:idle-ttl-ms pool)) TimeUnit/MILLISECONDS)
    exec))

;; THE pool, built lazily on first use (see [[default-pool]]). A delay so nothing runs at namespace load -- AOT
;; compilation loads every namespace, and we must not allocate the pool or spawn the sweeper thread at build time. The
;; sweeper closes over this exact instance, so it and the maintenance calls can't disagree about which pool they act on.
;; Pools built by [[->pool]] for tests get NO sweeper -- only THE pool does.
(defonce ^:private the-pool
  (delay
    (let [pool (->pool)]
      (start-sweeper! pool)
      pool)))

(defn- default-pool
  "THE process-wide pool, realized (and its sweeper started) on first call."
  []
  @the-pool)
