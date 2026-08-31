(ns metabase.test.data.dataset-store
  "A dataset is test data materialized on a data warehouse, addressed by an opaque id.

  Implementations coordinate concurrent access to a warehouse that is shared by many processes, so
  every operation here is atomic from the caller's perspective. Nothing in this namespace retries,
  waits, polls, or batches -- those capabilities compose on top of it."
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.lru-ttl-cache :as lru-ttl]))

(set! *warn-on-reflection* true)

(def id-prefix
  "Prefix borne by every dataset id produced by [[default-dataset-id]].

  Distinguishes datasets governed by a [[DatasetStore]] from those created by any other scheme
  sharing the same warehouse, so the two can coexist without colliding."
  "mbds_")

(defn default-dataset-id
  "Derive a dataset id from `dbdef`, content-addressed so that definitions with equal content share
  one dataset and definitions with differing content never do.

  Naming is caller policy: a caller wanting datasets that are not shared -- because it intends to
  write to them -- supplies its own id instead."
  [dbdef]
  (str id-prefix
       (tx/hash-dataset dbdef)
       "_"
       ;; Normalized here rather than per adapter: BigQuery rejects a dataset id containing anything
       ;; but word characters, and Redshift folds identifiers to lower case regardless.
       (-> (:database-name dbdef) u/lower-case-en (str/replace #"-" "_"))))

(def temp-id-prefix
  "Prefix borne by ids from [[temp-dataset-id]].

  Carries [[id-prefix]] so a store still recognizes these as its own, and says `isolate` so it reads
  like the isolated datasets the older scheme created. Its own prefix is what lets a sweeper find
  abandoned temp datasets with `{:id-prefix temp-id-prefix :created-before ...}` without touching
  the shared ones."
  (str id-prefix "isolate_"))

(defn temp-dataset-id
  "Mint an id no other caller will produce, for a dataset one test alone may see and mutate.

  Random rather than content-addressed on purpose: sharing is the whole point of
  [[default-dataset-id]] and exactly what a temp dataset must not do."
  [dbdef]
  (str temp-id-prefix (str/replace (str (random-uuid)) "-" "") "_" (:database-name dbdef)))

(defn dataset-id-dbdef
  "`dbdef` with its `:database-name` replaced by its own dataset id.

  Every physical name a driver derives -- database, schema, and table alike -- comes from
  `:database-name`, so renaming it at the top of a load is what puts the content hash into all of
  them without threading the definition through name resolution. Idempotent, since the id is itself
  a database name that must hash to itself."
  [dbdef]
  (if (str/starts-with? (:database-name dbdef) id-prefix)
    dbdef
    (assoc dbdef :database-name (default-dataset-id dbdef))))

(defprotocol DatasetStore
  "Create, delete, and enumerate datasets on a warehouse shared by concurrent, mutually unaware
  processes.

  Exactly one caller may materialize a given dataset at a time. An implementation enforces this with
  a claim that is visible to every process reaching the same warehouse, and reclaims a claim whose
  lease has expired so that a caller which died mid-write cannot block the dataset forever.
  Reclamation happens inside [[create-dataset!]]: callers never decide whether a claim holder is
  still alive.

  A dataset must not be reported `:ready` until it is completely written, so a reclaimed lease costs
  duplicated work rather than a partially written dataset."
  (create-dataset! [store dataset-id dbdef]
    "Idempotently materialize `dbdef` as the dataset named by `dataset-id`. Returns:

      :created     -- this call materialized it; the dataset is now :ready
      :exists      -- already present and :ready; this call did nothing
      :in-progress -- another caller holds the claim; this call did nothing

    Concurrent calls for one `dataset-id` yield exactly one `:created`.")

  (delete-dataset! [store dataset-id]
    "Delete the dataset named by `dataset-id`. Returns:

      :deleted     -- it existed and is now gone
      :absent      -- no such dataset; this call did nothing
      :in-progress -- another caller holds the claim; the dataset was NOT deleted

    Refusing to delete a claimed dataset is what makes deletion safe to run concurrently with
    materialization.")

  (describe-dataset [store dataset-id]
    "Return a descriptor for `dataset-id`, or nil if there is no such dataset.

      {:id           the dataset id
       :state        :ready or :loading
       :created-at   when the dataset was first claimed
       :last-used-at when use was last recorded}

    `:loading` reports that a claim is held, not that its holder is alive.")

  (list-datasets [store criteria]
    "Return a sequence of descriptors, shaped as in [[describe-dataset]], for the datasets matching
    `criteria`. `{}` matches every dataset. Recognized keys, all optional, ANDed together:

      :id-prefix        id starts with this string
      :state            :ready or :loading
      :created-before   created strictly before this instant
      :last-used-before use last recorded strictly before this instant
      :used-within-seconds  use recorded within this many seconds of now. Expressed as a duration
                            rather than an instant so the warehouse computes the cutoff against its
                            own clock, which is the only clock every caller agrees on.

    Criteria are data so that an implementation may evaluate them on the warehouse; the result is
    the same either way.")

  (create-temp-isolated-dataset! [store dbdef]
    "Materialize `dbdef` as a brand new dataset that no other caller shares, and return its id.

    For tests that must mutate their data, or that need data generated at the moment they run. There
    is no claim and no idempotence: the id is freshly minted, so nobody else can be creating it and
    calling this twice gives two datasets.

    The caller owns the result and is expected to delete it -- see [[with-temp-dataset]]. An
    implementation may also arrange for the warehouse to expire it, but nothing here assumes the
    warehouse can.")

  (touch-dataset! [store dataset-id]
    "Record that `dataset-id` was used now, advancing its `:last-used-at`. Returns nil, and does
    nothing if there is no such dataset.

    Recording use is separate from creating or reading so that a caller decides what counts as a
    use."))

(defn create-dataset-and-wait!
  "Materialize `dbdef` as `dataset-id`, waiting out any caller that holds the claim.

  Retrying and waiting are deliberately absent from [[DatasetStore]]; this is that policy, composed
  over it. Returns `:created` or `:exists`, or throws if the dataset does not become usable within
  `:timeout-ms`."
  [store dataset-id dbdef {:keys [timeout-ms poll-ms] :or {timeout-ms 1800000, poll-ms 2000}}]
  (let [result (dh/with-retry {:retry-when      :in-progress
                               :delay-ms        poll-ms
                               :max-duration-ms timeout-ms
                               ;; Without a fallback, an exhausted value-based retry surfaces as a
                               ;; Failsafe exception; this keeps exhaustion an ordinary value so the
                               ;; error below is the one a caller sees.
                               :fallback        (fn [_ _] :in-progress)}
                 (create-dataset! store dataset-id dbdef))]
    (if (= :in-progress result)
      (throw (ex-info "Timed out waiting for another caller to finish creating a dataset"
                      {:dataset-id dataset-id, :timeout-ms timeout-ms}))
      result)))

(def ^:private touch-window-seconds
  "How stale a dataset's recorded use may be before recording another is worth a round trip.

  Recording a use is by far the most frequent write a store makes -- one per dataset per process,
  every process -- and they all land on the same place. An hour is far below any reaping window, so
  suppressing repeats inside it costs nothing that matters."
  3600)

(def ^:private seen-dataset-ttl-ms
  "How long this JVM trusts its own memory of a dataset being present.

  Shared datasets outlive a test run by a wide margin, so an hour is far below the window in which
  the answer could change."
  (* 60 60 1000))

;; The effects below live in the `reify`'s methods and run only when those are called, so this
;; constructor needs no `!`; the linter does not model that deferral.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn caching-dataset-store
  "Wrap `store` so a dataset this process has already seen created or present costs no round trip to
  ask about again.

  Only `:created` and `:exists` are remembered: `:in-progress` is by definition about to change, and
  a thrown error must not be cached at all. `delete-dataset!` forgets the dataset first, so
  delete-then-create behaves.

  The memory can be wrong -- something could reap a dataset after this process saw it. That costs a
  failed test run and a retry, which is cheaper than a round trip on every dataset in every test."
  ([store]
   (caching-dataset-store store {}))
  ([store {:keys [ttl-ms threshold]}]
   (let [seen    (lru-ttl/cache {:ttl-ms     (or ttl-ms seen-dataset-ttl-ms)
                                 :threshold  threshold
                                 :cache-when #{:created :exists}})
         touched (lru-ttl/cache {:ttl-ms (* 1000 touch-window-seconds), :threshold threshold})
         ;; Read once per process, from the store rather than from local history: the point is to
         ;; skip a write some *other* process already made. A local cache alone would not, since a
         ;; process touches each dataset about once anyway.
         touched-elsewhere (delay (into #{}
                                        (map :id)
                                        (list-datasets store {:used-within-seconds touch-window-seconds})))]
     (reify DatasetStore
       (create-dataset! [_this dataset-id dbdef]
         (lru-ttl/get-or-compute! seen dataset-id #(create-dataset! store dataset-id dbdef)))

       (delete-dataset! [_this dataset-id]
         (lru-ttl/evict! seen dataset-id)
         (delete-dataset! store dataset-id))

       ;; A temp dataset is new every time, so there is nothing to remember.
       (create-temp-isolated-dataset! [_this dbdef] (create-temp-isolated-dataset! store dbdef))

       ;; Reads report live state, so neither is cached.
       (describe-dataset [_this dataset-id]     (describe-dataset store dataset-id))
       (list-datasets    [_this criteria]       (list-datasets store criteria))
       (touch-dataset! [_this dataset-id]
         (when-not (contains? @touched-elsewhere dataset-id)
           (lru-ttl/get-or-compute! touched dataset-id #(touch-dataset! store dataset-id)))
         nil)))))

(defmacro with-temp-dataset
  "Create a temp isolated dataset from `dbdef`, bind its id to `id-binding`, and delete it when
  `body` finishes or throws.

  Deleting here rather than leaving it to a sweeper is deliberate: a test that cleans up after
  itself keeps the warehouse small without anyone having to run anything on a schedule.

    (with-temp-dataset [dataset-id [store dbdef]]
      ...)"
  [[id-binding [store dbdef]] & body]
  `(let [store# ~store
         id#    (create-temp-isolated-dataset! store# ~dbdef)]
     (try
       (let [~id-binding id#]
         ~@body)
       (finally
         (delete-dataset! store# id#)))))
