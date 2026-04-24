(ns metabase-enterprise.custom-viz-plugin.test-util
  "Shared helpers for custom-viz-plugin tests: building in-memory tar+gzip
   archives that match the format `validate-bundle!` expects."
  (:require
   [metabase.util.json :as json])
  (:import
   (java.io ByteArrayOutputStream)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveOutputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorOutputStream)))

(set! *warn-on-reflection* true)

(defn ^bytes make-tgz-bytes
  "Build a tar.gz archive in memory from a seq of `[name content]` pairs.
   `content` may be a String or a byte array."
  [entries]
  ;; The gzip/tar streams must be closed (not just finished) before the byte
  ;; array is final — gzip only emits its trailer on close. Keep `baos` out
  ;; of `with-open` so we can still read from it after the streams close.
  (let [baos (ByteArrayOutputStream.)]
    (with-open [gz  (GzipCompressorOutputStream. baos)
                tar (TarArchiveOutputStream. gz)]
      (doseq [[name content] entries
              :let [^bytes bs (if (bytes? content) content (.getBytes (str content) "UTF-8"))
                    entry     (doto (TarArchiveEntry. ^String name)
                                (.setSize (alength bs)))]]
        (.putArchiveEntry tar entry)
        (.write tar bs 0 (alength bs))
        (.closeArchiveEntry tar))
      (.finish tar))
    (.toByteArray baos)))

(defn ^bytes valid-bundle-bytes
  "Build a minimal valid plugin tar.gz archive: manifest at the root with the
   given `identifier` as `name`, a trivial `dist/index.js`, and optional
   `:icon` / `:metabase-version` overrides merged into the manifest."
  [identifier & [{:keys [icon metabase-version]}]]
  (let [manifest (cond-> {:name identifier}
                   icon             (assoc :icon icon)
                   metabase-version (assoc-in [:metabase :version] metabase-version))]
    (make-tgz-bytes
     [["metabase-plugin.json" (json/encode manifest)]
      ["dist/index.js" "console.log('hi')"]])))
