(ns metabase.util.compress-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress])
  (:import
   (java.io File)
   (java.nio.file Files)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveOutputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorOutputStream)))

(set! *warn-on-reflection* true)

(deftest compress-test
  (testing "tgz/untgz"
    (let [dir     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)
          archive (io/file (str (.getName dir) ".tar.gz"))
          out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)]
      (try
        (spit (io/file dir "one") (mt/random-hash))
        (spit (io/file dir "two") (mt/random-hash))

        (testing "it is indeed a gzip archive"
          (u.compress/tgz dir archive)
          (let [bytes (Files/readAllBytes (.toPath archive))]
            ;; https://www.ietf.org/rfc/rfc1952.txt, section 2.3.1
            (is (= [(unchecked-byte 0x1f) (unchecked-byte 0x8b)]
                   (take 2 bytes)))))

        (testing "uncompressing generates identical folder"
          (u.compress/untgz archive out)
          (is (= (mapv slurp (filter #(.isFile ^File %) (file-seq dir)))
                 (mapv slurp (filter #(.isFile ^File %) (file-seq out))))))

        (finally
          (run! io/delete-file (reverse (file-seq dir)))
          (when (.exists archive)
            (io/delete-file archive))
          (run! io/delete-file (reverse (file-seq out))))))))

(defn- create-tgz
  "Create a tar.gz archive."
  ^File [entry-name ^bytes content]
  (let [archive (File/createTempFile "archive" ".tar.gz")]
    (with-open [tar (-> (io/output-stream archive)
                        (GzipCompressorOutputStream.)
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (let [entry (doto (TarArchiveEntry. ^String entry-name)
                    (.setSize (alength content)))]
        (.putArchiveEntry tar entry)
        (.write tar content)
        (.closeArchiveEntry tar)))
    archive))

(deftest untgz-path-traversal-test
  (testing "untgz rejects tar entries with path traversal"
    (let [content (.getBytes "content" "UTF-8")
          out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)]
      (doseq [file-name ["../../etc/foo" "../escape" "foo/../../escape"]]
        (let [archive (create-tgz file-name content)]
          (try
            (is (thrown? java.io.IOException
                         (u.compress/untgz archive out)))
            (finally
              (io/delete-file archive true)
              (run! #(io/delete-file % true) (reverse (file-seq out))))))))))
