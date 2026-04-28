(ns metabase.warehouses-rest.metadata-file-import.id-map
  "Disk-spooled `(source_id → target_id)` ID map for the metadata file importer.

   Records are 8-byte packed longs: `(src << 32) | (tgt & 0xFFFFFFFFL)`. The on-disk
   layout is a flat array of these records, sorted by src ascending. Lookups use a
   custom binary search over the high 32 bits on a memory-mapped LongBuffer view —
   so the full 10M-entry map never lives in JVM heap.

   New entries accumulate in an in-heap ArrayList during a phase-3 pass, and merge
   into the file at end-of-pass via `commit-pass!`. See METADATA_FILE_IMPORT_PLAN.md
   §11a for design rationale and lifecycle."
  (:import
   (java.io File RandomAccessFile)
   (java.nio ByteOrder LongBuffer MappedByteBuffer)
   (java.nio.channels FileChannel FileChannel$MapMode)
   (java.util ArrayList Arrays)))

(set! *warn-on-reflection* true)

(defn- pack-record ^long [^long src ^long tgt]
  (bit-or (bit-shift-left src 32) (bit-and tgt 0xFFFFFFFF)))

(defprotocol ^:private IdMapOps
  (-get-target [this src])
  (-append! [this src tgt])
  (-commit-pass! [this])
  (-size [this])
  (-close! [this])
  (-file [this]))

(deftype IdMap
         [^File file
          ^:unsynchronized-mutable ^RandomAccessFile raf
          ^:unsynchronized-mutable ^FileChannel channel
          ^:unsynchronized-mutable ^MappedByteBuffer mbb
          ^:unsynchronized-mutable ^LongBuffer lbuf
          ^:unsynchronized-mutable ^long size
          ^ArrayList buffer
          ^:unsynchronized-mutable closed?]

  IdMapOps

  (-file [_] file)
  (-size [_] size)

  (-get-target [_ src]
    (when closed?
      (throw (IllegalStateException. "id-map handle is closed")))
    (if (or (zero? size) (nil? lbuf))
      -1
      (let [src* (long src)
            n    (long size)]
        (loop [lo 0 hi n]
          (if (< lo hi)
            (let [mid     (bit-shift-right (+ lo hi) 1)
                  packed  (.get lbuf (int mid))
                  src-mid (unsigned-bit-shift-right packed 32)]
              (if (< src-mid src*)
                (recur (inc mid) hi)
                (recur lo mid)))
            (if (and (< lo n)
                     (= src* (unsigned-bit-shift-right (.get lbuf (int lo)) 32)))
              (bit-and (.get lbuf (int lo)) 0xFFFFFFFF)
              -1))))))

  (-append! [_ src tgt]
    (when closed?
      (throw (IllegalStateException. "id-map handle is closed")))
    (.add buffer (Long/valueOf (pack-record src tgt))))

  (-commit-pass! [_]
    (when closed?
      (throw (IllegalStateException. "id-map handle is closed")))
    (let [n-buffered (.size buffer)]
      (when (pos? n-buffered)
        (let [n-old    (long size)
              n-new    (+ n-old n-buffered)
              combined (long-array n-new)]
          (when (and (pos? n-old) (some? lbuf))
            (.position ^LongBuffer lbuf 0)
            (.get ^LongBuffer lbuf combined 0 (int n-old)))
          (dotimes [i n-buffered]
            (aset combined (+ n-old i) (long (.get buffer i))))
          (Arrays/sort combined)
          (set! mbb nil)
          (set! lbuf nil)
          (let [new-bytes (* n-new 8)]
            (.setLength raf new-bytes)
            (let [^MappedByteBuffer new-mbb (.map channel
                                                  FileChannel$MapMode/READ_WRITE
                                                  0 new-bytes)]
              (.order new-mbb (ByteOrder/nativeOrder))
              (let [^LongBuffer new-lbuf (.asLongBuffer new-mbb)]
                (.put new-lbuf combined 0 n-new)
                (.force new-mbb)
                (set! mbb new-mbb)
                (set! lbuf new-lbuf))))
          (set! size n-new)
          (.clear buffer)))))

  (-close! [_]
    (when-not closed?
      (set! closed? true)
      (set! mbb nil)
      (set! lbuf nil)
      (when channel
        (try (.close channel) (catch Throwable _))
        (set! channel nil))
      (when raf
        (try (.close raf) (catch Throwable _))
        (set! raf nil))
      (try (.delete file) (catch Throwable _)))))

(defn create!
  "Allocates a fresh, empty id-map handle backed by a temp file in the system
   temp dir. Caller must `close!` the handle to release resources and delete the
   file — wrap usage in `try/finally`."
  ^IdMap []
  (let [f       (File/createTempFile "mb-import-fld-map-" ".bin")
        raf     (RandomAccessFile. f "rw")
        channel (.getChannel raf)
        buf     (ArrayList.)]
    (->IdMap f raf channel nil nil 0 buf false)))

(defn get-target
  "Returns the target id for `src`, or -1 if not in the map. Throws if the handle
   is closed. Hot path during phase-3 walks."
  ^long [^IdMap m ^long src]
  (-get-target m src))

(defn append!
  "Adds `(src, tgt)` to the in-pass heap buffer. Not visible to lookups until
   `commit-pass!`. Caller must not append a `src` already in the map or buffer
   — no dedupe is performed."
  [^IdMap m ^long src ^long tgt]
  (-append! m src tgt))

(defn commit-pass!
  "Flushes the in-pass buffer to the backing file: merge with existing records,
   sort, re-mmap. After return, all appended pairs are visible. No-op if the
   buffer is empty."
  [^IdMap m]
  (-commit-pass! m))

(defn size
  "Number of committed records (excludes pending in-pass buffer)."
  ^long [^IdMap m]
  (-size m))

(defn file
  "The backing temp `File`. For diagnostics and tests."
  ^File [^IdMap m]
  (-file m))

(defn close!
  "Releases resources and deletes the temp file. Idempotent."
  [^IdMap m]
  (-close! m))
