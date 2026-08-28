(ns metabase.test.data.dataset-store
  "A dataset is test data materialized on a data warehouse, addressed by an opaque id.

  Implementations coordinate concurrent access to a warehouse that is shared by many processes, so
  every operation here is atomic from the caller's perspective. Nothing in this namespace retries,
  waits, polls, or batches -- those capabilities compose on top of it."
  (:require
   [metabase.test.data.interface :as tx]))

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
       (:database-name dbdef)))

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

    Criteria are data so that an implementation may evaluate them on the warehouse; the result is
    the same either way.")

  (touch-dataset! [store dataset-id]
    "Record that `dataset-id` was used now, advancing its `:last-used-at`. Returns nil, and does
    nothing if there is no such dataset.

    Recording use is separate from creating or reading so that a caller decides what counts as a
    use."))
