(ns metabase.util.compress
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io File OutputStream)
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

(defn untgz
  "Uncompress tar+gzip `archive` into directory `dst`.

  `archive` can be anything `io/input-stream` coerces — a `File`, a byte array,
  or a raw `InputStream`. Skips hidden entries. Returns the number of unpacked
  entries (files + dirs).

  Optional `opts` (default unset, no behavior change):
  - `:max-uncompressed-bytes` — abort with ex-info when total extracted bytes
    would exceed this. Defends against tar bombs.
  - `:max-entries` — abort with ex-info when entry count would exceed this."
  ([archive ^File dst]
   (untgz archive dst nil))
  ([archive ^File dst {:keys [max-uncompressed-bytes max-entries]}]
   (with-open [tar (tar-input-stream archive)]
     (let [dst-path (.toPath dst)]
       (loop [entry-count 0 total-bytes 0]
         (if-let [^TarArchiveEntry e (.getNextEntry tar)]
           (let [actual-name (last (.split (.getName e) "/"))]
             (if (str/starts-with? actual-name ".")
               (recur entry-count total-bytes)
               (let [next-count (inc entry-count)
                     _          (when (and max-entries (> next-count ^long max-entries))
                                  (throw (ex-info (format "Archive exceeds max entries (%d)" max-entries)
                                                  {:status-code 400 :max-entries max-entries})))
                     f          (.toFile (.resolveIn e dst-path))
                     next-total (long (if (.isFile e)
                                        (do (io/make-parents f)
                                            (with-open [out (io/output-stream f)]
                                              (copy-tar-entry! tar out total-bytes max-uncompressed-bytes)))
                                        (do (.mkdirs f) total-bytes)))]
                 (recur next-count next-total))))
           entry-count))))))
