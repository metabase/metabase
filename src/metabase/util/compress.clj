(ns metabase.util.compress
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io ByteArrayOutputStream File OutputStream)
   (java.util.zip Deflater)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveInputStream TarArchiveOutputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorInputStream GzipCompressorOutputStream GzipParameters)))

(set! *warn-on-reflection* true)

(defn entries
  "Tar file entries as a lazy sequence."
  [^TarArchiveInputStream tar]
  (lazy-seq
   (when-let [entry (.getNextEntry tar)]
     (cons entry (entries tar)))))

(defn tar-input-stream
  "Open a `TarArchiveInputStream` over a tar+gzip `source`. `source` can be
  anything `io/input-stream` coerces — a `File`, a byte array, a raw
  `InputStream`. The caller is responsible for closing the returned stream."
  ^TarArchiveInputStream [source]
  (-> (io/input-stream source)
      (GzipCompressorInputStream.)
      (TarArchiveInputStream.)))

(defn tgz
  "Compress directory `src` to a tar+gzip file `dst`."
  [^File src ^File dst]
  (when-not (.exists src)
    (throw (ex-info (format "Path is not readable or does not exist: %s" src)
                    {:path src})))
  (let [prefix (.getPath (.getParentFile src))]
    (with-open [tar (-> (io/output-stream dst)
                        (GzipCompressorOutputStream. (doto (GzipParameters.)
                                                       (.setModificationTime (System/currentTimeMillis))))
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (.setLongFileMode tar TarArchiveOutputStream/LONGFILE_POSIX)
      (.setBigNumberMode tar TarArchiveOutputStream/BIGNUMBER_POSIX)
      (doseq [^File f (file-seq src)
              :let    [path-in-tar (subs (.getPath f) (count prefix))
                       entry (TarArchiveEntry. f path-in-tar)]]
        (.putArchiveEntry tar entry)
        (when (.isFile f)
          (with-open [s (io/input-stream f)]
            (io/copy s tar)))
        (.closeArchiveEntry tar)))
    dst))

(defn- check-entry-name!
  "Reject unsafe or ambiguous archive paths."
  [^String entry-name]
  (when (or (str/starts-with? entry-name "/")
            (str/includes? entry-name "\\")
            (some #{"" "." ".."} (str/split entry-name #"/" -1)))
    (throw (ex-info (format "Archive entry has an invalid path: %s" entry-name)
                    {:status-code 400 :path entry-name}))))

(defn tgz-bytes
  "Pack a path-to-bytes map into deterministic tar+gzip bytes with maximum compression."
  ^bytes [files]
  (let [baos (ByteArrayOutputStream.)]
    (with-open [tar (-> baos
                        (GzipCompressorOutputStream. (doto (GzipParameters.)
                                                       (.setCompressionLevel Deflater/BEST_COMPRESSION)))
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (.setLongFileMode tar TarArchiveOutputStream/LONGFILE_POSIX)
      (.setBigNumberMode tar TarArchiveOutputStream/BIGNUMBER_POSIX)
      (doseq [[^String path ^bytes content] (sort-by key files)
              :let [entry (doto (TarArchiveEntry. path)
                            (.setSize (alength content))
                            (.setModTime 0)
                            (.setMode 0644))]]
        (check-entry-name! path)
        (.putArchiveEntry tar entry)
        (.write tar content)
        (.closeArchiveEntry tar)))
    (.toByteArray baos)))

(defn- copy-tar-entry!
  "Stream the current tar entry into `out`, returning the new running total of
   uncompressed bytes seen so far. Throws ex-info as soon as the running total
   would exceed `max-bytes` (when set), so a tar bomb cannot exhaust disk."
  ^long [^TarArchiveInputStream tar ^OutputStream out ^long start-total max-bytes]
  (let [buf (byte-array 8192)]
    (loop [total start-total]
      (let [n (.read tar buf)]
        (if (pos? n)
          (let [next-total (+ total n)]
            (when (and max-bytes (> next-total ^long max-bytes))
              (throw (ex-info (format "Archive expands beyond max uncompressed bytes (%d)" max-bytes)
                              {:status-code 400 :max-uncompressed-bytes max-bytes})))
            (.write out buf 0 n)
            (recur next-total))
          total)))))

(defn- regular-file?
  "Identify regular files, excluding links, FIFOs and devices."
  [^TarArchiveEntry e]
  (and (.isFile e)
       (not (.isSymbolicLink e))
       (not (.isLink e))
       (not (.isFIFO e))
       (not (.isCharacterDevice e))
       (not (.isBlockDevice e))))

(defn- reduce-tar-entries
  "Reduce non-hidden entries with shared extraction limits and a bounded content copier."
  [archive {:keys [max-uncompressed-bytes max-entries]} f init]
  (with-open [tar (tar-input-stream archive)]
    (let [total-bytes (volatile! 0)
          copy!       (fn [out]
                        (vreset! total-bytes (copy-tar-entry! tar out @total-bytes max-uncompressed-bytes)))]
      (loop [result init entry-count 0]
        (if-let [^TarArchiveEntry entry (.getNextEntry tar)]
          (if (str/starts-with? (last (.split (.getName entry) "/")) ".")
            (recur result entry-count)
            (let [next-count (inc entry-count)]
              (when (and max-entries (> next-count ^long max-entries))
                (throw (ex-info (format "Archive exceeds max entries (%d)" max-entries)
                                {:status-code 400 :max-entries max-entries})))
              (recur (f result entry copy!) next-count)))
          {:result result :entry-count entry-count})))))

(defn untgz
  "Extract tar+gzip to disk, skipping hidden and special entries. Return the non-hidden entry count.
  Accepts any `io/input-stream` source. Optional `:max-uncompressed-bytes` and `:max-entries` limit extraction."
  ([archive ^File dst]
   (untgz archive dst nil))
  ([archive ^File dst opts]
   (let [dst-path (.toPath dst)]
     (:entry-count
      (reduce-tar-entries
       archive opts
       (fn [_ ^TarArchiveEntry entry copy!]
         (let [file (.toFile (.resolveIn entry dst-path))]
           (cond
             (regular-file? entry)
             (do (io/make-parents file)
                 (with-open [out (io/output-stream file)]
                   (copy! out)))

             (.isDirectory entry)
             (.mkdirs file))))
       nil)))))

(defn untgz-files
  "Read tar+gzip into a path-to-bytes map, normalizing dot segments and rejecting unsafe paths.
  Skip hidden and special entries. Accepts the same sources and limits as [[untgz]]."
  ([archive]
   (untgz-files archive nil))
  ([archive opts]
   (:result
    (reduce-tar-entries
     archive opts
     (fn [files ^TarArchiveEntry entry copy!]
       (if (regular-file? entry)
         (let [path (str/join "/" (remove #{"."} (str/split (.getName entry) #"/" -1)))
               out  (ByteArrayOutputStream.)]
           (check-entry-name! path)
           (copy! out)
           (assoc files path (.toByteArray out)))
         files))
     {}))))
