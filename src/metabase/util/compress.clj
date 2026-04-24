(ns metabase.util.compress
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io File)
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

(defn untgz
  "Uncompress tar+gzip `archive` into directory `dst`.

  `archive` can be anything `io/input-stream` coerces — a `File`, a byte array,
  or a raw `InputStream`. Skips hidden entries. Returns the number of unpacked
  entries (files + dirs)."
  [archive ^File dst]
  (with-open [tar (tar-input-stream archive)]
    (let [dst-path (.toPath dst)]
      (count
       (for [^TarArchiveEntry e (entries tar)
             :let [actual-name (last (.split (.getName e) "/"))]
             ;; skip hidden files
             :when (not (str/starts-with? actual-name "."))]
         (let [f (.toFile (.resolveIn e dst-path))]
           (if (.isFile e)
             (do (io/make-parents f)
                 (io/copy tar f))
             (.mkdirs f))
           true))))))
