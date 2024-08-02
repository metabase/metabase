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
  "Uncompress tar+gzip file `archive` to a directory `dst`.
  Skips hidden entries, returns number of unpacked entries (files + dirs)."
  [^File archive ^File dst]
  (with-open [tar (-> (io/input-stream archive)
                      (GzipCompressorInputStream.)
                      (TarArchiveInputStream.))]
    (let [tar-entries (entries tar)]
      (count
       (for [^TarArchiveEntry e tar-entries
             :let [actual-name (last (.split (.getName e) "/"))]
             ;; skip hidden files
             :when (not (str/starts-with? actual-name "."))]
         (let [f (io/file dst (.getName e))]
           (if (.isFile e)
             (io/copy tar f)
             (.mkdirs f))
           true))))))
